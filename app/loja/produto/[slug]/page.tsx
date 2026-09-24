import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import {
  FAQ,
  PRODUCTS,
  STORE,
  categoryHref,
  getCategory,
  getProduct,
  imageSrc,
  productHref,
  productsBySlugs,
} from "../../_lib/catalog";
import { ProductRail, RecentlyViewedProducts, TrackView } from "../../_components/client-sections";
import { BuyBox, BuyTogether, ProductGallery } from "../../_components/product-detail";
import { FaqList } from "../../_components/sections";
import { Breadcrumbs, JsonLd } from "../../_components/ui";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return { title: "Produto não encontrado" };
  return {
    title: `${product.name} — ${product.presentation}`,
    description: `${product.summary} Envio a partir de ${STORE.city}, nota fiscal em todo pedido e ${STORE.maxInstallments}x sem juros.`,
    openGraph: {
      title: product.name,
      description: product.summary,
      images: [{ url: imageSrc(product.image, 960), alt: product.image.alt }],
    },
  };
}

// Commercial questions only (shipping, payment, returns) — the product's own
// facts stay in the "Informações do produto" block above.
const PURCHASE_FAQ = FAQ.filter((f) => /envio|pagamento|trocar|nota fiscal/i.test(f.question));

function splitSpec(spec: string) {
  const i = spec.indexOf(":");
  return i > 0 ? { label: spec.slice(0, i), value: spec.slice(i + 1).trim() } : { label: "", value: spec };
}

export default async function ProdutoPage({ params }: Props) {
  const product = getProduct((await params).slug);
  if (!product) notFound();
  const category = getCategory(product.category)!;
  const related = productsBySlugs(product.related);

  return (
    <>
      <TrackView slug={product.slug} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Product",
              name: product.name,
              description: product.description,
              sku: product.sku,
              image: imageSrc(product.image, 960),
              brand: { "@type": "Brand", name: product.brand },
              // No Offer for products that can't be bought online.
              ...(product.purchasable ? { offers: {
                "@type": "Offer",
                price: product.price.toFixed(2),
                priceCurrency: "BRL",
                availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                url: productHref(product.slug),
                seller: { "@type": "Organization", name: STORE.legalName },
              } } : {}),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Loja", item: "/loja" },
                { "@type": "ListItem", position: 2, name: category.name, item: categoryHref(category.slug) },
                { "@type": "ListItem", position: 3, name: product.name, item: productHref(product.slug) },
              ],
            },
          ],
        }}
      />

      <div className="lj-container pb-28 pt-6 sm:pt-8 lg:pb-0">
        <Breadcrumbs
          items={[
            { label: "Loja", href: "/loja" },
            { label: category.name, href: categoryHref(category.slug) },
            { label: product.name },
          ]}
        />

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <div className="lg:sticky lg:top-[calc(var(--lj-header-h)+72px)] lg:self-start">
            <ProductGallery product={product} />
          </div>
          <BuyBox product={product} />
        </div>

        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <section className="lj-card lj-card--pad" aria-labelledby="info-title">
            <p className="lj-eyebrow mb-2">Informações do produto</p>
            <h2 id="info-title" className="lj-h2 text-[22px]">
              Sobre {product.name}
            </h2>
            <p className="lj-small mt-3 text-[color:var(--lj-text)]">{product.description}</p>
            <dl className="mt-5 divide-y divide-[color:var(--lj-line)] rounded-[var(--lj-r-md)] border border-[color:var(--lj-line)]">
              {product.specs.map((spec) => {
                const { label, value } = splitSpec(spec);
                return (
                  <div key={spec} className="lj-small grid grid-cols-1 gap-1 px-4 py-3 min-[420px]:grid-cols-[140px_1fr]">
                    <dt className="font-semibold text-[color:var(--lj-ink)]">{label || "Item"}</dt>
                    <dd className="text-[color:var(--lj-text)]">{value}</dd>
                  </div>
                );
              })}
            </dl>
            {product.healthNotice && (
              <p className="lj-alert lj-alert--warning mt-5">
                <Info aria-hidden="true" />
                <span>
                  Leia com atenção as informações e as instruções de conservação impressas no rótulo antes de qualquer uso.
                  Em caso de dúvida, consulte um profissional de saúde.
                </span>
              </p>
            )}
          </section>

          <div className="flex flex-col gap-6">
            <BuyTogether product={product} />
            <section aria-labelledby="compra-title">
              <h2 id="compra-title" className="lj-h3 mb-3">
                Dúvidas sobre a compra
              </h2>
              <FaqList items={PURCHASE_FAQ} />
            </section>
          </div>
        </div>
      </div>

      <ProductRail id="relacionados-title" eyebrow="Relacionados" title="Você também pode precisar" products={related} />
      <RecentlyViewedProducts exclude={[product.slug]} />
    </>
  );
}
