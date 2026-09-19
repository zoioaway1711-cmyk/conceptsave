"use client";

import { useState } from "react";
import { Truck, Percent, PackagePlus } from "lucide-react";
import { RewardCard, type RewardDefinition, type RewardStatus } from "./RewardCard";

export type ClaimedBenefit = { threshold: number; code: string; title: string; activatedAt: string };

const REWARDS: RewardDefinition[] = [
  { threshold: 3, tag: "3 FRASCOS", title: "Envio grátis", description: "Envio gratuito no próximo pedido.", icon: Truck },
  { threshold: 5, tag: "5 FRASCOS", title: "50% OFF", description: "Metade do preço no próximo pedido.", icon: Percent },
  { threshold: 10, tag: "10 FRASCOS", title: "Pague 1, leve 2", description: "Receba 1 frasco grátis do mesmo produto.", icon: PackagePlus },
];

/**
 * "Suas Premiações" — unlock thresholds are real active-product counts
 * (server-verified, see app/api/profiles/route.ts's countActiveLicensesForOwner),
 * not tied to rank. Claiming reuses the existing POST /api/profiles flow —
 * no new redemption logic invented here.
 */
export function RewardsSection({
  activeLicenseCount,
  claimedBenefits,
  onClaim,
}: {
  activeLicenseCount: number;
  claimedBenefits: ClaimedBenefit[];
  onClaim: (threshold: 3 | 5 | 10) => Promise<void>;
}) {
  const [claiming, setClaiming] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const claimedByThreshold = new Map(claimedBenefits.map((b) => [b.threshold, b]));

  async function handleClaim(threshold: 3 | 5 | 10) {
    setClaiming(threshold);
    try {
      await onClaim(threshold);
    } finally {
      setClaiming(null);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard API can be unavailable (older browsers, no permission) —
      // the code is still shown on screen, so this is a soft failure.
    }
  }

  return (
    <section aria-labelledby="cs-rewards-title">
      <h2 id="cs-rewards-title" className="text-xl font-bold text-[color:var(--cs-ink)]">
        Suas Premiações
      </h2>
      <p className="mt-1 text-sm text-[color:var(--cs-muted)]">
        Cada produto original verificado aproxima você das próximas premiações.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {REWARDS.map((reward) => {
          const claimed = claimedByThreshold.has(reward.threshold);
          const unlocked = activeLicenseCount >= reward.threshold;
          const status: RewardStatus = claimed ? "claimed" : unlocked ? "available" : "locked";
          return (
            <RewardCard
              key={reward.threshold}
              reward={reward}
              status={status}
              claiming={claiming === reward.threshold}
              remaining={Math.max(0, reward.threshold - activeLicenseCount)}
              onClaim={() => handleClaim(reward.threshold)}
            />
          );
        })}
      </div>

      <div className="cs-glass mt-6 rounded-2xl border border-[color:var(--cs-line)] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[color:var(--cs-muted)]">Benefícios ativos</h3>
          <span className="text-sm font-semibold text-[color:var(--cs-ink)]">{claimedBenefits.length} ativos</span>
        </div>
        {claimedBenefits.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--cs-muted)]">Nenhum benefício resgatado ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {claimedBenefits.map((benefit) => (
              <li
                key={benefit.threshold}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--cs-line)] bg-[color:var(--cs-surface-2)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs text-[color:var(--cs-muted)]">
                    Resgatado · {new Date(benefit.activatedAt).toLocaleDateString("pt-PT")}
                  </div>
                  <div className="text-sm font-semibold text-[color:var(--cs-ink)]">{benefit.title}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyCode(benefit.code)}
                  className="rounded-lg border border-[color:var(--cs-line)] bg-[color:var(--cs-mint)] px-3 py-1.5 font-mono text-xs font-semibold text-[color:var(--cs-ink)]"
                >
                  {copied === benefit.code ? "Copiado!" : benefit.code}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
