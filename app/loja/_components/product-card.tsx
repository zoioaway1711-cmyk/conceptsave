"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowRight, Check, Eye, Heart, Info, Snowflake, Truck, X } from "lucide-react";
import { productHref, storageOf, type Product } from "../_lib/catalog";
import { ecommerce, toItem, track } from "../_lib/analytics";
import { notify, useFlash } from "../_lib/feedback";
import { useAvailability } from "../_lib/stock";
import { addToCart, toggleFavorite, useFavorites } from "../_lib/store";
import { PriceBlock, ProductImage, StarRating } from "./ui";

/*
 * States: normal / hover (red tint) / selected (filled + short pop) /
 * focus ring. There is deliberately no "loading" state: favorites persist
 * synchronously in this browser (no backend), so showing a spinner would
 * simulate a network save that doesn't exist.
 */
export function FavoriteButton({ product, className = "" }: { product: Product; className?: string }) {
  const favorites = useFavorites();
  const active = favorites.includes(product.slug);
  return (
    <button
      type="button"
      className={`lj-fav ${className}`}
      aria-pressed={active}
      aria-label={active ? `Remover ${product.name} dos favoritos` : `Salvar ${product.name} nos favoritos`}
      onClick={() => {
        const saved = toggleFavorite(product.slug);
        notify(
          saved
            ? { tone: "success", title: "Salvo nos favoritos", description: product.name, action: { label: "Ver lista", href: "/loja/favoritos" } }
            : {
                tone: "info",
                title: "Removido dos favoritos",
                description: product.name,
                action: { label: "Desfazer", onClick: () => toggleFavorite(product.slug) },
              },
        );
      }}
    >
      <Heart aria-hidden="true" />
    </button>
  );
}

export function ProductCard({
  product,
  priority,
  headingLevel = "h3",
  listName,
  index,
  footer,
}: {
  product: Product;
  priority?: boolean;
  headingLevel?: "h2" | "h3";
  /** Analytics list this card is shown in (select_item / add_to_cart). */
  listName?: string;
  index?: number;
  /** Extra actions under the card (e.g. favorites list controls). */
  footer?: React.ReactNode;
}) {
  const Heading = headingLevel;
  const availability = useAvailability(product);
  const [added, flashAdded] = useFlash();
  return (
    <article className="lj-pcard">
      <div className="lj-media">
        <ProductImage
          image={product.image}
          sizes="(max-width: 767px) 46vw, (max-width: 1199px) 30vw, 280px"
          priority={priority}
        />
        {product.badge && (
          <span className="lj-badge lj-badge--info absolute left-2.5 top-2.5 max-w-[calc(100%-64px)] truncate">
            {product.badge}
          </span>
        )}
        <FavoriteButton product={product} className="lj-pcard-raise absolute right-2 top-2" />
        <QuickView product={product} listName={listName} />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <p className="lj-tiny lj-muted font-semibold">{product.brand}</p>
        <Heading className="text-[15px] font-bold leading-snug sm:text-base">
          <Link
            href={productHref(product.slug)}
            className="lj-pcard-link"
            onClick={() =>
              listName && track({ name: "select_item", params: ecommerce([toItem(product, { index, item_list_name: listName })], listName) })
            }
          >
            {product.name}
          </Link>
        </Heading>
        <p className="lj-tiny lj-muted -mt-1">{product.presentation}</p>
        <StarRating rating={product.rating} count={product.reviewCount} compact />

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <PriceBlock product={product} />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <StockLabel product={product} />
            {product.freeShipping && (
              <span className="lj-tiny inline-flex items-center gap-1 font-semibold text-[color:var(--lj-primary)]">
                <Truck className="size-3.5" aria-hidden="true" /> Frete grátis
              </span>
            )}
            {product.coldChain && (
              <span className="lj-tiny lj-muted inline-flex items-center gap-1">
                <Snowflake className="size-3.5" aria-hidden="true" /> Refrigerado
              </span>
            )}
          </div>
          {availability.buyable ? (
            <button
              type="button"
              className="lj-btn lj-btn--primary lj-btn--block lj-pcard-raise mt-1"
              data-done={added ? "" : undefined}
              onClick={() => {
                addToCart(product.slug, 1, { listName });
                flashAdded();
              }}
              aria-label={`Adicionar ${product.name} ao carrinho`}
            >
              {added ? (
                <>
                  <Check aria-hidden="true" /> Adicionado
                </>
              ) : (
                "Adicionar"
              )}
            </button>
          ) : availability.offline ? (
            <Link href={productHref(product.slug)} className="lj-btn lj-btn--secondary lj-btn--block lj-pcard-raise mt-1" tabIndex={-1} aria-hidden="true">
              Ver detalhes
            </Link>
          ) : (
            <button type="button" className="lj-btn lj-btn--primary lj-btn--block lj-pcard-raise mt-1" disabled>
              Esgotado
            </button>
          )}
          {footer}
        </div>
      </div>
    </article>
  );
}

/*
 * Quick view (desktop): the key facts and the add button without leaving
 * the listing. Radix Dialog → focus trap, Esc, scroll lock, focus return.
 */
function QuickView({ product, listName }: { product: Product; listName?: string }) {
  const [open, setOpen] = useState(false);
  const availability = useAvailability(product);
  const [added, flashAdded] = useFlash();
  const storage = storageOf(product);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="lj-quick lj-pcard-raise lj-btn lj-btn--secondary lj-btn--sm" aria-label={`Visualização rápida: ${product.name}`}>
          <Eye aria-hidden="true" /> Ver rápido
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="lj-sheet-overlay fixed inset-0 z-50" />
        <Dialog.Content className="lj-scope lj-card fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[min(860px,94vw)] -translate-x-1/2 -translate-y-1/2 grid-cols-1 overflow-y-auto p-0 shadow-[var(--lj-shadow-lg)] md:grid-cols-2">
          <div className="lj-media aspect-square p-8">
            <ProductImage image={product.image} sizes="430px" />
          </div>
          <div className="flex flex-col gap-3 p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="lj-tiny lj-muted font-semibold">{product.brand}</p>
              <Dialog.Close className="lj-header-icon -mr-3 -mt-3" aria-label="Fechar">
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Title className="lj-h2 text-[24px]">{product.name}</Dialog.Title>
            <Dialog.Description className="lj-small lj-muted">{product.presentation}</Dialog.Description>
            <StarRating rating={product.rating} count={product.reviewCount} />
            <PriceBlock product={product} size="lg" />
            <StockLabel product={product} long />
            {product.coldChain && storage && (
              <p className="lj-tiny inline-flex items-center gap-1.5 font-semibold text-[color:var(--lj-primary)]">
                <Snowflake className="size-4" aria-hidden="true" /> Conservar em {storage}
              </p>
            )}
            <p className="lj-small text-[color:var(--lj-text)]">{product.summary}</p>
            <div className="mt-auto flex flex-col gap-2 pt-2">
              {availability.buyable ? (
                <button
                  type="button"
                  className="lj-btn lj-btn--primary lj-btn--lg"
                  data-done={added ? "" : undefined}
                  onClick={() => {
                    addToCart(product.slug, 1, { listName });
                    flashAdded();
                  }}
                >
                  {added ? <Check aria-hidden="true" /> : null} {added ? "Adicionado ao carrinho" : "Adicionar ao carrinho"}
                </button>
              ) : (
                <p className="lj-alert lj-alert--info">
                  <Info aria-hidden="true" />
                  {availability.offline ? "Disponível apenas para consulta — sem venda online no momento." : "Esgotado no momento."}
                </p>
              )}
              <Link href={productHref(product.slug)} className="lj-btn lj-btn--ghost" onClick={() => setOpen(false)}>
                Ver todos os detalhes <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Real availability only: stock from the server, never a made-up count. */
export function StockLabel({ product, long }: { product: Product; long?: boolean }) {
  const a = useAvailability(product);
  if (a.offline) return <span className="lj-stock lj-stock--out">{long ? "Não vendido online no momento" : "Venda online indisponível"}</span>;
  if (!a.inStock) return <span className="lj-stock lj-stock--out">Esgotado</span>;
  if (a.low) return <span className="lj-stock lj-stock--low">Últimas unidades</span>;
  return <span className="lj-stock">{long ? "Em estoque · pronto para envio" : "Em estoque"}</span>;
}

export function ProductCardSkeleton() {
  return (
    <div className="lj-pcard" aria-hidden="true">
      <div className="lj-skeleton aspect-square rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <div className="lj-skeleton h-3 w-16" />
        <div className="lj-skeleton h-4 w-4/5" />
        <div className="lj-skeleton h-3 w-3/5" />
        <div className="lj-skeleton mt-4 h-6 w-1/2" />
        <div className="lj-skeleton h-11 w-full" />
      </div>
    </div>
  );
}
