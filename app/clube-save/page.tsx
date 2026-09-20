"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Gift, ScanLine, Trophy, TrendingUp } from "lucide-react";
import { computeRank, type RankState } from "@/lib/rank";
import { UserRankCard } from "@/components/clube-save/UserRankCard";
import { RankJourney } from "@/components/clube-save/RankJourney";
import { RewardsSection, type ClaimedBenefit } from "@/components/clube-save/RewardsSection";
import { Skeleton } from "@/components/ui/skeleton";

type License = { status: "active" | "expired" | "revoked" };
type Profile = {
  id: string;
  firstSeen: string;
  preferredLanguage: "pt" | "en" | "es";
  rankOverride: number;
  blocked: boolean;
  benefits: ClaimedBenefit[];
  licenses: License[];
};

const HOW_IT_WORKS = [
  { icon: ScanLine, title: "Verifique produtos originais", description: "Confira a autenticidade de cada produto Save Concept pelo serial ou QR Code." },
  { icon: TrendingUp, title: "Ganhe pontos automaticamente", description: "Cada verificação de produto original soma 100 pontos à sua conta, sem nenhuma ação extra." },
  { icon: Trophy, title: "Suba de rank", description: "Ao atingir o limiar de pontos de um rank, você é promovido automaticamente — Bronze, Prata, Ouro, Platina ou Diamante." },
  { icon: Gift, title: "Resgate premiações", description: "Desbloqueie premiações conforme o número de produtos verificados e resgate direto na sua conta." },
];

type LoadState =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "blocked" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: Profile };

const CONSENT_KEY = "vf-consent-v1";

function readLocalConsent(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function ClubeSavePage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const response = await fetch("/api/profiles", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          setState({ kind: "unauthenticated" });
          return;
        }
        if (response.status === 403) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (cancelled) return;
          setState(body?.error === "profile_blocked" ? { kind: "blocked" } : { kind: "error", message: "Acesso negado." });
          return;
        }
        if (!response.ok) {
          setState({ kind: "error", message: "Não foi possível carregar o Clube SAVE." });
          return;
        }
        const data = (await response.json()) as { profile: Profile };
        if (!cancelled) setState({ kind: "ready", profile: data.profile });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Falha de conexão. Tente novamente." });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (state.kind === "unauthenticated") window.location.href = "/";
  }, [state.kind]);

  function retry() {
    setState({ kind: "loading" });
    setReloadKey((key) => key + 1);
  }

  async function claim(threshold: 3 | 5 | 10) {
    if (state.kind !== "ready") return;
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: state.profile.id,
        preferredLanguage: state.profile.preferredLanguage,
        consent: readLocalConsent(),
        benefits: [{ threshold }],
      }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { profile?: Profile };
    if (data.profile) setState({ kind: "ready", profile: data.profile });
  }

  if (state.kind === "loading" || state.kind === "unauthenticated") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-40 w-full rounded-3xl" />
        <Skeleton className="mt-6 h-48 w-full rounded-3xl" />
      </main>
    );
  }

  if (state.kind === "blocked") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[color:var(--cs-ink)]">Conta bloqueada</h1>
        <p className="mt-2 text-sm text-[color:var(--cs-muted)]">
          Sua conta está temporariamente bloqueada. Entre em contato com o suporte Save Concept.
        </p>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[color:var(--cs-ink)]">Algo deu errado</h1>
        <p className="mt-2 text-sm text-[color:var(--cs-muted)]">{state.message}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-lg bg-[color:var(--cs-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          Tentar novamente
        </button>
      </main>
    );
  }

  const { profile } = state;
  const activeLicenseCount = profile.licenses.filter((license) => license.status === "active").length;
  const rankState: RankState = computeRank({ activeLicenseCount, rankOverride: profile.rankOverride });
  const memberSince = profile.firstSeen
    ? new Date(profile.firstSeen).toLocaleDateString("pt-PT", { month: "short", year: "numeric" })
    : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--cs-primary)]">
            <Crown className="size-3.5" aria-hidden="true" /> CLUBE SAVE
          </div>
          <h1 className="text-2xl font-extrabold text-[color:var(--cs-ink)] sm:text-3xl">Sua jornada de fidelidade</h1>
          <p className="mt-1 max-w-md text-sm text-[color:var(--cs-muted)]">
            O programa de recompensas Save Concept: verifique produtos originais, evolua de rank e
            desbloqueie premiações exclusivas.
          </p>
        </div>
        <Link href="/" className="text-sm font-semibold text-[color:var(--cs-primary)] hover:underline">
          ← Voltar ao portal
        </Link>
      </header>

      <section className="flex flex-col gap-8">
        <UserRankCard state={rankState} variant="detailed" activeProductCount={activeLicenseCount} memberSince={memberSince} />

        <div>
          <h2 className="text-xl font-bold text-[color:var(--cs-ink)]">Sua jornada</h2>
          <p className="mt-1 text-sm text-[color:var(--cs-muted)]">
            Bronze → Prata → Ouro → Platina → Diamante. Cada produto original verificado soma pontos.
          </p>
          <div className="mt-4">
            <RankJourney currentIndex={rankState.rankIndex} />
          </div>
        </div>

        <RewardsSection
          activeLicenseCount={activeLicenseCount}
          claimedBenefits={profile.benefits ?? []}
          onClaim={claim}
        />

        <section aria-labelledby="cs-how-title">
          <h2 id="cs-how-title" className="text-xl font-bold text-[color:var(--cs-ink)]">
            Como funciona o Clube SAVE
          </h2>
          <p className="mt-1 text-sm text-[color:var(--cs-muted)]">
            Quatro passos simples — tudo automático a partir da sua primeira verificação.
          </p>
          <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <li
                key={step.title}
                className="cs-glass flex flex-col gap-2 rounded-2xl border border-[color:var(--cs-line)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--cs-mint)] text-xs font-bold text-[color:var(--cs-primary)]">
                    {i + 1}
                  </span>
                  <step.icon className="size-4 text-[color:var(--cs-primary)]" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-bold text-[color:var(--cs-ink)]">{step.title}</h3>
                <p className="text-[13px] leading-snug text-[color:var(--cs-muted)]">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  );
}
