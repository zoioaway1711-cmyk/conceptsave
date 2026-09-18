import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission, resolveAdminFromCookieHeader, type AdminUser } from "@/lib/admin-auth";
import type { Permission } from "@/lib/permissions";

/**
 * Server-only helper: rebuilds a raw `Cookie:` header from the Server
 * Component cookie jar so the already-tested resolveAdminFromCookieHeader()
 * (lib/admin-auth.ts) can be reused as-is instead of re-implementing cookie
 * parsing/signature verification here.
 */
export async function getViewer(): Promise<AdminUser | null> {
  const jar = await cookies();
  const cookieHeader = jar.getAll().map((entry) => `${entry.name}=${entry.value}`).join("; ");
  return resolveAdminFromCookieHeader(cookieHeader);
}

/** For protected pages: redirects to the login page when there is no valid admin session at all. */
export async function requireViewer(): Promise<AdminUser> {
  const admin = await getViewer();
  if (!admin) redirect("/admin");
  return admin;
}

export { hasPermission };
export type { AdminUser, Permission };
