import type { Metadata } from "next";
import { CartView } from "../_components/cart-view";
import { Breadcrumbs } from "../_components/ui";

export const metadata: Metadata = {
  title: "Carrinho",
  robots: { index: false, follow: false },
};

export default function CarrinhoPage() {
  return (
    <div className="pb-4">
      <div className="lj-container pb-5 pt-6 sm:pt-8">
        <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Carrinho" }]} />
        <h1 className="lj-h2 mt-4 sm:text-[32px]">Seu carrinho</h1>
      </div>
      {/* Reserve the fold while cart data (localStorage) hydrates, so the
          footer never jumps in view (CLS). */}
      <div className="min-h-[80vh]">
        <CartView />
      </div>
    </div>
  );
}
