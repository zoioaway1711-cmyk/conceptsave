import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES, categoryHref, getCategory, productsInCategory } from "../../_lib/catalog";
import { ListingPage } from "../../_components/listing-page";
import { JsonLd } from "../../_components/ui";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return { title: "Categoria não encontrada" };
  return { title: category.name, description: category.description };
}

export default async function CategoriaPage({ params }: Props) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  const products = productsInCategory(category.slug);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Loja", item: "/loja" },
            { "@type": "ListItem", position: 2, name: category.name, item: categoryHref(category.slug) },
          ],
        }}
      />
      <ListingPage
        mode={{ kind: "category", category: category.slug }}
        title={category.name}
        description={`${category.description} ${products.length} ${products.length === 1 ? "produto" : "produtos"}.`}
        crumbs={[{ label: "Loja", href: "/loja" }, { label: category.name }]}
      />
    </>
  );
}
