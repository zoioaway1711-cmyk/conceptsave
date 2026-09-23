import { Suspense } from "react";
import { Breadcrumbs, type Crumb } from "./ui";
import { ListingSkeleton, ProductListing, type ListingMode } from "./product-listing";

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
}: {
  mode: ListingMode;
  title: React.ReactNode;
  description?: string;
  crumbs: Crumb[];
}) {
  return (
    <div className="lj-container py-6 sm:py-8">
      <Breadcrumbs items={crumbs} />
      <header className="mb-6 mt-4 max-w-3xl sm:mb-8">
        <h1 className="lj-h2 sm:text-[32px]">{title}</h1>
        {description && <p className="lj-small lj-muted mt-2">{description}</p>}
      </header>
      <Suspense fallback={<ListingSkeleton />}>
        <ProductListing mode={mode} />
      </Suspense>
    </div>
  );
}
