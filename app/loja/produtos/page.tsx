import type { Metadata } from "next";
import { ListingPage } from "../_components/listing-page";

export const metadata: Metadata = {
  title: "Todos os produtos",
  description: "Catálogo completo Save Concept: frascos injetáveis, kits e acessórios de aplicação, com envio refrigerado.",
};

export default function ProdutosPage() {
  return (
    <ListingPage
      mode={{ kind: "all" }}
      title="Todos os produtos"
      description="Catálogo completo de marca própria. Use os filtros para refinar por categoria, preço e condições."
      crumbs={[{ label: "Loja", href: "/loja" }, { label: "Todos os produtos" }]}
    />
  );
}
