"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { FileCheck, Pause, Play, ShieldCheck, Snowflake, Truck } from "lucide-react";
import { STORE, freeShippingOnAllPurchasable } from "../_lib/catalog";

/*
 * Rotating announcement bar — facts only, no promos/urgency. WCAG 2.2.2:
 * rotation pauses on hover/focus, has an explicit pause button, and never
 * starts for people who prefer reduced motion. Not a live region (screen
 * readers aren't interrupted every few seconds).
 */
// Built per render: the delivery window and shipping terms come from the
// live catalog/settings — "frete grátis" only while it's true for
// everything sold online.
const messages = () => [
  {
    icon: Truck,
    text: freeShippingOnAllPurchasable()
      ? `Frete grátis nos produtos à venda online · prazo médio de ${STORE.delivery.window}`
      : `Prazo médio de entrega de ${STORE.delivery.window}`,
  },
  { icon: FileCheck, text: "Nota fiscal em todo pedido, na caixa e por e-mail" },
  { icon: Snowflake, text: "Itens refrigerados seguem em caixa térmica com gelo reciclável" },
  { icon: ShieldCheck, text: "Cada unidade com serial e QR Code de autenticidade", href: "/loja/autenticidade" },
];

export function AnnouncementBar() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const running = !reduce && !paused && !hover;

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % 4), 5000);
    return () => window.clearInterval(t);
  }, [running]);

  const MESSAGES = messages();
  const m = MESSAGES[index % MESSAGES.length];
  const content = (
    <>
      <m.icon className="size-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">{m.text}</span>
    </>
  );

  return (
    <div
      className="lj-topbar"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div className="lj-container flex h-9 items-center justify-between gap-4">
        <div key={index} className="lj-announce flex min-w-0 items-center gap-2" aria-roledescription="anúncio">
          {m.href ? (
            <Link href={m.href} className="inline-flex min-w-0 items-center gap-2 hover:underline">
              {content}
            </Link>
          ) : (
            <p className="inline-flex min-w-0 items-center gap-2">{content}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/" className="hidden items-center gap-1.5 font-semibold text-white hover:underline md:inline-flex">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Verificar autenticidade
          </Link>
          {!reduce && (
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded text-white/80 hover:text-white"
              aria-label={paused ? "Retomar anúncios" : "Pausar anúncios"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play className="size-3" aria-hidden="true" /> : <Pause className="size-3" aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
