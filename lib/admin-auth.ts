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

// `sessionId` is only ever present when resolved from an actual cookie
// (resolveAdmin/resolveAdminFromCookieHeader) — authenticateAdmin() (a bare
// credentials check, called before any cookie/session exists yet) returns
// the same shape without one.
export type AdminUser = { id: string; username: string; permissions: Permission[]; sessionId?: string };

export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

async function signingKey() {
  const secret = runtime().SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * Every login mints a new row in `admin_sessions` — see db/schema.ts's
 * comment for why: a purely stateless signed cookie (the previous design)
 * has no way to list "what's logged in right now" or kill one specific
 * device without rotating SESSION_SECRET and logging out every admin at
 * once. The session id rides inside the signed payload (still can't be
 * forged without the secret) so resolveAdminFromCookieHeader can look it
 * up and check `revoked_at` on every request.
 */
export async function createAdminCookie(adminUserId: string, meta: { ip: string; device: string }) {
  const sessionId = `ses_${crypto.randomUUID()}`;
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const now = new Date().toISOString();
  await db().prepare(
    "INSERT INTO admin_sessions (id, admin_id, created_at, last_seen_at, expires_at, ip, device) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(sessionId, adminUserId, now, now, new Date(expiresAt).toISOString(), meta.ip, meta.device).run();
  const payload = `admin.${adminUserId}.${sessionId}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload));
  return `${payload}.${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Resolves the full admin identity (id/username/permissions/sessionId)
 * from a raw Cookie header value, or null if absent/invalid/expired/
 * disabled/revoked. Split out from resolveAdmin() so Server Components —
 * which have a Cookies jar from next/headers, not a Request — can gate a
 * whole page server-side (see app/admin/layout.tsx) without a fake
 * Request object.
 */
export async function resolveAdminFromCookieHeader(cookieHeader: string | null | undefined): Promise<AdminUser | null> {
  const secret = runtime().SESSION_SECRET;
  if (!secret) return null;
  const cookie = cookieHeader?.match(/(?:^|;\s*)vf_admin=([^;]+)/)?.[1];
  const match = cookie?.match(/^admin\.([A-Za-z0-9_-]{1,80})\.(ses_[A-Za-z0-9-]{1,80})\.(\d+)\.([a-f0-9]{64})$/);
  if (!match || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) <= Date.now()) return null;
  const [, adminId, sessionId, expiresAtRaw] = match;
  const signature = Uint8Array.from(match[4].match(/../g)!, (byte) => parseInt(byte, 16));
  const valid = await crypto.subtle.verify("HMAC", await signingKey(), signature, new TextEncoder().encode(`admin.${adminId}.${sessionId}.${expiresAtRaw}`));
  if (!valid) return null;
  const row = await db().prepare(
    `SELECT au.id, au.username, au.permissions_json AS permissionsJson, au.disabled, s.revoked_at AS revokedAt
     FROM admin_sessions s JOIN admin_users au ON au.id = s.admin_id
     WHERE s.id = ? AND s.admin_id = ?`,
  ).bind(sessionId, adminId).first<{ id: string; username: string; permissionsJson: string; disabled: number; revokedAt: string | null }>();
  if (!row || row.disabled || row.revokedAt) return null;
  // Best-effort presence touch for the sessions list — never allowed to
  // fail or slow down the auth check itself.
  db().prepare("UPDATE admin_sessions SET last_seen_at=? WHERE id=?").bind(new Date().toISOString(), sessionId).run().catch(() => {});
  let permissions: Permission[] = [];
  try { permissions = JSON.parse(row.permissionsJson); } catch { permissions = []; }
  return { id: row.id, username: row.username, permissions, sessionId };
}

export async function resolveAdmin(request: Request): Promise<AdminUser | null> {
  return resolveAdminFromCookieHeader(request.headers.get("cookie"));
}

export async function isAdmin(request: Request): Promise<boolean> {
  return (await resolveAdmin(request)) !== null;
}

export type AdminSessionRow = { id: string; adminId: string; adminUsername: string; createdAt: string; lastSeenAt: string; expiresAt: string; ip: string; device: string; revokedAt: string | null };

/**
 * `adminId` scopes to one admin's own sessions (e.g. a "log out my other
 * devices" self-service view); omit it for the admin.admins.manage-only
 * "everyone who's currently logged in" view. Only non-expired-by-schedule
 * rows within the last 30 days are returned — a session past its own
 * `expires_at` can no longer authenticate anything (resolveAdminFromCookieHeader
 * already refuses it), so listing it forever would just be clutter with
 * no revoke action that does anything.
 */
export async function listAdminSessions(db: D1Database, adminId?: string): Promise<AdminSessionRow[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await db.prepare(
    `SELECT s.id, s.admin_id AS adminId, au.username AS adminUsername, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt, s.ip, s.device, s.revoked_at AS revokedAt
     FROM admin_sessions s JOIN admin_users au ON au.id = s.admin_id
     WHERE s.created_at >= ? ${adminId ? "AND s.admin_id = ?" : ""}
     ORDER BY s.last_seen_at DESC LIMIT 200`,
  ).bind(...(adminId ? [since, adminId] : [since])).all<AdminSessionRow>();
  return results;
}

/**
 * Revoking is allowed on your own session unconditionally (that's just
 * "sign out this device"), or on ANY admin's session when the caller has
 * admin.admins.manage — the "notebook was stolen, kill it from here"
 * case, since the affected admin may not be the one able to act. Returns
 * false (not an error) for a session that's already revoked or doesn't
 * exist, so callers can treat it as an idempotent "make sure it's off".
 */
export async function revokeAdminSession(db: D1Database, sessionId: string, requester: { id: string; canManageAll: boolean }): Promise<boolean> {
  const session = await db.prepare("SELECT admin_id AS adminId, revoked_at AS revokedAt FROM admin_sessions WHERE id=?").bind(sessionId).first<{ adminId: string; revokedAt: string | null }>();
  if (!session || session.revokedAt) return false;
  if (session.adminId !== requester.id && !requester.canManageAll) return false;
  const result = await db.prepare("UPDATE admin_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL").bind(new Date().toISOString(), sessionId).run();
  return result.meta.changes > 0;
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
const DUMMY_HASH = "pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

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
