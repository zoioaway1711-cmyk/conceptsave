import { env } from "cloudflare:workers";
import { isSameOrigin, readBody, sessionLoginSchema } from "@/lib/api-validation";
import { customerCookie, customerId } from "@/lib/customer-auth";
import { database, getProfile, getProfileWithLicenses } from "@/lib/customer-profile";
import { claimLicense, findLicenseByInput, effectiveStatus, recalculatePoints } from "@/lib/licenses";
import { approximateLocation, describeDevice, recordLiveEvent } from "@/lib/live-events";
import { touchPresence } from "@/lib/presence";
import { clientIp, enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  if (!(env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET) return Response.json({ error: "session_environment_not_configured" }, { status: 503 });
  const db = database();
  const ip = clientIp(request);
  const location = approximateLocation(request);
  const device = describeDevice(request.headers.get("user-agent"));
  // At 80 bits of entropy the serial itself can't be brute-forced, but rate
  // limiting login attempts is still cheap defense-in-depth and slows any
  // credential-stuffing-style automation.
  const limit = await enforceRateLimits(db, "customer_login", ip, [
    { limit: 10, windowSeconds: 60 },
    { limit: 30, windowSeconds: 3600 },
  ]);
  if (!limit.allowed) {
    await recordLiveEvent(db, { type: "RATE_LIMITED", severity: "warning", ip, ...location, device, reason: "customer_login" });
    return rateLimitResponse(limit);
  }
  const body = await readBody(request, sessionLoginSchema);
  if (!body) return Response.json({ error: "invalid_serial" }, { status: 400 });

  const license = await findLicenseByInput(db, body.serial);
  if (!license) {
    await recordLiveEvent(db, { type: "INVALID_SERIAL", severity: "warning", ip, ...location, device, reason: "not_found" });
    return Response.json({ error: "invalid_serial" }, { status: 401 });
  }
  const status = effectiveStatus(license);
  if (status !== "active") {
    await recordLiveEvent(db, { type: status === "revoked" ? "LICENSE_REVOKED" : "LICENSE_EXPIRED", severity: "warning", licenseId: license.id, materialId: license.materialId, ip, ...location, device, reason: `login_attempt_${status}` });
    return Response.json({ error: "invalid_serial" }, { status: 401 });
  }

  const now = new Date().toISOString();
  let profileId = license.ownerProfileId;
  if (!profileId) {
    const candidateId = `cus_${crypto.randomUUID()}`;
    const claimed = await claimLicense(db, license.id, candidateId, now);
    if (claimed) {
      await db.prepare("INSERT INTO customer_profiles (id, first_seen, last_active, last_seen_at) VALUES (?, ?, ?, ?)").bind(candidateId, now, now, now).run();
      profileId = candidateId;
      await recalculatePoints(db, profileId, now);
      await recordLiveEvent(db, { type: "LICENSE_ACTIVATED", actorProfileId: profileId, materialId: license.materialId, licenseId: license.id, ip, ...location, device });
    } else {
      // Lost a claim race, or the license changed state between our read
      // and the write — re-resolve from the DB rather than trust our stale copy.
      const fresh = await findLicenseByInput(db, body.serial);
      if (!fresh || effectiveStatus(fresh) !== "active" || !fresh.ownerProfileId) {
        await recordLiveEvent(db, { type: "ACTIVATION_REJECTED", severity: "warning", licenseId: license.id, ip, ...location, device });
        return Response.json({ error: "invalid_serial" }, { status: 401 });
      }
      profileId = fresh.ownerProfileId;
    }
  }

  const profile = await getProfile(profileId);
  if (!profile || profile.blocked) return Response.json({ error: "profile_blocked" }, { status: 403 });
  await touchPresence(db, profileId, now);
  await db.prepare("UPDATE customer_profiles SET last_active=? WHERE id=?").bind(now, profileId).run();
  await recordLiveEvent(db, { type: "USER_LOGIN", actorProfileId: profileId, ip, ...location, device });
  return Response.json({ authenticated: true, profile: await getProfileWithLicenses(profileId) }, { headers: { "cache-control": "no-store", "set-cookie": `vf_customer=${await customerCookie(profileId)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` } });
}
export async function DELETE(request: Request) {
  const db = database();
  const profileId = await customerId(request);
  if (profileId) await recordLiveEvent(db, { type: "USER_LOGOUT", actorProfileId: profileId, ip: clientIp(request) });
  return Response.json({ authenticated: false }, { headers: { "set-cookie": "vf_customer=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0", "cache-control": "no-store" } });
}
