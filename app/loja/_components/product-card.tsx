"use client";

import Link from "next/link";
import { Heart, Snowflake, Truck } from "lucide-react";
import { productHref, type Product } from "../_lib/catalog";
import { addToCart, toggleFavorite, useFavorites } from "../_lib/store";
import { PriceBlock, ProductImage, StarRating } from "./ui";

export function FavoriteButton({ product, className = "" }: { product: Product; className?: string }) {
  const favorites = useFavorites();
  const active = favorites.includes(product.slug);
  return (
    <button
      type="button"
      className={`lj-fav ${className}`}
      aria-pressed={active}
      aria-label={active ? `Remover ${product.name} dos favoritos` : `Salvar ${product.name} nos favoritos`}
      onClick={() => toggleFavorite(product.slug)}
    >
      <Heart aria-hidden="true" />
    </button>
  );
}

export function ProductCard({
  product,
  priority,
  headingLevel = "h3",
}: {
  product: Product;
  priority?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
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
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <p className="lj-tiny lj-muted font-semibold">{product.brand}</p>
        <Heading className="text-[15px] font-bold leading-snug sm:text-base">
          <Link href={productHref(product.slug)} className="lj-pcard-link">
            {product.name}
          </Link>
        </Heading>
        <p className="lj-tiny lj-muted -mt-1">{product.presentation}</p>
        <StarRating rating={product.rating} count={product.reviewCount} compact />

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <PriceBlock product={product} />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {product.available ? (
              <span className="lj-stock">Em estoque</span>
            ) : (
              <span className="lj-stock lj-stock--out">Indisponível</span>
            )}
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
          <button
            type="button"
            className="lj-btn lj-btn--primary lj-btn--block lj-pcard-raise mt-1"
            disabled={!product.available}
            onClick={() => addToCart(product.slug)}
            aria-label={`Adicionar ${product.name} ao carrinho`}
          >
            {product.available ? "Adicionar" : "Indisponível"}
          </button>
        </div>
      </div>
    </article>
  );
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
