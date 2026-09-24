import type { Metadata } from "next";
import { CheckoutView } from "../_components/checkout-view";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="lj-container py-6 sm:py-8">
      <h1 className="lj-h2 mb-5 sm:text-[30px]">Finalizar compra</h1>
      <div className="min-h-[80vh]">
        <CheckoutView />
      </div>
    </div>
  );
}
