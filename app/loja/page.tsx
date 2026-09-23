import Link from "next/link";
import { ArrowRight, BadgePercent, FileCheck, ShieldCheck, Snowflake } from "lucide-react";
import {
  PRODUCTS,
  STORE,
  discountPct,
  formatBRL,
  getProduct,
  productHref,
} from "./_lib/catalog";
import { NewsletterForm, RecentlyViewed } from "./_components/client-sections";
import { ProductCard } from "./_components/product-card";
import { CategoryCards, Differentiators, FaqList, Reviews, TrustStrip } from "./_components/sections";
import { ProductImage, SectionHeading } from "./_components/ui";

const hero = getProduct("tirzepatida-60mg")!;
const single = hero;
const duo = getProduct("tirzepatida-60mg-kit-duo")!;
const duoUnitPrice = duo.price / (duo.units?.count ?? 1);
const brandImage = { base: "/loja/frasco-assinatura", alt: "Frasco Save Concept de marca própria", width: 960, height: 1440 };

export default function LojaHomePage() {
  return (
    <>
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
              <Link href="/loja/ofertas" className="lj-btn lj-btn--secondary lj-btn--lg">
                <BadgePercent aria-hidden="true" /> Ofertas
              </Link>
            </div>
            <ul className="lj-small flex flex-wrap gap-x-5 gap-y-2 text-[color:var(--lj-text)]">
              <li className="inline-flex items-center gap-1.5">
                <Snowflake className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> Envio refrigerado
              </li>
              <li className="inline-flex items-center gap-1.5">
                <FileCheck className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> Nota fiscal em todo pedido
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> {STORE.maxInstallments}x sem juros
              </li>
            </ul>
          </div>

          <Link
            href={productHref(hero.slug)}
            className="lj-card group relative hidden overflow-hidden md:block"
            aria-label={`${hero.name}: ${formatBRL(hero.price)}`}
          >
            <span className="lj-media block aspect-[5/4] p-8">
              <ProductImage image={hero.image} sizes="(max-width: 1199px) 42vw, 500px" priority />
            </span>
            <span className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-[var(--lj-r-md)] border border-[color:var(--lj-line)] bg-[color:var(--lj-surface)] p-3 shadow-[var(--lj-shadow-md)]">
              <span className="min-w-0">
                <span className="lj-tiny lj-muted block">{hero.badge}</span>
                <span className="block truncate font-bold text-[color:var(--lj-ink)]">{hero.name}</span>
              </span>
              <span className="text-right">
                {discountPct(hero) > 0 && <span className="lj-badge lj-badge--deal">-{discountPct(hero)}%</span>}
                <span className="lj-price block text-lg">{formatBRL(hero.price)}</span>
              </span>
            </span>
          </Link>
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
              <Link href="/loja/produtos" className="lj-link inline-flex items-center gap-1 text-sm">
                Ver todos com filtros <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            }
          />
          <ul className="lj-grid-products lj-grid-products--4">
            {PRODUCTS.map((p) => (
              <li key={p.slug}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Ticket médio: the kit's real per-unit price vs the single vial. */}
      <section className="lj-section" aria-labelledby="kit-title">
        <div className="lj-container">
          <div className="lj-card grid overflow-hidden md:grid-cols-[0.8fr_1.2fr]">
            <div className="lj-media aspect-[4/3] p-6 md:aspect-auto">
              <ProductImage image={duo.image} sizes="(max-width: 767px) 90vw, 40vw" className="max-h-[300px]" />
            </div>
            <div className="flex flex-col items-start gap-4 p-6 sm:p-8">
              <p className="lj-eyebrow">Kit Duo</p>
              <h2 id="kit-title" className="lj-h2">
                Dois frascos do mesmo lote, por {formatBRL(duoUnitPrice)} cada
              </h2>
              <p className="lj-small lj-muted max-w-[52ch]">
                No frasco individual, a Tirzepatida 60mg sai por {formatBRL(single.price)}. No Kit Duo, cada frasco sai por{" "}
                {formatBRL(duoUnitPrice)}, com lotes parelhos e bolsa térmica reutilizável inclusa.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={productHref(duo.slug)} className="lj-btn lj-btn--primary">
                  Ver Kit Duo <ArrowRight aria-hidden="true" />
                </Link>
                <span className="lj-small lj-muted">
                  {formatBRL(duo.price)} · {STORE.maxInstallments}x de {formatBRL(duo.price / STORE.maxInstallments)} sem juros
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lj-section" aria-labelledby="diferenciais-title">
        <div className="lj-container">
          <SectionHeading
            id="diferenciais-title"
            eyebrow="Compra segura"
            title="Detalhes que a gente cuida sem você pedir"
          />
          <Differentiators />
        </div>
      </section>

      <RecentlyViewed />

      <section className="lj-section" aria-labelledby="marca-title">
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

      <section id="duvidas" className="lj-section scroll-mt-40" aria-labelledby="duvidas-title">
        <div className="lj-container max-w-3xl">
          <SectionHeading id="duvidas-title" eyebrow="Guia de compra" title="Dúvidas frequentes" />
          <FaqList />
        </div>
      </section>

      <section className="lj-section" aria-label="Aviso de lançamentos">
        <div className="lj-container">
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
