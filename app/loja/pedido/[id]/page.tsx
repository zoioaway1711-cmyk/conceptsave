import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderView } from "../../_components/order-view";

export const metadata: Metadata = {
  title: "Seu pedido",
  robots: { index: false, follow: false },
  // The URL may carry the order access token (?t=) until the client strips
  // it: no Referer leaves this page. Static, so the edge cache is unaffected.
  referrer: "no-referrer",
};

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="lj-container min-h-[80vh] py-6 sm:py-8">
      <Suspense fallback={<div className="lj-skeleton h-96 rounded-[var(--lj-r-lg)]" aria-busy="true" />}>
        <OrderView key={id} id={id} />
      </Suspense>
    </div>
  );
}
