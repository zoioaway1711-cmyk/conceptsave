"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";
import { Activity, FileClock, LayoutDashboard, LogOut, Package, Ticket, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

type NavItem = { href: string; label: string; permission: Permission; icon: ComponentType<{ className?: string }> };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", permission: "admin.dashboard.view", icon: LayoutDashboard },
  { href: "/admin/materials", label: "Materials", permission: "admin.materials.manage", icon: Package },
  { href: "/admin/licenses", label: "Licenses", permission: "admin.licenses.manage", icon: Ticket },
  { href: "/admin/licenses/import", label: "Import products", permission: "admin.licenses.manage", icon: Upload },
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
    <aside className="relative flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary/15 shadow-[0_0_20px_rgba(47,123,255,0.25)]">
          <Image src="/save-concept-favicon.png" alt="Save Concept" width={32} height={32} className="size-full object-cover" priority />
        </span>
        <div className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight">VerificaFarma</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Command Center</span>
        </div>
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
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-primary shadow-[0_0_10px_rgba(47,123,255,0.7)] transition-opacity duration-200",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                )}
              />
              <Icon className={cn("size-4 transition-colors", active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-3 py-4">
        <div className="mb-2 truncate px-2 text-xs text-muted-foreground">
          Conectado como <span className="font-medium text-sidebar-foreground">{username}</span>
        </div>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={() => void signOut()} disabled={signingOut}>
          <LogOut className="size-4" />
          {signingOut ? "Saindo…" : "Sair"}
        </Button>
      </div>
    </aside>
  );
}
