import { ProductCardSkeleton } from "./_components/product-card";

/** Shown while a /loja route's server work streams in (same grid geometry as the real pages). */
export default function LojaLoading() {
  return (
    <div className="lj-container py-6 sm:py-8" aria-busy="true" aria-label="Carregando">
      <div className="lj-skeleton h-4 w-48" />
      <div className="lj-skeleton mb-8 mt-5 h-8 w-72 max-w-full" />
      <div className="lj-grid-products lj-grid-products--4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
