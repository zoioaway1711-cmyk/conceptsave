"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Lock, ShoppingCart, Snowflake, Truck } from "lucide-react";
import { ecommerce, toItem, track } from "../_lib/analytics";
import { STORE, discountPct, formatBRL, productHref, productsBySlugs } from "../_lib/catalog";
import { notify } from "../_lib/feedback";
import type { OrderTotals } from "../_lib/pricing";
import { acknowledgeCartChanges, removeFromCart, setCartQty, toggleFavorite, useCart, useFavorites, type CartChange } from "../_lib/store";
import { ProductRail, RecentlyViewedProducts } from "./client-sections";
import { CepLookup, FulfillmentOption } from "./delivery";
import { EmptyArt } from "./empty-art";
import { CategoryCards } from "./sections";
import { ProductImage, QuantityStepper } from "./ui";

const noop = () => () => {};
/** False during SSR/hydration, true after — avoids flashing "carrinho vazio". */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/*
 * The single financial summary. Renders `OrderTotals` from pricing.ts and
 * nothing else, so cart, checkout and a future confirmation page can never
 * disagree. Rows appear only when they carry real information.
 */
export function OrderSummary({
  totals,
  children,
  title = "Resumo do pedido",
}: {
  totals: OrderTotals;
  children?: React.ReactNode;
  title?: string | null;
}) {
  const pending = totals.shipping.kind === "pending";
  return (
    <div className="lj-card lj-card--pad flex flex-col gap-4">
      {title && <h2 className="lj-h3">{title}</h2>}
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="lj-muted">
            Produtos ({totals.itemCount} {totals.itemCount === 1 ? "item" : "itens"})
          </dt>
          <dd className="text-[color:var(--lj-ink)]">{formatBRL(totals.listSubtotal)}</dd>
        </div>
        {totals.productDiscount > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="lj-muted">Descontos dos produtos</dt>
            <dd className="font-semibold text-[color:var(--lj-success)]">− {formatBRL(totals.productDiscount)}</dd>
          </div>
        )}
        {totals.couponDiscount > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="lj-muted">Cupom</dt>
            <dd className="font-semibold text-[color:var(--lj-success)]">− {formatBRL(totals.couponDiscount)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="lj-muted">Frete</dt>
          <dd className={totals.shipping.kind === "free" ? "font-semibold text-[color:var(--lj-success)]" : "text-[color:var(--lj-ink)]"}>
            {totals.shipping.kind === "free"
              ? "Grátis"
              : totals.shipping.kind === "quoted"
                ? formatBRL(totals.shipping.amount)
                : "A confirmar"}
          </dd>
        </div>
      </dl>
      {pending && totals.itemCount > 0 && (
        <p className="lj-tiny lj-muted -mt-2">Frascos e kits têm frete grátis. O frete dos acessórios é informado na confirmação do pedido.</p>
      )}
      <hr className="lj-divider" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-[color:var(--lj-ink)]">{pending ? "Total sem frete" : "Total"}</span>
        <span className="text-right">
          <span className="lj-price block text-2xl">{formatBRL(totals.total)}</span>
          <span className="lj-tiny lj-muted">
            ou {totals.installments.count}x de {formatBRL(totals.installments.amount)} sem juros
          </span>
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * Cart recovery notice: anything that changed since the items were added
 * (price, availability, withdrawn product) is spelled out — the old
 * conditions are never silently restored or silently replaced.
 */
export function CartChanges({ changes }: { changes: CartChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="lj-alert lj-alert--warning flex-col gap-3 sm:flex-row sm:items-start" role="status">
      <AlertTriangle aria-hidden="true" />
      <div className="flex-1">
        <p className="font-bold">Seu carrinho mudou desde a última visita</p>
        <ul className="mt-1 list-disc pl-4">
          {changes.map((c) => (
            <li key={c.slug}>
              {c.kind === "price" ? (
                <>
                  O preço de <strong>{c.name}</strong> {c.to < c.from ? "caiu" : "mudou"} de {formatBRL(c.from)} para{" "}
                  <strong>{formatBRL(c.to)}</strong>.
                </>
              ) : c.kind === "not_purchasable" ? (
                <>
                  <strong>{c.name}</strong> não está disponível para compra online e não entra no total.
                </>
              ) : c.kind === "unavailable" ? (
                <>
                  <strong>{c.name}</strong> está indisponível no momento e não entra no total.
                </>
              ) : (
                <>
                  <strong>{c.name}</strong> saiu do catálogo e não entra no total.
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="lj-btn lj-btn--secondary lj-btn--sm shrink-0" onClick={() => acknowledgeCartChanges(changes)}>
        Entendi
      </button>
    </div>
  );
}

export function CartView() {
  const hydrated = useHydrated();
  const { lines, count, hasColdChain, totals, changes } = useCart();
  const [undo, setUndo] = useState<{ name: string; restore: () => void } | null>(null);
  const tracked = useRef(false);
  const favorites = useFavorites();

  useEffect(() => {
    if (!hydrated || tracked.current) return;
    tracked.current = true;
    track({ name: "view_cart", params: ecommerce(lines.map((l) => toItem(l.product, { quantity: l.qty }))) });
  }, [hydrated, lines]);

  if (!hydrated) {
    return (
      <div
        className="lj-container grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
        aria-busy="true"
        aria-label="Carregando carrinho"
      >
        <div className="lj-skeleton h-64 rounded-[var(--lj-r-lg)]" />
        <div className="lj-skeleton h-72 rounded-[var(--lj-r-lg)]" />
      </div>
    );
  }

  const inCart = new Set(lines.map((l) => l.product.slug));
  const suggestions = productsBySlugs(Array.from(new Set(lines.flatMap((l) => l.product.boughtTogether))).filter((s) => !inCart.has(s)));

  if (lines.length === 0) {
    return (
      <>
        <div className="lj-container flex flex-col gap-4">
          {undo && <UndoBar undo={undo} onDone={() => setUndo(null)} />}
          <CartChanges changes={changes} />
          <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-12 text-center">
            <EmptyArt icon={ShoppingCart} />
            <h2 className="lj-h3">Seu carrinho está vazio</h2>
            <p className="lj-small lj-muted max-w-sm">Escolha uma categoria para começar ou veja o catálogo completo.</p>
            <Link href="/loja/produtos" className="lj-btn lj-btn--primary mt-2">
              Explorar produtos
            </Link>
          </div>
          <CategoryCards />
        </div>
        <RecentlyViewedProducts />
      </>
    );
  }

  return (
    <>
      <div className="lj-container flex flex-col gap-4">
        {undo && <UndoBar undo={undo} onDone={() => setUndo(null)} />}
        <CartChanges changes={changes} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
          <div className="flex flex-col gap-4">
            <ul className="lj-card divide-y divide-[color:var(--lj-line)]" aria-label={`${count} itens no carrinho`}>
              {lines.map(({ product, qty }) => {
                const pct = discountPct(product);
                const remove = () => setUndo({ name: product.name, restore: removeFromCart(product.slug) });
                return (
                  <li key={product.slug} className="flex gap-3 p-4 sm:gap-4 sm:p-5">
                    <Link href={productHref(product.slug)} className="lj-media size-20 shrink-0 rounded-[var(--lj-r-md)] p-1.5 sm:size-24">
                      <ProductImage image={product.image} sizes="96px" decorative />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={productHref(product.slug)}
                            className="block text-[15px] font-bold leading-snug text-[color:var(--lj-ink)] hover:underline"
                          >
                            {product.name}
                          </Link>
                          <p className="lj-tiny lj-muted">{product.presentation}</p>
                          <p className="lj-tiny mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="lj-muted">{formatBRL(product.price)} / un.</span>
                            {pct > 0 && <span className="lj-badge lj-badge--deal">-{pct}%</span>}
                            {product.freeShipping && (
                              <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--lj-primary)]">
                                <Truck className="size-3.5" aria-hidden="true" /> Frete grátis
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-right">
                          {product.oldPrice && pct > 0 && <span className="lj-price-old block">{formatBRL(product.oldPrice * qty)}</span>}
                          <span className="lj-price text-lg">{formatBRL(product.price * qty)}</span>
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <QuantityStepper size="sm" value={qty} label={product.name} onChange={(n) => setCartQty(product.slug, n)} onRemove={remove} />
                        <span className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            className="lj-btn lj-btn--ghost lj-btn--sm"
                            onClick={() => {
                              if (!favorites.includes(product.slug)) toggleFavorite(product.slug);
                              const restore = removeFromCart(product.slug);
                              notify({
                                tone: "success",
                                title: "Salvo para depois",
                                description: `${product.name} está nos seus favoritos.`,
                                action: { label: "Desfazer", onClick: restore },
                              });
                            }}
                          >
                            Salvar para depois
                          </button>
                          <button type="button" className="lj-btn lj-btn--danger-ghost lj-btn--sm" onClick={remove}>
                            Remover
                          </button>
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="lj-card lj-card--pad flex flex-col gap-3">
              <h2 className="lj-h3">Entrega</h2>
              <FulfillmentOption shipping={totals.shipping} />
              {hasColdChain && (
                <p className="lj-tiny lj-muted inline-flex items-start gap-1.5">
                  <Snowflake className="mt-px size-3.5 shrink-0" aria-hidden="true" /> Itens refrigerados seguem em caixa térmica com gelo
                  reciclável.
                </p>
              )}
              <CepLookup compact />
            </div>
            <Link href="/loja/produtos" className="lj-link inline-flex items-center gap-1.5 self-start text-sm">
              <ArrowLeft className="size-4" aria-hidden="true" /> Continuar comprando
            </Link>
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--lj-header-real,120px)+24px)] lg:self-start">
            <OrderSummary totals={totals}>
              <Link href="/loja/checkout" className="lj-btn lj-btn--primary lj-btn--lg lj-btn--block">
                Finalizar compra <ArrowRight aria-hidden="true" />
              </Link>
              <p className="lj-tiny lj-muted inline-flex items-center justify-center gap-1.5">
                <Lock className="size-3.5" aria-hidden="true" /> Pix, cartão{STORE.maxInstallments > 1 ? ` em até ${STORE.maxInstallments}x` : ""} ou boleto
              </p>
            </OrderSummary>
          </div>
        </div>
      </div>

      <ProductRail id="junto-carrinho-title" eyebrow="Compre junto" title="Acessórios para a sua aplicação" products={suggestions} />
      <RecentlyViewedProducts exclude={[...inCart, ...suggestions.map((p) => p.slug)]} />
    </>
  );
}

function UndoBar({ undo, onDone }: { undo: { name: string; restore: () => void }; onDone: () => void }) {
  return (
    <div className="lj-alert lj-alert--success items-center justify-between" role="status">
      <span>
        <strong>{undo.name}</strong> foi removido do carrinho.
      </span>
      <button
        type="button"
        className="lj-btn lj-btn--secondary lj-btn--sm"
        onClick={() => {
          undo.restore();
          onDone();
          notify({ tone: "success", title: "Item devolvido ao carrinho", description: undo.name });
        }}
      >
        Desfazer
      </button>
    </div>
  );
}
