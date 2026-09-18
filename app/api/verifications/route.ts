import { isSameOrigin, licenseCheckSchema, readBody } from "@/lib/api-validation";
import { customerId } from "@/lib/customer-auth";
import { database, getProfile, getProfileWithLicenses } from "@/lib/customer-profile";
import { claimLicense, effectiveStatus, findLicenseByInput, recalculatePoints } from "@/lib/licenses";
import { getMaterial } from "@/lib/materials";
import { approximateLocation, describeDevice, recordLiveEvent } from "@/lib/live-events";
import { touchPresence } from "@/lib/presence";
import { clientIp, enforceRateLimits, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const profileId = await customerId(request);
  if (!profileId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = database();
  const limit = await enforceRateLimits(db, "verification_submit", `${clientIp(request)}:${profileId}`, [
    { limit: 20, windowSeconds: 60 },
  ]);
  if (!limit.allowed) {
    await recordLiveEvent(db, { type: "RATE_LIMITED", severity: "warning", actorProfileId: profileId, ip: clientIp(request), reason: "verification_submit" });
    return rateLimitResponse(limit);
  }
  const body = await readBody(request, licenseCheckSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  if (body.profileId !== "anonymous" && body.profileId !== profileId) return Response.json({ error: "forbidden" }, { status: 403 });
  const profile = await getProfile(profileId);
  if (!profile || profile.blocked) return Response.json({ error: "profile_blocked" }, { status: 403 });

  const now = new Date().toISOString();
  const ip = clientIp(request);
  const location = approximateLocation(request);
  const device = describeDevice(request.headers.get("user-agent"));
  await touchPresence(db, profileId, now);

  const license = await findLicenseByInput(db, body.serial);
  if (!license) {
    await recordLiveEvent(db, { type: "INVALID_SERIAL", severity: "warning", actorProfileId: profileId, ip, ...location, device });
    return Response.json({ recorded: true, status: "not_found", credited: false, license: null, product: null, profile: await getProfileWithLicenses(profileId) }, { status: 201, headers: { "cache-control": "no-store" } });
  }

  const status = effectiveStatus(license);
  let credited = false;
  let resultStatus: "active" | "expired" | "revoked" | "unavailable" = status;

  if (status !== "active") {
    await recordLiveEvent(db, { type: status === "revoked" ? "LICENSE_REVOKED" : "LICENSE_EXPIRED", severity: "warning", actorProfileId: profileId, materialId: license.materialId, licenseId: license.id, ip, ...location, device });
  } else if (!license.ownerProfileId) {
    credited = await claimLicense(db, license.id, profileId, now);
    if (credited) {
      await recordLiveEvent(db, { type: "LICENSE_ACTIVATED", actorProfileId: profileId, materialId: license.materialId, licenseId: license.id, ip, ...location, device });
    } else {
      // Someone else won the claim race between our read and this write.
      resultStatus = "unavailable";
      await recordLiveEvent(db, { type: "ACTIVATION_REJECTED", severity: "warning", actorProfileId: profileId, licenseId: license.id, ip, ...location, device });
    }
  } else if (license.ownerProfileId !== profileId) {
    resultStatus = "unavailable";
    await recordLiveEvent(db, { type: "ACTIVATION_REJECTED", severity: "warning", actorProfileId: profileId, licenseId: license.id, ip, ...location, device, reason: "owned_by_other_profile" });
  } else {
    await recordLiveEvent(db, { type: "LICENSE_VALIDATED", actorProfileId: profileId, materialId: license.materialId, licenseId: license.id, ip, ...location, device });
  }

  if (credited) await recalculatePoints(db, profileId, now);

  const material = await getMaterial(db, license.materialId);
  const maskedSerial = `${license.displayPrefix}-••••-••••-••••-${license.displaySuffix}`;
  return Response.json({
    recorded: true,
    status: resultStatus,
    credited,
    license: { id: license.id, materialId: license.materialId, serial: maskedSerial },
    // Kept as `product` (rather than renaming to `material`) so the
    // existing customer-facing UI's result-card rendering, which expects
    // {name, maker, lot, expiry, serial}, keeps working unchanged.
    product: material ? { name: material.name, maker: material.maker || material.brand, lot: license.lot, expiry: license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "", serial: maskedSerial } : null,
    profile: await getProfileWithLicenses(profileId),
  }, { status: 201, headers: { "cache-control": "no-store" } });
}
