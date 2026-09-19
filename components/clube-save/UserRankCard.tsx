import type { RankState } from "@/lib/rank";
import { RankBadge, type RankBadgeSize } from "./RankBadge";
import { RankProgress } from "./RankProgress";
import { cn } from "@/lib/utils";

export type UserRankCardVariant = "compact" | "default" | "detailed";

const BADGE_SIZE: Record<UserRankCardVariant, RankBadgeSize> = {
  compact: "sm",
  default: "md",
  detailed: "xl",
};

/**
 * Reusable rank presentation — compact for tight spots (header/sidebar
 * style chips), default for inline summaries, detailed for the Clube SAVE
 * dashboard hero.
 */
export function UserRankCard({
  state,
  variant = "default",
  className,
  activeProductCount,
  memberSince,
}: {
  state: RankState;
  variant?: UserRankCardVariant;
  className?: string;
  /** Real, server-derived stats — only shown on the detailed variant, and only when provided. Never fabricate these. */
  activeProductCount?: number;
  memberSince?: string;
}) {
  const { rank, points, next, pointsToNext, progressPct } = state;

  if (variant === "compact") {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        <RankBadge rankId={rank.id} size="sm" />
        <div className="leading-tight">
          <div className="text-sm font-bold text-[color:var(--cs-ink)]">{rank.name.pt}</div>
          <div className="text-[11px] text-[color:var(--cs-muted)]">{points.toLocaleString("pt-PT")} pts</div>
        </div>
      </div>
    );
  }

  if (variant === "default") {
    return (
      <div className={cn("cs-glass flex items-center gap-3 rounded-2xl border p-3", className)}>
        <RankBadge rankId={rank.id} size={BADGE_SIZE.default} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-[color:var(--cs-ink)]">{rank.name.pt}</span>
            <span className="text-xs text-[color:var(--cs-muted)]">{points.toLocaleString("pt-PT")} pts</span>
          </div>
          <div className="mt-1.5">
            <RankProgress rank={rank} progressPct={progressPct} label={`Progresso para ${next?.name.pt ?? "rank máximo"}`} />
          </div>
        </div>
      </div>
    );
  }

  // detailed
  return (
    <div className={cn("cs-glass rounded-3xl border p-6", className)}>
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
        <RankBadge rankId={rank.id} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--cs-primary)]">Seu rank</span>
            {state.overridden ? (
              <span className="rounded-full bg-[color:var(--cs-mint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--cs-primary)]">
                Definido pela Save Concept
              </span>
            ) : null}
          </div>
          <div className="text-3xl font-extrabold text-[color:var(--cs-ink)] sm:text-4xl">{rank.name.pt}</div>
          <p className="mt-1 text-sm text-[color:var(--cs-muted)]">{rank.prize.pt}</p>

          {activeProductCount !== undefined || memberSince ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {activeProductCount !== undefined ? (
                <span className="rounded-full border border-[color:var(--cs-line)] bg-[color:var(--cs-surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--cs-ink)]">
                  {activeProductCount} {activeProductCount === 1 ? "produto verificado" : "produtos verificados"}
                </span>
              ) : null}
              {memberSince ? (
                <span className="rounded-full border border-[color:var(--cs-line)] bg-[color:var(--cs-surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--cs-ink)]">
                  Membro desde {memberSince}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex items-baseline justify-between gap-2 text-sm text-[color:var(--cs-muted)]">
            <span>
              Nível {state.rankIndex + 1} · {points.toLocaleString("pt-PT")} pts
              {next ? ` / ${next.points.toLocaleString("pt-PT")} pts` : ""}
            </span>
          </div>
          <div className="mt-2">
            <RankProgress rank={rank} progressPct={progressPct} label={`Progresso para ${next?.name.pt ?? "rank máximo"}`} />
          </div>
          <p className="mt-2 text-sm text-[color:var(--cs-muted)]">
            {next
              ? `Faltam ${pointsToNext?.toLocaleString("pt-PT")} pts para o próximo rank.`
              : "Rank máximo alcançado — você já desbloqueou todos os benefícios do Clube SAVE."}
          </p>
          {next ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[color:var(--cs-line)] bg-[color:var(--cs-mint)] px-3 py-2">
              <RankBadge rankId={next.id} size="sm" />
              <div className="text-left">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--cs-muted)]">Próximo rank</div>
                <div className="text-sm font-bold text-[color:var(--cs-ink)]">{next.name.pt}</div>
                <div className="text-[11px] text-[color:var(--cs-muted)]">{next.prize.pt}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
