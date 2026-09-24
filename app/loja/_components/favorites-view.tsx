"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Heart, ShoppingCart, Trash2 } from "lucide-react";
import { formatBRL, getProduct, type Product } from "../_lib/catalog";
import { availabilityOf, useAvailability, useStock } from "../_lib/stock";
import { notify } from "../_lib/feedback";
import { addToCart, removeFavorite, toggleFavorite, useFavoriteEntries, type FavoriteEntry } from "../_lib/store";
import { useHydrated } from "./cart-view";
import { RecentlyViewedProducts } from "./client-sections";
import { ProductCard, ProductCardSkeleton } from "./product-card";
import { CategoryCards } from "./sections";

/*
 * Favorites are stored in this browser only (no account backend). Prices
 * and availability always come from the live catalog; the price saved with
 * each favorite is used only to tell the shopper it changed.
 */

function PriceChange({ entry, product }: { entry: FavoriteEntry; product: Product }) {
  if (entry.price === product.price) return null;
  const down = product.price < entry.price;
  const Icon = down ? ArrowDownRight : ArrowUpRight;
  return (
    <p className={`lj-tiny inline-flex items-center gap-1 font-semibold ${down ? "text-[color:var(--lj-success)]" : "lj-muted"}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {down ? "Baixou" : "Mudou"} desde que você salvou: era {formatBRL(entry.price)}
    </p>
  );
}

function FavoriteActions({ product }: { product: Product }) {
  const availability = useAvailability(product);
  return (
    <div className="lj-pcard-raise grid grid-cols-[1fr_auto] gap-2">
      {availability.buyable ? (
        <button
          type="button"
          className="lj-btn lj-btn--secondary lj-btn--sm"
          onClick={() => {
            addToCart(product.slug, 1, { listName: "Favoritos" });
            removeFavorite(product.slug);
          }}
        >
          <ShoppingCart aria-hidden="true" /> Mover p/ carrinho
        </button>
      ) : (
        <span className="lj-tiny lj-muted self-center">
          {availability.offline ? "Só para consulta — sem venda online." : "Esgotado no momento."}
        </span>
      )}
      <button
        type="button"
        className="lj-btn lj-btn--danger-ghost lj-btn--sm lj-btn--icon"
        aria-label={`Remover ${product.name} dos favoritos`}
        onClick={() => {
          removeFavorite(product.slug);
          notify({
            tone: "info",
            title: "Removido dos favoritos",
            description: product.name,
            action: { label: "Desfazer", onClick: () => toggleFavorite(product.slug) },
          });
        }}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

export function FavoritesView() {
  const hydrated = useHydrated();
  const entries = useFavoriteEntries();
  const stock = useStock();

  if (!hydrated) {
    return (
      <div className="lj-grid-products lj-grid-products--4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const items = entries.flatMap((entry) => {
    const product = getProduct(entry.slug);
    return product ? [{ entry, product }] : [];
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-12 text-center">
          <span className="lj-icon-circle size-14">
            <Heart aria-hidden="true" />
          </span>
          <h2 className="lj-h3">Nenhum favorito ainda</h2>
          <p className="lj-small lj-muted max-w-sm">
            Toque no coração de um produto para salvá-lo aqui e comparar depois. Os favoritos ficam guardados neste navegador.
          </p>
          <Link href="/loja/produtos" className="lj-btn lj-btn--primary mt-2">
            Explorar produtos
          </Link>
        </div>
        <CategoryCards />
        <div className="-mx-[var(--lj-gutter)]">
          <RecentlyViewedProducts title="Você viu recentemente" />
        </div>
      </div>
    );
  }

  const buyable = items.filter((i) => availabilityOf(i.product, stock).buyable);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="lj-small lj-muted">
          {items.length} {items.length === 1 ? "produto salvo" : "produtos salvos"} neste navegador. Preços e estoque sempre atualizados.
        </p>
        {buyable.length > 1 && (
          <button
            type="button"
            className="lj-btn lj-btn--primary lj-btn--sm"
            onClick={() => {
              buyable.forEach(({ product }, i) => addToCart(product.slug, 1, { listName: "Favoritos", notify: i === buyable.length - 1 }));
            }}
          >
            <ShoppingCart aria-hidden="true" /> Adicionar todos ao carrinho
          </button>
        )}
      </div>
      <ul className="lj-grid-products lj-grid-products--4">
        {items.map(({ entry, product }, index) => (
          <li key={product.slug}>
            <ProductCard
              product={product}
              headingLevel="h2"
              listName="Favoritos"
              index={index}
              footer={
                <>
                  <PriceChange entry={entry} product={product} />
                  <FavoriteActions product={product} />
                </>
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}
