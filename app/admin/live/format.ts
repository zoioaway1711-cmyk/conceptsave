/** Joins country/region/city, skipping blanks — region/city are very often empty (only country is reliably populated), so this never renders stray commas. */
export function formatLocation(loc: { country?: string; region?: string; city?: string } | null | undefined): string {
  if (!loc) return "";
  return [loc.city, loc.region, loc.country].map((part) => (part || "").trim()).filter(Boolean).join(", ");
}

/** A masked id always contains the bullet character used by maskProfileId/maskIp (lib/live-events.ts) — never a valid lookup key. */
export function looksMasked(value: string | null | undefined): boolean {
  return !value || value.includes("•");
}
