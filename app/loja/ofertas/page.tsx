import type { Metadata } from "next";
import { ListingPage } from "../_components/listing-page";

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Produtos Save Concept com preço reduzido em relação ao preço anterior.",
};

export default function OfertasPage() {
  return (
    <ListingPage
      mode={{ kind: "offers" }}
      title="Ofertas"
      description="Produtos com preço atual abaixo do preço anterior. O desconto mostrado em cada item é a diferença entre os dois."
      crumbs={[{ label: "Loja", href: "/loja" }, { label: "Ofertas" }]}
    />
  );
}
