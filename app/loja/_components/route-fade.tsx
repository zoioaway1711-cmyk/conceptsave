"use client";

import { usePathname } from "next/navigation";

/**
 * Soft cross-page entrance: remounts the page content per pathname with a
 * short fade. Query-string changes (filters, sort) don't retrigger it, and
 * prefers-reduced-motion disables it via the global motion rule.
 */
export function RouteFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="lj-route">
      {children}
    </div>
  );
}
