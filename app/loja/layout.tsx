import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AddedToCart } from "./_components/added-to-cart";
import { StoreFooter } from "./_components/footer";
import { StoreHeader } from "./_components/header";
import "./loja.css";

export const metadata: Metadata = {
  title: {
    default: "Loja Save Concept — Produtos originais com autenticidade verificável",
    template: "%s | Loja Save Concept",
  },
  description:
    "Compre produtos Save Concept de fabricação própria, com envio refrigerado, nota fiscal em todo pedido e autenticidade verificável por serial ou QR Code.",
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
    </div>
  );
}
