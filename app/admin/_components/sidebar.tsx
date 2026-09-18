"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";
import { Activity, FileClock, LayoutDashboard, LogOut, Package, ShieldCheck, Ticket, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

type NavItem = { href: string; label: string; permission: Permission; icon: ComponentType<{ className?: string }> };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", permission: "admin.dashboard.view", icon: LayoutDashboard },
  { href: "/admin/materials", label: "Materials", permission: "admin.materials.manage", icon: Package },
  { href: "/admin/licenses", label: "Licenses", permission: "admin.licenses.manage", icon: Ticket },
  { href: "/admin/live", label: "Live Intelligence", permission: "admin.live.view", icon: Activity },
  { href: "/admin/audit", label: "Audit Log", permission: "admin.audit.view", icon: FileClock },
  { href: "/admin/admins", label: "Admins", permission: "admin.admins.manage", icon: Users },
];

export function AdminSidebar({ username, permissions }: { username: string; permissions: Permission[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const items = NAV_ITEMS.filter((item) => permissions.includes(item.permission));

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" });
    } finally {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <ShieldCheck className="size-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Admin Console</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t px-3 py-4">
        <div className="mb-2 truncate px-2 text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{username}</span></div>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => void signOut()} disabled={signingOut}>
          <LogOut className="size-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </aside>
  );
}
