"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";
import { formatBRL, getProduct } from "../_lib/catalog";
import { dismissAddedNotice, useAddedNotice, useCart } from "../_lib/store";
import { ProductImage } from "./ui";

const AUTO_DISMISS_MS = 6000;

/*
 * Mini-cart confirmation. Non-modal on purpose: it confirms the add, shows
 * the subtotal and offers the next step, but never traps focus or blocks
 * the page — shoppers keep browsing if they want. It pauses auto-dismiss
 * while hovered or focused so it never vanishes under the cursor.
 */
export function AddedToCart() {
  const notice = useAddedNotice();
  const { totals, count } = useCart();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const timer = useRef<number | undefined>(undefined);
  const product = notice ? getProduct(notice.slug) : undefined;

  function schedule() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(dismissAddedNotice, AUTO_DISMISS_MS);
  }

  useEffect(() => {
    if (!notice) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(dismissAddedNotice, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer.current);
  }, [notice]);

  // Navigating away (e.g. clicking "Ver carrinho") closes it.
  useEffect(() => {
    dismissAddedNotice();
  }, [pathname]);

  return (
    <AnimatePresence>
      {notice && product && (
        <motion.div
          key={notice.at}
          className="lj-toast"
          role="status"
          aria-live="polite"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseEnter={() => window.clearTimeout(timer.current)}
          onMouseLeave={schedule}
          onFocus={() => window.clearTimeout(timer.current)}
          onBlur={schedule}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--lj-line)] px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-bold text-[color:var(--lj-success)]">
              <CheckCircle2 className="size-5" aria-hidden="true" /> Adicionado ao carrinho
            </p>
            <button
              type="button"
              className="lj-btn lj-btn--ghost lj-btn--icon lj-btn--sm"
              aria-label="Fechar aviso"
              onClick={dismissAddedNotice}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="lj-media size-16 shrink-0 rounded-[var(--lj-r-md)] p-1.5">
              <ProductImage image={product.image} sizes="64px" decorative />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[color:var(--lj-ink)]">{product.name}</p>
              <p className="lj-tiny lj-muted truncate">{product.presentation}</p>
              <p className="lj-tiny lj-muted">
                {notice.qty} × {formatBRL(product.price)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 pb-1 text-sm">
            <span className="lj-muted">
              Subtotal ({count} {count === 1 ? "item" : "itens"})
            </span>
            <strong className="text-[color:var(--lj-ink)]">{formatBRL(totals.total)}</strong>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 pt-3">
            <Link href="/loja/carrinho" className="lj-btn lj-btn--secondary">
              Ver carrinho
            </Link>
            <Link href="/loja/checkout" className="lj-btn lj-btn--primary">
              Finalizar compra
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
