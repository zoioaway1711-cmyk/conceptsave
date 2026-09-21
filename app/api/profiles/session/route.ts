import { env } from "cloudflare:workers";
import { isSameOrigin, readBody, sessionLoginSchema } from "@/lib/api-validation";
import { CUSTOMER_SESSION_MAX_AGE_SECONDS, customerCookie, customerId } from "@/lib/customer-auth";
import { database, getProfile, getProfileWithLicenses, resolveMergedProfileId } from "@/lib/customer-profile";
import { claimLicense, countActiveLicensesForOwner, findLicenseByInput, effectiveStatus, recalculatePoints } from "@/lib/licenses";
import { approximateLocation, describeDevice, deviceFingerprint, geoSignal, recordLiveEvent } from "@/lib/live-events";
import { getMaterial } from "@/lib/materials";
import { notifyNewCustomerFirstAccess } from "@/lib/alerts";
import { touchPresence } from "@/lib/presence";
import { clientIp, enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  if (!(env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET) return Response.json({ error: "session_environment_not_configured" }, { status: 503 });
  const db = database();
  const ip = clientIp(request);
  const location = approximateLocation(request);
  const device = describeDevice(request.headers.get("user-agent"));
  const fingerprint = deviceFingerprint(request);
  const geo = geoSignal(request);
  // At 80 bits of entropy the serial itself can't be brute-forced, but rate
  // limiting login attempts is still cheap defense-in-depth and slows any
  // credential-stuffing-style automation.
  const limit = await enforceRateLimits(db, "customer_login", ip, [
    { limit: 10, windowSeconds: 60 },
    { limit: 30, windowSeconds: 3600 },
  ]);
  if (!limit.allowed) {
    await recordLiveEvent(db, { type: "RATE_LIMITED", severity: "warning", ip, ...location, device, deviceFingerprint: fingerprint, ...geo, reason: "customer_login" });
    return rateLimitResponse(limit);
  }
  // Second, looser limit keyed by device instead of IP — catches the same
  // device cycling through many IPs/VPNs, which the IP-scoped limit above
  // can't see. Looser on purpose: unlike an IP, two unrelated real visitors
  // with very similar hardware/OS can legitimately hash to the same
  // fingerprint, so this should slow down automation, not lock people out.
  if (fingerprint) {
    const deviceLimit = await enforceRateLimits(db, "customer_login_device", fingerprint, [
      { limit: 15, windowSeconds: 60 },
      { limit: 50, windowSeconds: 3600 },
    ]);
    if (!deviceLimit.allowed) {
      await recordLiveEvent(db, { type: "RATE_LIMITED", severity: "warning", ip, ...location, device, deviceFingerprint: fingerprint, ...geo, reason: "customer_login_device" });
      return rateLimitResponse(deviceLimit);
    }
  }
  const body = await readBody(request, sessionLoginSchema);
  if (!body) return Response.json({ error: "invalid_serial" }, { status: 400 });

  const license = await findLicenseByInput(db, body.serial);
  if (!license) {
    await recordLiveEvent(db, { type: "INVALID_SERIAL", severity: "warning", ip, ...location, device, deviceFingerprint: fingerprint, ...geo, reason: "not_found" });
    return Response.json({ error: "invalid_serial" }, { status: 401 });
  }
  const status = effectiveStatus(license);
  if (status !== "active") {
    await recordLiveEvent(db, { type: status === "revoked" ? "LICENSE_REVOKED" : "LICENSE_EXPIRED", severity: "warning", licenseId: license.id, materialId: license.materialId, ip, ...location, device, deviceFingerprint: fingerprint, ...geo, reason: `login_attempt_${status}` });
    return Response.json({ error: "invalid_serial" }, { status: 401 });
  }

  // Single-use on purpose: a serial logs someone in exactly once, to claim
  // the license into a profile. From then on the row stays in `licenses`
  // (an admin can always trace it back to that profile — see the "Plan &
  // license" section of the User Inspector) but it never again works as a
  // login credential, even for its own owner — otherwise the serial
  // printed on the physical packaging would double as a permanent,
  // unrevocable password to that customer's account for anyone who later
  // handles the product (a reseller, a courier, a family member). Ongoing
  // access after the first activation is the long-lived session cookie
  // alone (see lib/customer-auth.ts) — there is no "log back in with the
  // serial" path once it's claimed.
  if (license.ownerProfileId) {
    await recordLiveEvent(db, { type: "ACTIVATION_REJECTED", severity: "warning", licenseId: license.id, materialId: license.materialId, ip, ...location, device, deviceFingerprint: fingerprint, ...geo, reason: "serial_already_used" });
    return Response.json({ error: "serial_already_used" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const candidateId = `cus_${crypto.randomUUID()}`;
  const claimed = await claimLicense(db, license.id, candidateId, now);
  let profileId: string;
  if (claimed) {
    await db.prepare("INSERT INTO customer_profiles (id, first_seen, last_active, last_seen_at) VALUES (?, ?, ?, ?)").bind(candidateId, now, now, now).run();
    profileId = candidateId;
    await recalculatePoints(db, profileId, now);
    await recordLiveEvent(db, { type: "LICENSE_ACTIVATED", actorProfileId: profileId, materialId: license.materialId, licenseId: license.id, ip, ...location, device, deviceFingerprint: fingerprint, ...geo });
    const material = await getMaterial(db, license.materialId);
    const activeLicenseCount = await countActiveLicensesForOwner(db, profileId);
    await notifyNewCustomerFirstAccess(db, { profileId, materialName: material?.name ?? `material #${license.materialId}`, activeLicenseCount, firstSeen: now, ip });
  } else {
    // Lost a narrow race against a duplicate submit of this same request
    // (e.g. a double-tap) — re-resolve from the DB rather than trust our
    // stale copy, and let this one specific case through as a courtesy
    // instead of bouncing the very person who just claimed it with a
    // confusing "already used". Anyone else hitting this same path a
    // moment later still gets rejected by the check above.
    const fresh = await findLicenseByInput(db, body.serial);
    if (!fresh || effectiveStatus(fresh) !== "active" || !fresh.ownerProfileId) {
      await recordLiveEvent(db, { type: "ACTIVATION_REJECTED", severity: "warning", licenseId: license.id, ip, ...location, device, deviceFingerprint: fingerprint, ...geo });
      return Response.json({ error: "invalid_serial" }, { status: 401 });
    }
    profileId = fresh.ownerProfileId;
  }

  const profile = await getProfile(profileId);
  if (!profile || profile.blocked) return Response.json({ error: "profile_blocked" }, { status: 403 });
  await touchPresence(db, profileId, now);
  await db.prepare("UPDATE customer_profiles SET last_active=? WHERE id=?").bind(now, profileId).run();
  await recordLiveEvent(db, { type: "USER_LOGIN", actorProfileId: profileId, ip, ...location, device, deviceFingerprint: fingerprint, ...geo });
  return Response.json({ authenticated: true, profile: await getProfileWithLicenses(profileId) }, { headers: { "cache-control": "no-store", "set-cookie": `vf_customer=${await customerCookie(profileId)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${CUSTOMER_SESSION_MAX_AGE_SECONDS}` } });
}
export async function DELETE(request: Request) {
  const db = database();
  const rawId = await customerId(request);
  const profileId = rawId ? await resolveMergedProfileId(rawId) : null;
  if (profileId) await recordLiveEvent(db, { type: "USER_LOGOUT", actorProfileId: profileId, ip: clientIp(request) });
  return Response.json({ authenticated: false }, { headers: { "set-cookie": "vf_customer=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0", "cache-control": "no-store" } });
}
