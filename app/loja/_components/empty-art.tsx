import type { LucideIcon } from "lucide-react";

/**
 * Light, on-brand illustration for empty states: layered soft rings with
 * the context icon. Pure CSS/SVG (no image requests), theme-aware, and
 * hidden from assistive tech — the heading next to it carries the meaning.
 */
export function EmptyArt({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="relative flex size-28 items-center justify-center" aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-[color:var(--lj-primary-soft)] opacity-60" />
      <span className="absolute inset-3 rounded-full border border-dashed border-[color:var(--lj-line-strong)]" />
      <span className="absolute right-3 top-4 size-2.5 rounded-full bg-[color:var(--lj-accent)] opacity-70" />
      <span className="absolute bottom-5 left-3 size-1.5 rounded-full bg-[color:var(--lj-primary)] opacity-60" />
      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-[color:var(--lj-surface)] text-[color:var(--lj-primary)] shadow-[var(--lj-shadow-md)]">
        <Icon className="size-7" strokeWidth={1.75} />
      </span>
    </span>
  );
}
