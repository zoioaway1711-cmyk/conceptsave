import { env } from "cloudflare:workers";
import { hashPassword, verifyPassword } from "./password";
import { OWNER_PERMISSIONS, type Permission } from "./permissions";

function runtime() {
  return env as unknown as { ADMIN_USER?: string; ADMIN_PASSWORD?: string; SESSION_SECRET?: string };
}
function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

/** True once SESSION_SECRET is set — the one thing every admin auth path needs regardless of whether any admin_users row exists yet (that's handled by the bootstrap path in authenticateAdmin()). */
export function adminConfigured() {
  return Boolean(runtime().SESSION_SECRET);
}

export type AdminUser = { id: string; username: string; permissions: Permission[] };

async function signingKey() {
  const secret = runtime().SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createAdminCookie(adminUserId: string) {
  const payload = `admin.${adminUserId}.${Date.now() + 8 * 60 * 60 * 1000}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload));
  return `${payload}.${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Resolves the full admin identity (id/username/permissions) from a raw
 * Cookie header value, or null if absent/invalid/expired/disabled. Split
 * out from resolveAdmin() so Server Components — which have a Cookies jar
 * from next/headers, not a Request — can gate a whole page server-side
 * (see app/admin/layout.tsx) without a fake Request object.
 */
export async function resolveAdminFromCookieHeader(cookieHeader: string | null | undefined): Promise<AdminUser | null> {
  const secret = runtime().SESSION_SECRET;
  if (!secret) return null;
  const cookie = cookieHeader?.match(/(?:^|;\s*)vf_admin=([^;]+)/)?.[1];
  const match = cookie?.match(/^admin\.([A-Za-z0-9_-]{1,80})\.(\d+)\.([a-f0-9]{64})$/);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= Date.now()) return null;
  const signature = Uint8Array.from(match[3].match(/../g)!, (byte) => parseInt(byte, 16));
  const valid = await crypto.subtle.verify("HMAC", await signingKey(), signature, new TextEncoder().encode(`admin.${match[1]}.${match[2]}`));
  if (!valid) return null;
  const row = await db().prepare("SELECT id, username, permissions_json AS permissionsJson, disabled FROM admin_users WHERE id=?").bind(match[1]).first<{ id: string; username: string; permissionsJson: string; disabled: number }>();
  if (!row || row.disabled) return null;
  let permissions: Permission[] = [];
  try { permissions = JSON.parse(row.permissionsJson); } catch { permissions = []; }
  return { id: row.id, username: row.username, permissions };
}

export async function resolveAdmin(request: Request): Promise<AdminUser | null> {
  return resolveAdminFromCookieHeader(request.headers.get("cookie"));
}

export async function isAdmin(request: Request): Promise<boolean> {
  return (await resolveAdmin(request)) !== null;
}

export function hasPermission(admin: AdminUser | null, permission: Permission): boolean {
  return Boolean(admin && admin.permissions.includes(permission));
}

/**
 * Resolves the admin and checks one required permission in a single call.
 * Returns either the authorized AdminUser or a ready-to-return Response —
 * `401` when there's no valid admin session at all, `403` when the admin
 * is real but lacks this specific permission ("not every ADMIN needs to
 * see everything"). Never assume a valid `vf_admin` cookie implies access.
 */
export async function requirePermission(request: Request, permission: Permission): Promise<AdminUser | Response> {
  const admin = await resolveAdmin(request);
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(admin, permission)) return Response.json({ error: "forbidden" }, { status: 403 });
  return admin;
}

/**
 * Same as requirePermission(), but satisfied by ANY one of several
 * permissions — e.g. listing materials (read-only) is legitimately needed
 * by both someone who manages materials and someone who only manages
 * licenses (to pick which material a new license belongs to), without
 * granting the license-manager the ability to create/edit materials
 * themselves (that stays behind admin.materials.manage alone on the
 * mutating routes).
 */
export async function requireAnyPermission(request: Request, permissions: Permission[]): Promise<AdminUser | Response> {
  const admin = await resolveAdmin(request);
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!permissions.some((permission) => hasPermission(admin, permission))) return Response.json({ error: "forbidden" }, { status: 403 });
  return admin;
}

/** Constant-time string compare: both inputs are hashed to a fixed 32-byte digest first, so neither the early-exit on length nor the byte-by-byte XOR loop leaks timing information about the secret. */
async function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

// A fixed dummy hash so the "username not found" path spends roughly the
// same PBKDF2 time as the "wrong password" path — otherwise response
// timing would leak which admin usernames exist.
const DUMMY_HASH = "pbkdf2$210000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Authenticates against `admin_users`. If that table is still empty and the
 * legacy ADMIN_USER/ADMIN_PASSWORD env vars are configured and match
 * exactly, auto-provisions the first admin account (full permissions) from
 * them — a one-time upgrade path so operators aren't locked out by this
 * migration away from the single shared env-var credential.
 */
export async function authenticateAdmin(username: string, password: string): Promise<AdminUser | null> {
  const secret = runtime().SESSION_SECRET;
  if (!secret) return null;
  const normalizedUsername = username.trim().toLowerCase();
  const database = db();
  const { count } = (await database.prepare("SELECT COUNT(*) AS count FROM admin_users").first<{ count: number }>()) ?? { count: 0 };
  if (count === 0) {
    const legacyUser = runtime().ADMIN_USER;
    const legacyPassword = runtime().ADMIN_PASSWORD;
    if (legacyUser && legacyPassword) {
      const [userMatches, passwordMatches] = await Promise.all([
        timingSafeEqual(normalizedUsername, legacyUser.trim().toLowerCase()),
        timingSafeEqual(password, legacyPassword),
      ]);
      if (userMatches && passwordMatches) {
        const id = `adm_${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        await database.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id, normalizedUsername, await hashPassword(password), JSON.stringify(OWNER_PERMISSIONS), now, now).run();
        return { id, username: normalizedUsername, permissions: OWNER_PERMISSIONS };
      }
    }
    // Fall through to a dummy verify below so this path isn't faster than the "user exists" path.
  }
  const row = await database.prepare("SELECT id, username, password_hash AS passwordHash, permissions_json AS permissionsJson, disabled FROM admin_users WHERE username=?").bind(normalizedUsername).first<{ id: string; username: string; passwordHash: string; permissionsJson: string; disabled: number }>();
  const passwordOk = await verifyPassword(password, row?.passwordHash ?? DUMMY_HASH);
  if (!row || row.disabled || !passwordOk) return null;
  await database.prepare("UPDATE admin_users SET last_login_at=? WHERE id=?").bind(new Date().toISOString(), row.id).run();
  let permissions: Permission[] = [];
  try { permissions = JSON.parse(row.permissionsJson); } catch { permissions = []; }
  return { id: row.id, username: row.username, permissions };
}
