import { isSameOrigin, profileSchema, readBody } from "@/lib/api-validation";
import { customerId } from "@/lib/customer-auth";
import { database, getProfile, getProfileWithLicenses, resolveMergedProfileId } from "@/lib/customer-profile";
import { countActiveLicensesForOwner } from "@/lib/licenses";
import { touchPresence } from "@/lib/presence";

// Unambiguous alphabet (no I/L/O/U), same idea as lib/serial.ts.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Benefit codes used to be `SAVE50-<last 4 chars of the profile id>` — only
 * 65,536 possibilities per tier, derivable by anyone who ever saw a profile
 * id suffix (it's shown in admin/Telegram messages), so a made-up code had
 * a real chance of matching a genuine one when redeemed with the team. The
 * id suffix stays (the team still looks the customer up by it) and 6
 * random characters (30 bits) make the code itself unguessable. Codes
 * already issued are kept as they are.
 */
function benefitCode(threshold: number, profileId: string) {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `SAVE${threshold === 10 ? "FRASCO" : threshold === 5 ? "50" : "FRETE"}-${profileId.slice(-4)}-${random}`;
}

export async function GET(request: Request) {
  const rawId = await customerId(request);
  if (!rawId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = await resolveMergedProfileId(rawId);
  const requested = new URL(request.url).searchParams.get("id");
  // Accepts the pre-merge rawId too — see verifications/route.ts's identical comment.
  if (requested && requested !== id && requested !== rawId) return Response.json({ error: "forbidden" }, { status: 403 });
  const profile = await getProfile(id);
  if (profile?.blocked) return Response.json({ error: "profile_blocked" }, { status: 403 });
  await touchPresence(database(), id);
  return Response.json({ profile: await getProfileWithLicenses(id) }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const rawId = await customerId(request);
  if (!rawId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = await resolveMergedProfileId(rawId);
  const body = await readBody(request, profileSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  if (body.id !== id && body.id !== rawId) return Response.json({ error: "forbidden" }, { status: 403 });
  const profile = await getProfile(id);
  if (!profile || profile.blocked) return Response.json({ error: "profile_blocked" }, { status: 403 });
  const db = database();
  const count = await countActiveLicensesForOwner(db, id);
  const benefits = [...profile.benefits];
  for (const benefit of body.benefits) {
    const threshold = Number((benefit as { threshold?: unknown }).threshold);
    if (![3, 5, 10].includes(threshold) || count < threshold || benefits.some((entry) => (entry as { threshold?: unknown }).threshold === threshold)) continue;
    benefits.push({ threshold, code: benefitCode(threshold, id), title: threshold === 10 ? "1 frasco grátis" : threshold === 5 ? "50% OFF" : "Envio grátis", activatedAt: new Date().toISOString() });
  }
  await db.prepare("UPDATE customer_profiles SET last_active=?, preferred_language=?, consent_json=?, benefits_json=? WHERE id=? AND blocked=0").bind(new Date().toISOString(), body.preferredLanguage, JSON.stringify(body.consent), JSON.stringify(benefits), id).run();
  return Response.json({ saved: true, profile: await getProfileWithLicenses(id) }, { headers: { "cache-control": "no-store" } });
}
