import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AddedToCart } from "./_components/added-to-cart";
import { ConsentBanner } from "./_components/consent-banner";
import { StoreFooter } from "./_components/footer";
import { StoreHeader } from "./_components/header";
import { PageEffects } from "./_components/page-effects";
import { RouteFade } from "./_components/route-fade";
import { ThemeSync } from "./_components/theme-switcher";
import { Toaster } from "./_components/toaster";
import { loadCatalog } from "@/lib/loja-catalog";
import { CatalogProvider } from "./_components/catalog-provider";
import "./loja.css";

export const metadata: Metadata = {
  title: {
    default: "Loja Save Concept — Produtos originais com autenticidade verificável",
    template: "%s | Loja Save Concept",
  },
  description:
    "Compre produtos Save Concept de fabricação própria, com envio refrigerado, nota fiscal em todo pedido e autenticidade verificável por serial ou QR Code.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Loja Save Concept",
    images: [{ url: "/save-concept-share.png", alt: "Save Concept" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

// Catalog and settings come from the database on every request (with a
// short in-isolate cache) — never baked in at build time.
export const dynamic = "force-dynamic";

export default async function LojaLayout({ children }: { children: ReactNode }) {
  const catalog = await loadCatalog();
  return (
    <CatalogProvider snapshot={catalog}>
    <div className="lj-scope lj-page">
      <a href="#conteudo" className="lj-skip-link">
        Pular para o conteúdo
      </a>
      <StoreHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <RouteFade>{children}</RouteFade>
      </main>
      <StoreFooter />
      <AddedToCart />
      <Toaster />
      <ConsentBanner />
      <ThemeSync />
      <PageEffects />
    </div>
    </CatalogProvider>
  );
}
