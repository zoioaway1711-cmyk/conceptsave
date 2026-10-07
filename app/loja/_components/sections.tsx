import Link from "next/link";
import { ArrowRight, BellRing, ChevronDown, Factory, FileCheck, FlaskConical, MessageCircle, PackageCheck, Quote, Snowflake, Truck } from "lucide-react";
import {
  CATEGORIES,
  DIFFERENTIATORS,
  STORE,
  TRUST_ITEMS,
  categoryHref,
  faq,
  productsInCategory,
  productHref,
  type PublicReview,
} from "../_lib/catalog";
import { ProductImage, SectionHeading, StarRating } from "./ui";

const TRUST_ICONS = { fabricacao: Factory, lote: FlaskConical, frio: Snowflake, garantia: PackageCheck } as const;
const DIFF_ICONS = { fabricante: MessageCircle, nota: FileCheck, rastreio: Truck, reposicao: BellRing } as const;

export function TrustStrip({ compact }: { compact?: boolean }) {
  return (
    <ul className={`grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4 ${compact ? "" : "lg:gap-6"}`}>
      {TRUST_ITEMS.map((item) => {
        const Icon = TRUST_ICONS[item.id];
        return (
          <li key={item.id} className="flex items-start gap-3">
            <span className="lj-icon-circle">
              <Icon aria-hidden="true" />
            </span>
            <span>
              <strong className="block text-sm text-[color:var(--lj-ink)]">{item.title}</strong>
              <span className="lj-tiny lj-muted">{item.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function CategoryCards() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
      {CATEGORIES.map((c) => {
        const count = productsInCategory(c.slug).length;
        return (
          <li key={c.slug}>
            <Link
              href={categoryHref(c.slug)}
              className="lj-card group flex h-full items-center gap-4 overflow-hidden p-3 transition-shadow hover:shadow-[var(--lj-shadow-md)] sm:flex-col sm:items-stretch sm:p-0"
            >
              <span className="lj-media size-20 shrink-0 rounded-[var(--lj-r-md)] p-2 sm:aspect-[4/3] sm:size-auto sm:rounded-none sm:p-5">
                <ProductImage image={c.image} sizes="(max-width: 639px) 80px, 33vw" />
              </span>
              <span className="flex flex-1 flex-col gap-1 sm:p-5 sm:pt-4">
                <span className="lj-h3">{c.name}</span>
                <span className="lj-tiny lj-muted">{c.description}</span>
                <span className="lj-tiny mt-1 inline-flex items-center gap-1 font-bold text-[color:var(--lj-primary)]">
                  {count} {count === 1 ? "produto" : "produtos"}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Differentiators() {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {DIFFERENTIATORS.map((item) => {
        const Icon = DIFF_ICONS[item.id];
        return (
          <li key={item.id} className="lj-card lj-card--pad">
            <span className="lj-icon-circle">
              <Icon aria-hidden="true" />
            </span>
            <h3 className="lj-h3 mt-3 text-[15px]">{item.title}</h3>
            <p className="lj-small lj-muted mt-1">{item.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** One approved customer review (home section and product page). */
export function ReviewCard({ review, showProduct }: { review: PublicReview; showProduct?: boolean }) {
  return (
    <figure className="lj-card lj-card--pad flex h-full flex-col gap-3">
      <Quote className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" />
      <StarRating rating={review.rating} />
      <blockquote className="lj-small flex-1 whitespace-pre-line text-[color:var(--lj-text)]">“{review.text}”</blockquote>
      <figcaption>
        <p className="text-xs font-bold text-[color:var(--lj-ink)]">
          {review.author} · {review.city}
        </p>
        <p className="lj-tiny lj-muted">
          Compra verificada · {review.month}
          {showProduct && (
            <>
              {" · "}
              <Link href={productHref(review.productSlug)} className="lj-link">
                {review.productName}
              </Link>
            </>
          )}
        </p>
      </figcaption>
    </figure>
  );
}

/*
 * Only real reviews: written from a delivered order's page and approved in
 * the admin (lib/loja-reviews.ts). With none approved yet, the section is
 * not rendered at all — never a placeholder or an invented testimonial.
 */
export function Reviews() {
  const { breakdown, latest } = STORE.reviews;
  // Counted from the reviews themselves, so the bars and the total always agree.
  const total = breakdown.reduce((n, r) => n + r.count, 0);
  if (total === 0) return null;
  const average = Math.round((breakdown.reduce((n, r) => n + r.stars * r.count, 0) / total) * 10) / 10;
  return (
    <section className="lj-section lj-reveal lj-cv" aria-labelledby="avaliacoes-title">
      <div className="lj-container">
        <SectionHeading id="avaliacoes-title" eyebrow="Avaliações" title="O que dizem os clientes" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <div className="lj-card lj-card--pad flex flex-col gap-3">
            <p className="lj-display text-4xl font-extrabold">{average.toFixed(1)}</p>
            <StarRating rating={average} />
            <p className="lj-small lj-muted">
              Média de {total} {total === 1 ? "avaliação" : "avaliações"} de clientes com pedido entregue.
            </p>
            <ul className="mt-2 flex flex-col gap-1.5" aria-label="Distribuição das notas">
              {breakdown.map((row) => {
                const pct = total ? Math.round((row.count / total) * 100) : 0;
                return (
                  <li key={row.stars} className="lj-tiny flex items-center gap-2">
                    <span className="w-16 shrink-0 whitespace-nowrap font-semibold text-[color:var(--lj-ink)]">
                      {row.stars} {row.stars === 1 ? "estrela" : "estrelas"}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--lj-soft)]">
                      <span className="block h-full rounded-full bg-[color:var(--lj-star)]" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="lj-muted w-8 shrink-0 text-right">{row.count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {latest.slice(0, 6).map((r) => (
              <li key={r.id}>
                <ReviewCard review={r} showProduct />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function FaqList({ items: given }: { items?: { question: string; answer: string }[] }) {
  const items = given ?? faq();
  return (
    <div className="lj-card lj-faq divide-y divide-[color:var(--lj-line)] px-4 sm:px-6">
      {items.map((item, i) => (
        <details key={item.question} open={i === 0}>
          <summary className="flex min-h-14 items-center justify-between gap-4 py-3 text-left text-[15px] font-bold text-[color:var(--lj-ink)]">
            {item.question}
            <ChevronDown className="lj-faq-chevron size-5 shrink-0 text-[color:var(--lj-muted)]" aria-hidden="true" />
          </summary>
          <p className="lj-small lj-muted pb-4">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
