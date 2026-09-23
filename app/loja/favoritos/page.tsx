import type { Metadata } from "next";
import { FavoritesView } from "../_components/favorites-view";
import { Breadcrumbs } from "../_components/ui";

export const metadata: Metadata = {
  title: "Favoritos",
  robots: { index: false, follow: false },
};

export default function FavoritosPage() {
  return (
    <div className="lj-container py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Favoritos" }]} />
      <h1 className="lj-h2 mb-6 mt-4 sm:text-[32px]">Seus favoritos</h1>
      <FavoritesView />
    </div>
  );
}
