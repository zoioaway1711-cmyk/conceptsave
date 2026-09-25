"use client";

import Link from "next/link";
import { ShoppingCart, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatBRL, productHref } from "../_lib/catalog";
import { removeFromCart, setCartQty, useCart } from "../_lib/store";
import { CartChanges, OrderSummary } from "./cart-view";
import { EmptyArt } from "./empty-art";
import { ProductImage, QuantityStepper } from "./ui";

/*
 * Slide-over cart (premium-store standard): review and adjust without
 * leaving the page. Same data, totals and change notices as the cart page.
 */
export function CartDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lines, count, totals, changes } = useCart();
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="lj-scope lj-sheet w-full gap-0 p-0 sm:max-w-[420px]">
        <div className="flex items-center justify-between border-b border-[color:var(--lj-line)] px-5 py-4">
          <SheetTitle className="lj-display text-base font-extrabold text-[color:var(--lj-ink)]">
            Seu carrinho{count ? ` (${count})` : ""}
          </SheetTitle>
          <SheetClose className="lj-header-icon" aria-label="Fechar carrinho">
            <X aria-hidden="true" />
          </SheetClose>
        </div>
        <SheetDescription className="lj-sr-only">Itens do carrinho, quantidades e total</SheetDescription>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <CartChanges changes={changes} />
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <EmptyArt icon={ShoppingCart} />
              <p className="lj-h3">Seu carrinho está vazio</p>
              <Link href="/loja/produtos" className="lj-btn lj-btn--primary" onClick={close}>
                Explorar produtos
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-[color:var(--lj-line)]">
              {lines.map(({ product, qty }) => (
                <li key={product.slug} className="flex gap-3 py-4">
                  <Link href={productHref(product.slug)} onClick={close} className="lj-media size-16 shrink-0 rounded-[var(--lj-r-md)] p-1.5">
                    <ProductImage image={product.image} sizes="64px" decorative />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={productHref(product.slug)} onClick={close} className="text-sm font-bold leading-snug text-[color:var(--lj-ink)] hover:underline">
                        {product.name}
                      </Link>
                      <span className="text-sm font-bold text-[color:var(--lj-ink)]">{formatBRL(product.price * qty)}</span>
                    </div>
                    <QuantityStepper
                      size="sm"
                      value={qty}
                      label={product.name}
                      onChange={(n) => setCartQty(product.slug, n)}
                      onRemove={() => removeFromCart(product.slug)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t border-[color:var(--lj-line)] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <OrderSummary totals={totals} title={null}>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/loja/carrinho" className="lj-btn lj-btn--secondary" onClick={close}>
                  Ver carrinho
                </Link>
                <Link href="/loja/checkout" className="lj-btn lj-btn--primary" onClick={close}>
                  Finalizar compra
                </Link>
              </div>
            </OrderSummary>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
