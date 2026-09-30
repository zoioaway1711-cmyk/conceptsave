import { Suspense } from "react";
import type { ProductImage as ProductImageData } from "../_lib/catalog";
import { Breadcrumbs, ProductImage, type Crumb } from "./ui";
import { ListingSkeleton, ProductListing, SearchTitle, type ListingMode } from "./product-listing";
import { SupportBanner } from "./support-banner";

/*
 * Shared PLP shell. The listing reads filters from the URL (useSearchParams),
 * so it renders inside Suspense: the skeleton is what streams first, with the
 * same grid geometry as the real cards so nothing jumps when it resolves.
 */
export function ListingPage({
  mode,
  title,
  description,
  crumbs,
  image,
}: {
  mode: ListingMode;
  title: React.ReactNode;
  description?: string;
  crumbs: Crumb[];
  /** Category hero image (premium PLP header). */
  image?: ProductImageData;
}) {
  return (
    <div className="lj-container py-6 sm:py-8">
      <Breadcrumbs items={crumbs} />
      <header
        className={
          image
            ? "lj-hero mb-6 mt-4 grid items-center gap-4 rounded-[var(--lj-r-xl)] border border-[color:var(--lj-line)] p-5 sm:mb-8 sm:grid-cols-[1fr_200px] sm:p-8"
            : "mb-6 mt-4 max-w-3xl sm:mb-8"
        }
      >
        <div>
        <h1 className="lj-h2 sm:text-[32px]">
          {mode.kind === "search" ? (
            <Suspense fallback={title}>
              <SearchTitle />
            </Suspense>
          ) : (
            title
          )}
        </h1>
        {description && <p className="lj-small lj-muted mt-2 max-w-2xl">{description}</p>}
        </div>
        {image && (
          <span className="lj-media hidden aspect-square rounded-[var(--lj-r-lg)] p-4 sm:flex">
            <ProductImage image={image} sizes="200px" priority decorative />
          </span>
        )}
      </header>
      <SupportBanner />
      <Suspense fallback={<ListingSkeleton />}>
        <ProductListing mode={mode} />
      </Suspense>
    </div>
  );
}
