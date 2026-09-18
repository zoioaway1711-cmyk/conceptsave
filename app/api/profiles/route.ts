import { isSameOrigin, profileSchema, readBody } from "@/lib/api-validation";
import { customerId } from "@/lib/customer-auth";
import { database, getProfile, getProfileWithLicenses } from "@/lib/customer-profile";
import { countActiveLicensesForOwner } from "@/lib/licenses";
import { touchPresence } from "@/lib/presence";

export async function GET(request: Request) {
  const id = await customerId(request);
  if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("id");
  if (requested && requested !== id) return Response.json({ error: "forbidden" }, { status: 403 });
  const profile = await getProfile(id);
  if (profile?.blocked) return Response.json({ error: "profile_blocked" }, { status: 403 });
  await touchPresence(database(), id);
  return Response.json({ profile: await getProfileWithLicenses(id) }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const id = await customerId(request);
  if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await readBody(request, profileSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });
  if (body.id !== id) return Response.json({ error: "forbidden" }, { status: 403 });
  const profile = await getProfile(id);
  if (!profile || profile.blocked) return Response.json({ error: "profile_blocked" }, { status: 403 });
  const db = database();
  const count = await countActiveLicensesForOwner(db, id);
  const benefits = [...profile.benefits];
  for (const benefit of body.benefits) {
    const threshold = Number((benefit as { threshold?: unknown }).threshold);
    if (![3, 5, 10].includes(threshold) || count < threshold || benefits.some((entry) => (entry as { threshold?: unknown }).threshold === threshold)) continue;
    benefits.push({ threshold, code: `SAVE${threshold === 10 ? "FRASCO" : threshold === 5 ? "50" : "FRETE"}-${id.slice(-4)}`, title: threshold === 10 ? "1 frasco grátis" : threshold === 5 ? "50% OFF" : "Envio grátis", activatedAt: new Date().toISOString() });
  }
  await db.prepare("UPDATE customer_profiles SET last_active=?, preferred_language=?, consent_json=?, benefits_json=? WHERE id=? AND blocked=0").bind(new Date().toISOString(), body.preferredLanguage, JSON.stringify(body.consent), JSON.stringify(benefits), id).run();
  return Response.json({ saved: true, profile: await getProfileWithLicenses(id) }, { headers: { "cache-control": "no-store" } });
}
