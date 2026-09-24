import Link from "next/link";
import { ChevronRight, Minus, Plus, Star, Trash2 } from "lucide-react";
import {
  discountPct,
  formatBRL,
  imageSrc,
  imageSrcSet,
  installmentText,
  type Product,
  type ProductImage as ProductImageData,
} from "../_lib/catalog";

/*
 * Stateless storefront primitives, shared by server and client components.
 * Anything that needs state/hooks lives in its own "use client" file.
 */

/**
 * Plain <img> with a real srcset of the pre-optimized WebP variants in
 * public/loja/. next/image is avoided on purpose: this deployment has no
 * Cloudflare Images binding, so vinext's /_next/image serves the original
 * multi-megabyte PNG for every width — the static variants are ~95% lighter.
 */
export function ProductImage({
  image,
  sizes,
  priority,
  className,
  decorative,
}: {
  image: ProductImageData;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Thumbnail next to the product's own name: hide it from assistive tech
   *  so links/options are announced by name, not by photo description. */
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see comment above
    <img
      src={imageSrc(image, 960)}
      srcSet={imageSrcSet(image)}
      sizes={sizes}
      alt={decorative ? "" : image.alt}
      width={image.width}
      height={image.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}

export function StarRating({ rating, count, compact }: { rating: number; count?: number; compact?: boolean }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="lj-stars" role="img" aria-label={`Nota ${rating.toFixed(1)} de 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={i < rounded ? "fill-current" : "is-empty fill-current"} aria-hidden="true" />
        ))}
      </span>
      {count !== undefined && (
        <span className="lj-tiny lj-muted">
          {compact ? `(${count})` : `${rating.toFixed(1)} · ${count} avaliações`}
        </span>
      )}
    </span>
  );
}

export function PriceBlock({ product, size = "md" }: { product: Product; size?: "md" | "lg" }) {
  const pct = discountPct(product);
  return (
    <div className="flex flex-col gap-0.5">
      {product.oldPrice && pct > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="lj-price-old">
            <span className="lj-sr-only">Preço anterior: </span>
            {formatBRL(product.oldPrice)}
          </span>
          <span className="lj-badge lj-badge--deal">-{pct}%</span>
        </span>
      )}
      <span className={`lj-price ${size === "lg" ? "text-[32px]" : "text-[20px] sm:text-[22px]"}`}>
        {product.oldPrice && pct > 0 && <span className="lj-sr-only">Preço atual: </span>}
        {formatBRL(product.price)}
      </span>
      <span className="lj-tiny lj-muted">{installmentText(product.price)}</span>
      {product.units && (
        <span className="lj-tiny font-semibold text-[color:var(--lj-success)]">
          {formatBRL(product.price / product.units.count)} por {product.units.label}
        </span>
      )}
    </div>
  );
}

export function QuantityStepper({
  value,
  onChange,
  onRemove,
  size = "md",
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  /** When set, the "-" button turns into a remove button at quantity 1. */
  onRemove?: () => void;
  size?: "sm" | "md";
  label: string;
}) {
  const atMin = value <= 1;
  return (
    <div className={`lj-stepper ${size === "sm" ? "lj-stepper--sm" : ""}`} role="group" aria-label={`Quantidade de ${label}`}>
      {atMin && onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remover ${label}`}>
          <Trash2 aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={() => onChange(value - 1)} disabled={atMin} aria-label="Diminuir quantidade">
          <Minus aria-hidden="true" />
        </button>
      )}
      <output aria-live="polite" aria-label="Quantidade">
        {value}
      </output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 99} aria-label="Aumentar quantidade">
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Você está em" className="lj-breadcrumbs">
      <ol>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.label} className="inline-flex items-center gap-1.5">
              {item.href && !last ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined}>{item.label}</span>
              )}
              {!last && <ChevronRight aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
      <div className="max-w-2xl">
        {eyebrow && <p className="lj-eyebrow mb-2">{eyebrow}</p>}
        <h2 id={id} className="lj-h2">
          {title}
        </h2>
        {description && <p className="lj-small lj-muted mt-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Serializes JSON-LD safely (escapes `<` so a value can't close the tag). */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
