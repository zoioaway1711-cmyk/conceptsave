"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Lock, ShoppingCart, Snowflake, Truck } from "lucide-react";
import { STORE, discountPct, formatBRL, productHref, productsBySlugs } from "../_lib/catalog";
import { formatCep, removeFromCart, setCartQty, useCart, useCep } from "../_lib/store";
import { ProductRail } from "./client-sections";
import { CepForm } from "./delivery";
import { ProductImage, QuantityStepper } from "./ui";

const noop = () => () => {};
/** False during SSR/hydration, true after — avoids flashing "carrinho vazio". */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function useCartSummary() {
  const cart = useCart();
  const shippingLabel = cart.freeShipping ? "Grátis" : "A confirmar";
  return { ...cart, shippingLabel };
}

export function OrderSummary({
  children,
  compact,
}: {
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const { subtotal, listTotal, savings, count, shippingLabel, freeShipping, lines } = useCartSummary();
  const cep = useCep();
  const hasNonFree = lines.some((l) => !l.product.freeShipping);
  return (
    <div className="lj-card lj-card--pad flex flex-col gap-4">
      {!compact && <h2 className="lj-h3">Resumo do pedido</h2>}
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="lj-muted">
            Produtos ({count} {count === 1 ? "item" : "itens"})
          </dt>
          <dd className="text-[color:var(--lj-ink)]">{formatBRL(listTotal)}</dd>
        </div>
        {savings > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="lj-muted">Descontos</dt>
            <dd className="font-semibold text-[color:var(--lj-success)]">− {formatBRL(savings)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="lj-muted">
            Entrega{cep ? ` (${formatCep(cep)})` : ""}
          </dt>
          <dd className={freeShipping ? "font-semibold text-[color:var(--lj-success)]" : "text-[color:var(--lj-ink)]"}>
            {shippingLabel}
          </dd>
        </div>
      </dl>
      {hasNonFree && lines.length > 0 && (
        <p className="lj-tiny lj-muted -mt-2">
          O frete dos acessórios é informado na confirmação do pedido. Frascos e kits têm frete grátis.
        </p>
      )}
      <hr className="lj-divider" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-[color:var(--lj-ink)]">Total</span>
        <span className="text-right">
          <span className="lj-price block text-2xl">{formatBRL(subtotal)}</span>
          <span className="lj-tiny lj-muted">
            ou {STORE.maxInstallments}x de {formatBRL(subtotal / STORE.maxInstallments)} sem juros
          </span>
        </span>
      </div>
      {children}
    </div>
  );
}

export function CartView() {
  const hydrated = useHydrated();
  const { lines, count, hasColdChain } = useCartSummary();
  const [undo, setUndo] = useState<{ name: string; restore: () => void } | null>(null);

  if (!hydrated) {
    return (
      <div className="lj-container grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label="Carregando carrinho">
        <div className="lj-skeleton h-64 rounded-[var(--lj-r-lg)]" />
        <div className="lj-skeleton h-72 rounded-[var(--lj-r-lg)]" />
      </div>
    );
  }

  const suggestions = productsBySlugs(
    Array.from(new Set(lines.flatMap((l) => l.product.boughtTogether))).filter((s) => !lines.some((l) => l.product.slug === s)),
  );

  if (lines.length === 0) {
    return (
      <div className="lj-container">
        {undo && <UndoBar undo={undo} onDone={() => setUndo(null)} />}
        <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-14 text-center">
          <span className="lj-icon-circle size-14">
            <ShoppingCart aria-hidden="true" />
          </span>
          <h2 className="lj-h3">Seu carrinho está vazio</h2>
          <p className="lj-small lj-muted max-w-sm">Explore o catálogo e adicione os produtos que você precisa.</p>
          <Link href="/loja/produtos" className="lj-btn lj-btn--primary mt-2">
            Ver produtos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="lj-container">
      {undo && <UndoBar undo={undo} onDone={() => setUndo(null)} />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="flex flex-col gap-4">
          <ul className="lj-card divide-y divide-[color:var(--lj-line)]" aria-label={`${count} itens no carrinho`}>
            {lines.map(({ product, qty }) => {
              const pct = discountPct(product);
              const remove = () => setUndo({ name: product.name, restore: removeFromCart(product.slug) });
              return (
                <li key={product.slug} className="flex gap-3 p-4 sm:gap-4 sm:p-5">
                  <Link href={productHref(product.slug)} className="lj-media size-20 shrink-0 rounded-[var(--lj-r-md)] p-1.5 sm:size-24">
                    <ProductImage image={product.image} sizes="96px" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={productHref(product.slug)} className="block text-[15px] font-bold leading-snug text-[color:var(--lj-ink)] hover:underline">
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
                        {product.oldPrice && pct > 0 && (
                          <span className="lj-price-old block">{formatBRL(product.oldPrice * qty)}</span>
                        )}
                        <span className="lj-price text-lg">{formatBRL(product.price * qty)}</span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <QuantityStepper
                        size="sm"
                        value={qty}
                        label={product.name}
                        onChange={(n) => setCartQty(product.slug, n)}
                        onRemove={remove}
                      />
                      <button type="button" className="lj-btn lj-btn--danger-ghost lj-btn--sm" onClick={remove}>
                        Remover
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasColdChain && (
            <p className="lj-alert lj-alert--info">
              <Snowflake aria-hidden="true" />
              Itens refrigerados seguem em caixa térmica com gelo reciclável. Prazo médio de {STORE.delivery.window}.
            </p>
          )}
          <Link href="/loja/produtos" className="lj-link inline-flex items-center gap-1.5 self-start text-sm">
            <ArrowLeft className="size-4" aria-hidden="true" /> Continuar comprando
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--lj-header-h)+72px)] lg:self-start">
          <OrderSummary>
            <Link href="/loja/checkout" className="lj-btn lj-btn--primary lj-btn--lg lj-btn--block">
              Finalizar compra <ArrowRight aria-hidden="true" />
            </Link>
            <p className="lj-tiny lj-muted inline-flex items-center justify-center gap-1.5">
              <Lock className="size-3.5" aria-hidden="true" /> Pix, cartão em até {STORE.maxInstallments}x ou boleto
            </p>
          </OrderSummary>
          <div className="lj-card lj-card--pad">
            <CepForm />
          </div>
        </div>
      </div>
      </div>

      <ProductRail id="junto-carrinho-title" eyebrow="Compre junto" title="Acessórios para a sua aplicação" products={suggestions} />
    </>
  );
}

function UndoBar({ undo, onDone }: { undo: { name: string; restore: () => void }; onDone: () => void }) {
  return (
    <div className="lj-alert lj-alert--success mb-4 items-center justify-between" role="status">
      <span>
        <strong>{undo.name}</strong> foi removido do carrinho.
      </span>
      <button
        type="button"
        className="lj-btn lj-btn--secondary lj-btn--sm"
        onClick={() => {
          undo.restore();
          onDone();
        }}
      >
        Desfazer
      </button>
    </div>
  );
}
