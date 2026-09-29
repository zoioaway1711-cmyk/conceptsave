import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCatalog } from "@/lib/loja-catalog";
import { preload } from "react-dom";
import Link from "next/link";
import { ChevronDown, ChevronLeft, Info, ShieldCheck } from "lucide-react";
import {
  STORE,
  categoryHref,
  getCategory,
  getProduct,
  imageSrc,
  imageSrcSet,
  productHref,
  productsBySlugs,
  offeredPayments,
  storageOf,
} from "../../_lib/catalog";
import { ProductRail, RecentlyViewedProducts, TrackView } from "../../_components/client-sections";
import { BuyBox, BuyTogether, ProductGallery } from "../../_components/product-detail";
import { Breadcrumbs, JsonLd } from "../../_components/ui";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await loadCatalog();
  const product = getProduct((await params).slug);
  if (!product) return { title: "Produto não encontrado" };
  return {
    title: `${product.name} — ${product.presentation}`,
    description: `${product.summary} Envio a partir de ${STORE.city}, nota fiscal em todo pedido${STORE.maxInstallments > 1 ? ` e ${STORE.maxInstallments}x sem juros` : ""}.`,
    openGraph: {
      title: product.name,
      description: product.summary,
      images: [{ url: imageSrc(product.image, 960), alt: product.image.alt }],
    },
  };
}

function Accordion({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open}>
      <summary className="flex min-h-14 items-center justify-between gap-4 py-3 text-left text-[15px] font-bold text-[color:var(--lj-ink)]">
        {title}
        <ChevronDown className="lj-faq-chevron size-5 shrink-0 text-[color:var(--lj-muted)]" aria-hidden="true" />
      </summary>
      <div className="lj-small flex flex-col gap-2 pb-4 text-[color:var(--lj-text)]">{children}</div>
    </details>
  );
}

function splitSpec(spec: string) {
  const i = spec.indexOf(":");
  return i > 0 ? { label: spec.slice(0, i), value: spec.slice(i + 1).trim() } : { label: "", value: spec };
}

export default async function ProdutoPage({ params }: Props) {
  await loadCatalog();
  const product = getProduct((await params).slug);
  if (!product) notFound();
  const category = getCategory(product.category)!;
  const related = productsBySlugs(product.related);
  // LCP image: start fetching it with the HTML, before the gallery hydrates.
  preload(imageSrc(product.image, 960), {
    as: "image",
    imageSrcSet: imageSrcSet(product.image),
    imageSizes: "(max-width: 1023px) 92vw, 560px",
    fetchPriority: "high",
  });
  const storageValue = storageOf(product);
  const storage = storageValue ? `Conservar em ${storageValue}` : null;

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

      <div className="lj-container pb-28 pt-6 sm:pt-8">
        <Link href={categoryHref(category.slug)} className="lj-link lj-hit inline-flex items-center gap-1 text-sm sm:hidden">
          <ChevronLeft className="size-4" aria-hidden="true" /> {category.name}
        </Link>
        <div className="hidden sm:block">
          <Breadcrumbs
            items={[
              { label: "Loja", href: "/loja" },
              { label: category.name, href: categoryHref(category.slug) },
              { label: product.name },
            ]}
          />
        </div>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <div className="lg:sticky lg:top-[calc(var(--lj-header-real,120px)+24px)] lg:self-start">
            <ProductGallery product={product} />
          </div>
          <BuyBox product={product} />
        </div>

        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <section aria-labelledby="info-title">
            <p className="lj-eyebrow mb-2">Informações do produto</p>
            <h2 id="info-title" className="lj-h2 mb-4 text-[22px]">
              Sobre {product.name}
            </h2>
            {product.healthNotice && (
              <p className="lj-alert lj-alert--warning mb-4">
                <Info aria-hidden="true" />
                <span>
                  Leia com atenção as informações e as instruções de conservação impressas no rótulo antes de qualquer uso.
                  Em caso de dúvida, consulte um profissional de saúde.
                </span>
              </p>
            )}
            {/* Premium-store pattern: scannable accordions instead of one long block. Product facts first, then commercial terms. */}
            <div className="lj-card lj-faq divide-y divide-[color:var(--lj-line)] px-4 sm:px-6">
              <Accordion title="Descrição" open>
                <p>{product.description}</p>
              </Accordion>
              <Accordion title={product.category === "acessorios" ? "O que vem na embalagem" : "Especificações"}>
                <dl className="divide-y divide-[color:var(--lj-line)]">
                  {product.specs.map((spec) => {
                    const { label, value } = splitSpec(spec);
                    return (
                      <div key={spec} className="grid grid-cols-1 gap-1 py-2.5 min-[420px]:grid-cols-[140px_1fr]">
                        <dt className="font-semibold text-[color:var(--lj-ink)]">{label || "Item"}</dt>
                        <dd>{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </Accordion>
              {storage && (
                <Accordion title="Conservação">
                  <p>{storage}.</p>
                  {product.coldChain && <p>O envio é feito em caixa térmica com gelo reciclável para manter a faixa de temperatura no trajeto.</p>}
                </Accordion>
              )}
              <Accordion title="Entrega e frete">
                <p>
                  {product.freeShipping ? "Frete grátis." : "Frete informado na confirmação do pedido."} Prazo médio de {STORE.delivery.window}, conforme
                  o CEP, a partir da confirmação do pagamento. {STORE.delivery.detail}
                </p>
              </Accordion>
              <Accordion title="Pagamento">
                <p>{STORE.paymentNote}</p>
                <ul className="list-disc pl-5">
                  {offeredPayments().map((p) => (
                    <li key={p.id}>
                      {p.label}: {p.detail}
                    </li>
                  ))}
                </ul>
              </Accordion>
              <Accordion title="Trocas e devoluções">
                <p>{STORE.returns}</p>
              </Accordion>
            </div>
          </section>

          <div className="flex flex-col gap-6">
            <BuyTogether product={product} />
            <Link href="/loja/autenticidade" className="lj-card lj-card--pad group flex items-start gap-3 hover:shadow-[var(--lj-shadow-md)]">
              <span className="lj-icon-circle">
                <ShieldCheck aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-[color:var(--lj-ink)]">Autenticidade verificável</strong>
                <span className="lj-small lj-muted">Cada unidade tem serial e QR Code no selo. Veja como conferir →</span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      <ProductRail id="relacionados-title" eyebrow="Relacionados" title="Você também pode precisar" products={related} />
      <RecentlyViewedProducts exclude={[product.slug]} />
    </>
  );
}
