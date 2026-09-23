"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { productsBySlugs } from "../_lib/catalog";
import { useFavorites } from "../_lib/store";
import { useHydrated } from "./cart-view";
import { ProductCard, ProductCardSkeleton } from "./product-card";

export function FavoritesView() {
  const hydrated = useHydrated();
  const favorites = productsBySlugs(useFavorites());

  if (!hydrated) {
    return (
      <div className="lj-grid-products lj-grid-products--4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-14 text-center">
        <span className="lj-icon-circle size-14">
          <Heart aria-hidden="true" />
        </span>
        <h2 className="lj-h3">Nenhum favorito ainda</h2>
        <p className="lj-small lj-muted max-w-sm">
          Toque no coração de um produto para salvá-lo aqui. Os favoritos ficam guardados neste navegador.
        </p>
        <Link href="/loja/produtos" className="lj-btn lj-btn--primary mt-2">
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="lj-small lj-muted mb-4">
        {favorites.length} {favorites.length === 1 ? "produto salvo" : "produtos salvos"} neste navegador.
      </p>
      <ul className="lj-grid-products lj-grid-products--4">
        {favorites.map((p) => (
          <li key={p.slug}>
            <ProductCard product={p} headingLevel="h2" />
          </li>
        ))}
      </ul>
    </>
  );
}
