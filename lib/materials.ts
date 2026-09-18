import { isValidPrefixCode } from "./serial";

export type Material = { id: number; slug: string; prefixCode: string; name: string; maker: string; brand: string; archived: boolean; createdAt: string };

function slugify(name: string) {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60) || "material";
}

export async function createMaterial(db: D1Database, input: { name: string; prefixCode: string; maker?: string; brand?: string }): Promise<Material> {
  const prefixCode = input.prefixCode.trim().toUpperCase();
  if (!isValidPrefixCode(prefixCode)) throw new Error("invalid_prefix_code");
  const now = new Date().toISOString();
  const baseSlug = slugify(input.name);
  let slug = baseSlug;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const existing = await db.prepare("SELECT id FROM materials WHERE slug=?").bind(slug).first();
    if (!existing) break;
    slug = `${baseSlug}-${attempt + 1}`;
  }
  const result = await db.prepare(
    "INSERT INTO materials (slug, prefix_code, name, maker, brand, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  ).bind(slug, prefixCode, input.name.trim(), input.maker?.trim() ?? "", input.brand?.trim() ?? "", now).first<{ id: number }>();
  return { id: result!.id, slug, prefixCode, name: input.name.trim(), maker: input.maker?.trim() ?? "", brand: input.brand?.trim() ?? "", archived: false, createdAt: now };
}

export async function listMaterials(db: D1Database): Promise<Material[]> {
  const { results } = await db.prepare(
    "SELECT id, slug, prefix_code AS prefixCode, name, maker, brand, archived, created_at AS createdAt FROM materials ORDER BY created_at DESC",
  ).all<{ id: number; slug: string; prefixCode: string; name: string; maker: string; brand: string; archived: number; createdAt: string }>();
  return results.map((row) => ({ ...row, archived: Boolean(row.archived) }));
}

export async function getMaterial(db: D1Database, id: number): Promise<Material | null> {
  const row = await db.prepare(
    "SELECT id, slug, prefix_code AS prefixCode, name, maker, brand, archived, created_at AS createdAt FROM materials WHERE id=?",
  ).bind(id).first<{ id: number; slug: string; prefixCode: string; name: string; maker: string; brand: string; archived: number; createdAt: string }>();
  return row ? { ...row, archived: Boolean(row.archived) } : null;
}
