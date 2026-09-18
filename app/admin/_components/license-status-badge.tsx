import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Fixed dark-surface colors, not `dark:`-variant Tailwind classes — the
// admin console has exactly one theme now (see globals.css), so a
// `prefers-color-scheme`-driven variant would only activate for visitors
// whose OS happens to be in dark mode, leaving these as pale light-mode
// pills against the new black+blue console for everyone else.
const STYLES: Record<string, string> = {
  active: "border-emerald-900/60 bg-emerald-950/70 text-emerald-400",
  expired: "border-amber-900/60 bg-amber-950/70 text-amber-400",
  revoked: "border-red-900/60 bg-red-950/70 text-red-400",
};

const LABELS: Record<string, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

export function LicenseStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STYLES[status] ?? "")}>
      {LABELS[status] ?? status}
    </Badge>
  );
}
