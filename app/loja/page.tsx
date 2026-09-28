import Link from "next/link";
import { ArrowRight, FileCheck, ShieldCheck, Snowflake, Truck } from "lucide-react";
import { loadCatalog } from "@/lib/loja-catalog";
import { PRODUCTS, STORE, freeShippingOnAllPurchasable, getProduct, purchasableProducts } from "./_lib/catalog";
import { RecentlyViewedProducts } from "./_components/client-sections";
import { ProductCard } from "./_components/product-card";
import { HowItWorks } from "./_components/how-it-works";
import { CategoryCards, Differentiators, FaqList, Reviews, TrustStrip } from "./_components/sections";
import { JsonLd, ProductImage, SectionHeading } from "./_components/ui";

const heroImage = { base: "/loja/frasco-assinatura", alt: "Frasco Save Concept de marca própria", width: 960, height: 1440 };

export default async function LojaHomePage() {
  await loadCatalog();
  const brandImage = (getProduct("tirzepatida-60mg") ?? PRODUCTS[0])?.image ?? heroImage;
  const freeShipping = freeShippingOnAllPurchasable();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: STORE.name,
              legalName: STORE.legalName,
              taxID: STORE.cnpj,
              logo: "/save-concept-mark-v2.png",
              address: { "@type": "PostalAddress", addressLocality: "Cotia", addressRegion: "SP", addressCountry: "BR" },
            },
            {
              "@type": "WebSite",
              name: "Loja Save Concept",
              url: "/loja",
              potentialAction: { "@type": "SearchAction", target: "/loja/busca?q={search_term_string}", "query-input": "required name=search_term_string" },
            },
          ],
        }}
      />
      {/* Hero — one message, one primary action, a real product photo. */}
      <section className="lj-hero" aria-labelledby="hero-title">
        <div className="lj-container grid items-center gap-8 py-8 md:grid-cols-[1.1fr_0.9fr] md:py-14 lg:gap-12">
          <div className="flex flex-col items-start gap-5">
            <span className="lj-badge lj-badge--info h-7 px-3 text-xs">
              <ShieldCheck aria-hidden="true" /> Loja oficial · fabricação própria desde {STORE.since}
            </span>
            <h1 id="hero-title" className="lj-h1 max-w-[16ch]">
              Direto de quem fabrica, com autenticidade verificável
            </h1>
            <p className="lj-lead max-w-[48ch]">
              Formulado e envasado em {STORE.city}, enviado refrigerado e com nota fiscal. Cada unidade tem serial para
              você conferir a origem.
            </p>
            <div className="flex w-full flex-col gap-3 min-[420px]:w-auto min-[420px]:flex-row">
              <Link href="/loja/produtos" className="lj-btn lj-btn--primary lj-btn--lg">
                Ver produtos <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/" className="lj-btn lj-btn--secondary lj-btn--lg">
                <ShieldCheck aria-hidden="true" /> Verificar autenticidade
              </Link>
            </div>
            <ul className="lj-small flex flex-wrap gap-x-5 gap-y-2 text-[color:var(--lj-text)]">
              <li className="inline-flex items-center gap-1.5">
                <Snowflake className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> Envio refrigerado
              </li>
              <li className="inline-flex items-center gap-1.5">
                <FileCheck className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> Nota fiscal em todo pedido
              </li>
              {freeShipping && (
                <li className="inline-flex items-center gap-1.5">
                  <Truck className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> Frete grátis
                </li>
              )}
            </ul>
          </div>

          <div className="lj-card relative overflow-hidden">
            <span className="lj-media block aspect-[16/11] p-6 md:aspect-[5/4] md:p-8">
              <ProductImage image={heroImage} sizes="(max-width: 767px) 92vw, (max-width: 1199px) 42vw, 500px" priority />
            </span>
            <span className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-[var(--lj-r-md)] border border-[color:var(--lj-line)] bg-[color:var(--lj-surface)] p-3 shadow-[var(--lj-shadow-md)]">
              <ShieldCheck className="size-6 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" />
              <span className="lj-small text-[color:var(--lj-ink)]">
                <strong>Fabricação própria em {STORE.city}</strong>
                <span className="lj-muted block">Lote numerado e serial de autenticidade em cada unidade.</span>
              </span>
            </span>
          </div>
        </div>
      </section>

      <section aria-label="Por que comprar aqui" className="border-b border-[color:var(--lj-line)] bg-[color:var(--lj-surface)]">
        <div className="lj-container py-6">
          <TrustStrip compact />
        </div>
      </section>

      <section className="lj-section" aria-labelledby="categorias-title">
        <div className="lj-container">
          <SectionHeading id="categorias-title" eyebrow="Categorias" title="Encontre pelo tipo de produto" />
          <CategoryCards />
        </div>
      </section>

      <section className="lj-section" aria-labelledby="produtos-title">
        <div className="lj-container">
          <SectionHeading
            id="produtos-title"
            eyebrow="Catálogo"
            title="Nossos produtos"
            description="Catálogo enxuto de marca própria — cada item é formulado, produzido e embalado por nós."
            action={
              <Link href="/loja/produtos" className="lj-link lj-hit inline-flex items-center gap-1 text-sm">
                Ver todos com filtros <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            }
          />
          <ul className="lj-grid-products lj-grid-products--4">
            {PRODUCTS.map((p, index) => (
              <li key={p.slug}>
                <ProductCard product={p} listName="Home: nossos produtos" index={index} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What can actually be bought online today (vials/kits are shown for reference only). */}
      <section className="lj-section" aria-labelledby="online-title">
        <div className="lj-container">
          <SectionHeading
            id="online-title"
            eyebrow="Compra online"
            title="Disponíveis para comprar agora"
            description={`Frascos e kits ficam disponíveis apenas para consulta no momento. Os acessórios abaixo podem ser comprados online${freeShipping ? ", com frete grátis" : ""}.`}
          />
          <ul className="lj-grid-products lj-grid-products--4">
            {purchasableProducts().map((p, index) => (
              <li key={p.slug}>
                <ProductCard product={p} listName="Home: compra online" index={index} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lj-section lj-reveal" aria-labelledby="como-title">
        <div className="lj-container">
          <SectionHeading
            id="como-title"
            eyebrow="Como funciona"
            title="Do pedido à sua porta"
            description="Sem cobrança automática no site: você faz o pedido e combinamos o pagamento com você."
          />
          <HowItWorks />
        </div>
      </section>

      <section className="lj-section lj-reveal" aria-labelledby="diferenciais-title">
        <div className="lj-container">
          <SectionHeading
            id="diferenciais-title"
            eyebrow="Compra segura"
            title="Detalhes que a gente cuida sem você pedir"
          />
          <Differentiators />
        </div>
      </section>

      <RecentlyViewedProducts />

      <section className="lj-section lj-reveal" aria-labelledby="marca-title">
        <div className="lj-container">
          <div className="lj-card grid overflow-hidden lg:grid-cols-2">
            <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
              <p className="lj-eyebrow">Nossa marca</p>
              <h2 id="marca-title" className="lj-h2">
                De um forno de bancada a 50 mil frascos por ano
              </h2>
              <p className="lj-small lj-muted">
                Começamos em {STORE.since}, em {STORE.city}, com três formulações. Hoje testamos cada lote antes de liberar
                o envio — o mesmo cuidado do início, em escala maior.
              </p>
              <blockquote className="lj-small border-l-2 border-[color:var(--lj-primary)] py-1 pl-4 italic text-[color:var(--lj-ink)]">
                “A gente não terceiriza a produção pra depois só colar etiqueta. Se sai daqui com o nome Save Concept, foi a
                nossa equipe que formulou e envasou.”
                <footer className="lj-tiny lj-muted mt-1 font-semibold not-italic">— Equipe de produção Save Concept</footer>
              </blockquote>
            </div>
            <div className="lj-media min-h-[260px] p-8">
              <ProductImage image={brandImage} sizes="(max-width: 1023px) 60vw, 30vw" className="max-h-[360px]" />
            </div>
          </div>
        </div>
      </section>

      <Reviews />

      <section id="duvidas" className="lj-section lj-cv scroll-mt-40" aria-labelledby="duvidas-title">
        <div className="lj-container max-w-3xl">
          <SectionHeading id="duvidas-title" eyebrow="Guia de compra" title="Dúvidas frequentes" />
          <FaqList />
        </div>
      </section>


    </>
  );
}
