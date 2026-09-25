import type { ReactNode } from "react";
import { loadCatalog } from "@/lib/loja-catalog";
import { CatalogProvider } from "./_components/catalog-provider";

/*
 * Unlike the layout, a template re-renders on every navigation. Re-seeding
 * the browser catalog here keeps client components (cards, cart, drawer,
 * checkout) on the same catalog version as the page the server just
 * rendered — even when an admin changed prices mid-session.
 */
export default async function LojaTemplate({ children }: { children: ReactNode }) {
  const catalog = await loadCatalog();
  return <CatalogProvider snapshot={catalog}>{children}</CatalogProvider>;
}
