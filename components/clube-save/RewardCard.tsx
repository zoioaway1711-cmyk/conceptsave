import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RewardDefinition = {
  threshold: 3 | 5 | 10;
  title: string;
  description: string;
  tag: string;
  icon: LucideIcon;
};

export type RewardStatus = "locked" | "available" | "claimed";

export function RewardCard({
  reward,
  status,
  claiming,
  remaining,
  onClaim,
}: {
  reward: RewardDefinition;
  status: RewardStatus;
  claiming: boolean;
  /** Real count of products still needed to unlock — only shown when locked. */
  remaining: number;
  onClaim: () => void;
}) {
  const Icon = reward.icon;
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-4",
        status === "available" && "border-[color:var(--cs-primary)] bg-[color:var(--cs-mint)] shadow-[var(--cs-glow)]",
        status === "claimed" && "border-emerald-400/40 bg-emerald-400/10",
        status === "locked" && "cs-glass border-[color:var(--cs-line)] opacity-80",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--cs-muted)]">{reward.tag}</span>
        {status === "locked" ? (
          <Lock className="size-3.5 text-[color:var(--cs-muted)]" aria-hidden="true" />
        ) : (
          <Icon className="size-4 text-[color:var(--cs-primary)]" aria-hidden="true" />
        )}
      </div>
      <h3 className="text-lg font-bold text-[color:var(--cs-ink)]">{reward.title}</h3>
      <p className="flex-1 text-sm text-[color:var(--cs-muted)]">{reward.description}</p>
      {status === "locked" ? (
        <p className="text-[11px] font-semibold text-[color:var(--cs-muted)]">
          Faltam {remaining} {remaining === 1 ? "produto" : "produtos"} para desbloquear
        </p>
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={status !== "available" || claiming}
        onClick={onClaim}
        variant={status === "claimed" ? "secondary" : "default"}
        className={status === "available" ? "bg-[color:var(--cs-primary)] hover:bg-[color:var(--cs-primary)]/90" : undefined}
      >
        {status === "claimed" ? "Resgatada" : status === "available" ? (claiming ? "Resgatando…" : "Resgatar") : "Bloqueada"}
      </Button>
    </article>
  );
}
