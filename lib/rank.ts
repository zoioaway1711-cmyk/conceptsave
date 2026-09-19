/**
 * Single source of truth for Clube SAVE rank/points math on the React side
 * (app/clube-save). Same 5 thresholds and prize copy as the historical
 * `LEVELS` table in public/app.js — only the level-1 display name changed
 * ("Essencial" → "Bronze"); the stored DB default (`level_name`) is
 * untouched on purpose, this is a display-only rename.
 *
 * public/app.js is a separate, bundler-less runtime and keeps its own
 * minimal copy of these thresholds for its compact teaser card — if the
 * thresholds ever change, update both RANKS here and LEVELS there.
 */
export type RankId = "bronze" | "prata" | "ouro" | "platina" | "diamante";

export type Rank = {
  id: RankId;
  index: number; // 0-based, matches rankOverride - 1 and DB `level` - 1
  points: number;
  name: { pt: string; en: string; es: string };
  prize: { pt: string; en: string; es: string };
};

export const RANKS: Rank[] = [
  {
    id: "bronze",
    index: 0,
    points: 0,
    name: { pt: "Bronze", en: "Bronze", es: "Bronce" },
    prize: {
      pt: "Envio grátis, 50% OFF e 1 frasco grátis",
      en: "Free shipping, 50% off and 1 free bottle",
      es: "Envío gratis, 50% OFF y 1 frasco gratis",
    },
  },
  {
    id: "prata",
    index: 1,
    points: 1000,
    name: { pt: "Prata", en: "Silver", es: "Plata" },
    prize: {
      pt: "Ciclos com até 2 frascos grátis",
      en: "Cycles with up to 2 free bottles",
      es: "Ciclos con hasta 2 frascos gratis",
    },
  },
  {
    id: "ouro",
    index: 2,
    points: 2000,
    name: { pt: "Ouro", en: "Gold", es: "Oro" },
    prize: {
      pt: "Ciclos com até 3 frascos grátis",
      en: "Cycles with up to 3 free bottles",
      es: "Ciclos con hasta 3 frascos gratis",
    },
  },
  {
    id: "platina",
    index: 3,
    points: 3000,
    name: { pt: "Platina", en: "Platinum", es: "Platino" },
    prize: {
      pt: "Envio expresso e prémios premium",
      en: "Express shipping and premium rewards",
      es: "Envío exprés y premios premium",
    },
  },
  {
    id: "diamante",
    index: 4,
    points: 5000,
    name: { pt: "Diamante", en: "Diamond", es: "Diamante" },
    prize: {
      pt: "Pague 1, leve 3 e atendimento VIP",
      en: "Buy 1, get 3 and VIP support",
      es: "Paga 1, lleva 3 y atención VIP",
    },
  },
];

export const POINTS_PER_PRODUCT = 100;

export function getRankIndexForPoints(points: number): number {
  let index = 0;
  RANKS.forEach((rank, i) => {
    if (points >= rank.points) index = i;
  });
  return index;
}

export type RankState = {
  rank: Rank;
  rankIndex: number;
  points: number;
  next: Rank | null;
  pointsToNext: number | null;
  progressPct: number;
  overridden: boolean;
};

/**
 * Mirrors the exact math public/app.js used (basePoints = activeLicenseCount
 * * 100, rankOverride 1-5 wins when set, points floor to the resulting
 * rank's threshold) — only the count source changed: real, server-verified
 * active licenses (`profile.licenses`, status === "active") instead of the
 * stale localStorage `p.verified` array, which stopped being updated after
 * new verifications and understated returning customers' points/rank.
 */
export function computeRank(params: { activeLicenseCount: number; rankOverride: number }): RankState {
  const { activeLicenseCount, rankOverride } = params;
  const basePoints = Math.max(0, activeLicenseCount) * POINTS_PER_PRODUCT;
  const overridden = rankOverride > 0;
  const rankIndex = overridden
    ? Math.max(0, Math.min(RANKS.length - 1, rankOverride - 1))
    : getRankIndexForPoints(basePoints);
  const points = Math.max(basePoints, RANKS[rankIndex].points);
  const rank = RANKS[rankIndex];
  const next = RANKS[rankIndex + 1] ?? null;
  const pointsToNext = next ? Math.max(0, next.points - points) : null;
  const progressPct = next
    ? Math.min(100, ((points - rank.points) / (next.points - rank.points)) * 100)
    : 100;
  return { rank, rankIndex, points, next, pointsToNext, progressPct, overridden };
}
