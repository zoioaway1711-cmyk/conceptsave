import type { Metadata } from "next";
import { ListingPage } from "../_components/listing-page";

export const metadata: Metadata = {
  title: "Busca",
  // Result pages are thin/duplicate content — keep them out of the index.
  robots: { index: false, follow: true },
};

export default function BuscaPage() {
  return (
    <ListingPage
      mode={{ kind: "search" }}
      title="Resultados da busca"
      crumbs={[{ label: "Loja", href: "/loja" }, { label: "Busca" }]}
    />
  );
}
