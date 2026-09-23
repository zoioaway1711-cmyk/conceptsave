import type { ReactNode } from "react";
import "./loja.css";

export const metadata = {
  title: "Loja Save Concept — Produtos originais verificados",
  description:
    "Compre produtos originais Save Concept e verifique a autenticidade de cada unidade por serial ou QR Code após a entrega.",
};

export default function LojaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="loja-theme">
      <div className="loja-ambient" aria-hidden="true" />
      {children}
    </div>
  );
}
