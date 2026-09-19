"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RANKS } from "@/lib/rank";
import { RankBadge } from "./RankBadge";
import { cn } from "@/lib/utils";

/**
 * Bronze → Diamante trail. Desktop: horizontal rail. Mobile: a dedicated
 * vertical stack (not the desktop rail squeezed down) so each rank card
 * stays legible on a phone width.
 */
export function RankJourney({ currentIndex }: { currentIndex: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="w-full">
      {/* Desktop / tablet: horizontal rail */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-5">
        {RANKS.map((rank, i) => {
          const status = i < currentIndex ? "done" : i === currentIndex ? "current" : "locked";
          return (
            <motion.div
              key={rank.id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : i * 0.08 }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center",
                status === "current"
                  ? "border-[color:var(--cs-primary)] bg-[color:var(--cs-mint)] shadow-[var(--cs-glow)]"
                  : "border-[color:var(--cs-line)] bg-[color:var(--cs-surface-2)]/60",
              )}
            >
              <RankBadge rankId={rank.id} size="lg" locked={status === "locked"} />
              <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--cs-muted)]">
                Nível {i + 1}
              </div>
              <div className="text-sm font-bold text-[color:var(--cs-ink)]">{rank.name.pt}</div>
              <div className="text-[11px] font-semibold text-[color:var(--cs-primary)]">
                {status === "done" ? "Conquistado ✓" : status === "current" ? "Rank atual" : `${rank.points.toLocaleString("pt-PT")} pts`}
              </div>
              <p className="text-[11px] leading-snug text-[color:var(--cs-muted)]">{rank.prize.pt}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Mobile: vertical stack with a connecting rail */}
      <ol className="flex flex-col gap-3 sm:hidden">
        {RANKS.map((rank, i) => {
          const status = i < currentIndex ? "done" : i === currentIndex ? "current" : "locked";
          return (
            <li
              key={rank.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-3",
                status === "current"
                  ? "border-[color:var(--cs-primary)] bg-[color:var(--cs-mint)]"
                  : "border-[color:var(--cs-line)] bg-[color:var(--cs-surface-2)]/60",
              )}
            >
              <RankBadge rankId={rank.id} size="md" locked={status === "locked"} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-[color:var(--cs-ink)]">{rank.name.pt}</div>
                <div className="text-[11px] leading-snug text-[color:var(--cs-muted)]">{rank.prize.pt}</div>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-[color:var(--cs-muted)]">
                {status === "done" ? "✓" : status === "current" ? "Atual" : `${rank.points.toLocaleString("pt-PT")}pts`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
