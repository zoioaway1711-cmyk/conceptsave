import type { ReactNode } from "react";
import { getViewer } from "./_lib/session";
import { AdminSidebar } from "./_components/sidebar";
import { Toaster } from "@/components/ui/sonner";

/**
 * Shared shell for everything under the admin section, including the
 * public login page at app/admin/page.tsx. This layout itself never
 * redirects — it only decides whether to draw the sidebar chrome (no valid
 * admin session yet, e.g. on the login page, simply renders children
 * full-bleed). Real enforcement (redirect-if-unauthenticated,
 * 403-if-missing-permission) happens per-page in each protected route,
 * exactly per the "gate at layout OR page level, never UI-only" rule.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getViewer();

  if (!admin) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {children}
        <Toaster position="top-right" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AdminSidebar username={admin.username} permissions={admin.permissions} />
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      <Toaster position="top-right" />
    </div>
  );
}
