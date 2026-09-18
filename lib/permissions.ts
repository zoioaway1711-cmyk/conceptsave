/**
 * RBAC permission strings. An admin_users row carries an explicit
 * `permissionsJson` array — nothing is granted just by being "an admin"
 * (see lib/admin-auth.ts hasPermission()). Keep this list the single
 * source of truth for what a permission string can be.
 */
export const PERMISSIONS = [
  "admin.dashboard.view",
  "admin.materials.manage",
  "admin.licenses.manage",
  "admin.profiles.manage",
  "admin.audit.view",
  "admin.live.view",
  "admin.users.inspect",
  "admin.security.ip.view",
  "admin.admins.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

/** Granted to the auto-provisioned first admin (bootstrapped from legacy env vars) so the system is usable out of the box; every admin created after that gets an explicit, reviewed subset. */
export const OWNER_PERMISSIONS: Permission[] = [...PERMISSIONS];
