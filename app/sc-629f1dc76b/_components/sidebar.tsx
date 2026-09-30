"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";
import { Activity, FileClock, LayoutDashboard, LogOut, Package, ShoppingBag, Ticket, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

type NavItem = { href: string; label: string; permission: Permission; icon: ComponentType<{ className?: string }> };

const NAV_ITEMS: NavItem[] = [
  { href: "/sc-629f1dc76b/dashboard", label: "Dashboard", permission: "admin.dashboard.view", icon: LayoutDashboard },
  { href: "/sc-629f1dc76b/materials", label: "Materials", permission: "admin.materials.manage", icon: Package },
  { href: "/sc-629f1dc76b/licenses", label: "Licenses", permission: "admin.licenses.manage", icon: Ticket },
  { href: "/sc-629f1dc76b/licenses/import", label: "Import products", permission: "admin.licenses.manage", icon: Upload },
  { href: "/sc-629f1dc76b/live", label: "Live Intelligence", permission: "admin.live.view", icon: Activity },
  { href: "/sc-629f1dc76b/loja", label: "Loja", permission: "admin.store.orders", icon: ShoppingBag },
  { href: "/sc-629f1dc76b/audit", label: "Audit Log", permission: "admin.audit.view", icon: FileClock },
  { href: "/sc-629f1dc76b/admins", label: "Admins", permission: "admin.admins.manage", icon: Users },
];

export function AdminSidebar({ username, permissions }: { username: string; permissions: Permission[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  // "Loja" is also reachable with analytics-only access.
  const items = NAV_ITEMS.filter(
    (item) => permissions.includes(item.permission) || (item.href.endsWith("/loja") && (permissions.includes("admin.store.analytics") || permissions.includes("admin.store.catalog"))),
  );

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" });
    } finally {
      router.push("/sc-629f1dc76b");
      router.refresh();
    }
  }

  return (
    // Phones: a compact top bar with a horizontally scrolling menu; md+ keeps the fixed left sidebar.
    <aside className="relative z-20 flex w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3 md:px-5 md:py-4">
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary/15 shadow-[0_0_20px_rgba(47,123,255,0.25)]">
          <Image src="/save-concept-favicon.png" alt="Save Concept" width={32} height={32} className="size-full object-cover" priority />
        </span>
        <div className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight">VerificaFarma</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Command Center</span>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-1 md:flex-col md:gap-0 md:space-y-1 md:overflow-x-visible md:overflow-y-auto md:py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
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
      <div className="flex items-center gap-2 border-t border-sidebar-border px-3 py-2 md:block md:py-4">
        <div className="min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground md:mb-2">
          Conectado como <span className="font-medium text-sidebar-foreground">{username}</span>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 justify-start gap-2 border-sidebar-border md:w-full bg-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={() => void signOut()} disabled={signingOut}>
          <LogOut className="size-4" />
          {signingOut ? "Saindo…" : "Sair"}
        </Button>
      </div>
    </aside>
  );
}
