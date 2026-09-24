import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AddedToCart } from "./_components/added-to-cart";
import { ConsentBanner } from "./_components/consent-banner";
import { StoreFooter } from "./_components/footer";
import { StoreHeader } from "./_components/header";
import { ThemeSync } from "./_components/theme-switcher";
import { Toaster } from "./_components/toaster";
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

export default function LojaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lj-scope lj-page">
      <a href="#conteudo" className="lj-skip-link">
        Pular para o conteúdo
      </a>
      <StoreHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <StoreFooter />
      <AddedToCart />
      <Toaster />
      <ConsentBanner />
      <ThemeSync />
    </div>
  );
}
