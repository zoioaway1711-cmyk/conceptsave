import Image from "next/image";
import { RANKS, type RankId } from "@/lib/rank";
import { cn } from "@/lib/utils";

// Cropped from the 5-badge artwork provided for the Clube SAVE relaunch —
// one PNG per rank, transparent background, in public/clube-save/. Not
// square (medallion + wreath + name plate), so every size below is a
// fixed HEIGHT with width left free — badges of different ranks still
// line up consistently in a row even though their native aspect ratios
// differ slightly. width/height are each file's real intrinsic size
// (required by next/image), only used to preserve aspect ratio.
const IMAGE: Record<RankId, { src: string; width: number; height: number }> = {
  bronze: { src: "/clube-save/rank-bronze.png", width: 390, height: 443 },
  prata: { src: "/clube-save/rank-prata.png", width: 411, height: 461 },
  ouro: { src: "/clube-save/rank-ouro.png", width: 432, height: 474 },
  platina: { src: "/clube-save/rank-platina.png", width: 408, height: 480 },
  diamante: { src: "/clube-save/rank-diamante.png", width: 401, height: 480 },
};

const SIZES = {
  sm: 32,
  md: 48,
  lg: 96,
  xl: 160,
} as const;

export type RankBadgeSize = keyof typeof SIZES;

const NAME_PT: Record<RankId, string> = Object.fromEntries(RANKS.map((r) => [r.id, r.name.pt])) as Record<RankId, string>;

/**
 * Never the only way to tell ranks apart — every usage site also renders
 * the rank name as text next to this badge (see UserRankCard/RankJourney),
 * so color-blind users aren't relying on the artwork's color alone.
 */
export function RankBadge({
  rankId,
  size = "md",
  locked = false,
  className,
}: {
  rankId: RankId;
  size?: RankBadgeSize;
  locked?: boolean;
  className?: string;
}) {
  const px = SIZES[size];
  const image = IMAGE[rankId];
  return (
    <Image
      src={image.src}
      alt={NAME_PT[rankId]}
      width={image.width}
      height={image.height}
      style={{ height: px, width: "auto" }}
      className={cn("shrink-0 select-none object-contain", locked && "opacity-45 grayscale", className)}
      draggable={false}
      priority={size === "xl"}
    />
  );
}
