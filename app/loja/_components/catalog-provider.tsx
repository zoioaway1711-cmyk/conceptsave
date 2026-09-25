"use client";

import { applyCatalog, type CatalogSnapshot } from "../_lib/catalog";

/**
 * Seeds the browser-side catalog registry with the exact snapshot the
 * server rendered with, before any child renders (so hydration matches).
 * Applying is idempotent per snapshot version.
 */
export function CatalogProvider({ snapshot, children }: { snapshot: CatalogSnapshot; children: React.ReactNode }) {
  applyCatalog(snapshot);
  return <>{children}</>;
}
