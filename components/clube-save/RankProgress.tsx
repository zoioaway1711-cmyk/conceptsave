"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Rank } from "@/lib/rank";

const TRACK_COLOR: Record<Rank["id"], string> = {
  bronze: "linear-gradient(90deg,#c98b5e,#9a5a34)",
  prata: "linear-gradient(90deg,#dfe6ee,#9aa7b4)",
  ouro: "linear-gradient(90deg,#f7d878,#c8901c)",
  platina: "linear-gradient(90deg,#9fd0ff,#3f78e0)",
  diamante: "linear-gradient(90deg,#bdeeff,#33a7e6)",
};

export function RankProgress({
  rank,
  progressPct,
  label,
}: {
  rank: Rank;
  progressPct: number;
  label?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="w-full">
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-[color:var(--cs-track)]"
        role="progressbar"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: TRACK_COLOR[rank.id] }}
          initial={{ width: reduceMotion ? `${progressPct}%` : 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.9, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
