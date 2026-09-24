"use client";

import { useEffect, useId, useState } from "react";
import { Info, Mail } from "lucide-react";
import { ecommerce, toItem, track } from "../_lib/analytics";
import { getProduct, productsBySlugs, type Product } from "../_lib/catalog";
import { clearRecentlyViewed, markViewed, useRecentlyViewed } from "../_lib/store";
import { ProductCard } from "./product-card";
import { SectionHeading } from "./ui";

/** Fires view_item_list once per mount for a set of products. */
export function useTrackList(listName: string, products: Product[]) {
  const key = products.map((p) => p.slug).join(",");
  useEffect(() => {
    if (!key) return;
    const items = key.split(",").flatMap((slug, index) => {
      const p = getProduct(slug);
      return p ? [toItem(p, { index, item_list_name: listName })] : [];
    });
    track({ name: "view_item_list", params: ecommerce(items, listName) });
  }, [listName, key]);
}

export function ProductRail({
  title,
  eyebrow,
  description,
  products,
  id,
  action,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  products: Product[];
  id: string;
  action?: React.ReactNode;
}) {
  useTrackList(title, products);
  if (products.length === 0) return null;
  return (
    <section className="lj-section" aria-labelledby={id}>
      <div className="lj-container">
        <SectionHeading id={id} eyebrow={eyebrow} title={title} description={description} action={action} />
        <ul className="lj-rail">
          {products.map((p, index) => (
            <li key={p.slug}>
              <ProductCard product={p} listName={title} index={index} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Reusable "Vistos recentemente". History lives in this browser only
 * (anonymous store); renders nothing until there's enough of it, never
 * repeats a product, and can be cleared by the shopper.
 */
export function RecentlyViewedProducts({
  exclude = [],
  minItems = 1,
  max = 4,
  title = "Vistos recentemente",
}: {
  exclude?: string[];
  minItems?: number;
  max?: number;
  title?: string;
}) {
  const slugs = useRecentlyViewed();
  const products = productsBySlugs(slugs.filter((s) => !exclude.includes(s))).slice(0, max);
  if (products.length < minItems) return null;
  return (
    <ProductRail
      id="vistos-title"
      title={title}
      products={products}
      action={
        <button type="button" className="lj-link text-sm" onClick={clearRecentlyViewed}>
          Limpar histórico
        </button>
      }
    />
  );
}

export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    markViewed(slug);
    const product = getProduct(slug);
    if (product) track({ name: "view_item", params: ecommerce([toItem(product)]) });
  }, [slug]);
  return null;
}

/*
 * The e-mail list has no backend yet (no API route or table stores it).
 * Rather than flashing a fake "Cadastrado!", the form says plainly that
 * nothing was saved — see the pending items reported with this change.
 */
export function NewsletterForm() {
  const id = useId();
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="lj-card lj-card--pad flex flex-col items-start gap-4 bg-[color:var(--lj-primary-soft)] md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <span className="lj-icon-circle bg-[color:var(--lj-surface)]">
          <Mail aria-hidden="true" />
        </span>
        <div>
          <h2 className="lj-h3">Lançamentos e reposição de estoque</h2>
          <p className="lj-small lj-muted mt-1">Receba um aviso quando um lote novo for liberado.</p>
        </div>
      </div>
      <form
        className="flex w-full flex-col gap-2 md:w-auto md:min-w-[380px]"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <div className="flex w-full gap-2">
          <label htmlFor={id} className="lj-sr-only">
            Seu e-mail
          </label>
          <input id={id} type="email" required autoComplete="email" placeholder="Seu e-mail" className="lj-input" />
          <button type="submit" className="lj-btn lj-btn--primary shrink-0">
            Avisar-me
          </button>
        </div>
        {submitted && (
          <p className="lj-alert lj-alert--info" role="status">
            <Info aria-hidden="true" />
            O cadastro por e-mail ainda está sendo ativado e seu endereço não foi salvo. Tente novamente em breve.
          </p>
        )}
      </form>
    </div>
  );
}
