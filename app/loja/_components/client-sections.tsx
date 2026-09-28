"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { BellRing, CheckCircle2 } from "lucide-react";
import { OPT_IN_TEXT, type OptInKind } from "../_lib/consent-texts";
import { ecommerce, toItem, track } from "../_lib/analytics";
import { getProduct, productsBySlugs, type Product } from "../_lib/catalog";
import { clearRecentlyViewed, markViewed, useRecentlyViewed } from "../_lib/store";
import { HoneypotField, MIN_FILL_MS, useAntiBot } from "./anti-bot";
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
        <button type="button" className="lj-link lj-hit text-sm" onClick={clearRecentlyViewed}>
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
 * E-mail opt-in (news or restock) backed by POST /api/loja/subscribe.
 * Consent is an explicit, unchecked-by-default checkbox with the exact
 * wording the server stores. Nothing is sent automatically: the team
 * exports the list from the admin.
 */
export function OptInForm({ kind, sku, productName }: { kind: OptInKind; sku?: string; productName?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "invalid" | "consent" | "limited" | "error">("idle");
  const { trapRef, antiBotFields } = useAntiBot(MIN_FILL_MS.subscribe);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Focus the field that needs fixing, so the error isn't only announced.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      document.getElementById(`${id}-email`)?.focus();
      return setState("invalid");
    }
    if (!consent) {
      document.getElementById(`${id}-consent`)?.focus();
      return setState("consent");
    }
    setState("sending");
    try {
      const { hp, elapsedMs } = await antiBotFields();
      const res = await fetch("/api/loja/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), kind, ...(sku ? { sku } : {}), consent: true, hp, elapsedMs }),
      });
      setState(res.status === 204 ? "done" : res.status === 429 ? "limited" : res.status === 400 ? "invalid" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="lj-alert lj-alert--success" role="status">
        <CheckCircle2 aria-hidden="true" />
        {kind === "restock"
          ? `Combinado! Avisaremos em ${email.trim()} quando ${productName ?? "o produto"} voltar ao estoque.`
          : `Pronto! ${email.trim()} está na lista de avisos de lançamentos e reposição.`}
      </p>
    );
  }

  const error =
    state === "invalid"
      ? "Confira o e-mail — use o formato nome@provedor.com."
      : state === "consent"
        ? "Marque a caixa de autorização para continuar."
        : state === "limited"
          ? "Muitas tentativas seguidas. Tente de novo em alguns minutos."
          : state === "error"
            ? "Não foi possível salvar agora. Tente de novo em instantes."
            : "";

  return (
    <form className="flex w-full flex-col gap-2" onSubmit={submit} noValidate>
      <HoneypotField inputRef={trapRef} />
      <div className="flex w-full gap-2">
        <label htmlFor={`${id}-email`} className="lj-sr-only">
          Seu e-mail
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={160}
          placeholder="Seu e-mail"
          className="lj-input"
          value={email}
          aria-invalid={state === "invalid" ? true : undefined}
          aria-describedby={error && state !== "consent" ? `${id}-err` : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state !== "sending") setState("idle");
          }}
        />
        <button type="submit" className="lj-btn lj-btn--primary shrink-0" disabled={state === "sending"} aria-busy={state === "sending"}>
          {state === "sending" ? <span className="lj-spinner" aria-hidden="true" /> : <BellRing aria-hidden="true" />}
          Avisar-me
        </button>
      </div>
      {/* The link sits outside the <label>: Safari treats a click on a link
          inside a label as a click on the checkbox and never navigates. */}
      <div className="lj-tiny flex items-start gap-2 text-[color:var(--lj-text)]">
        <input
          id={`${id}-consent`}
          type="checkbox"
          className="mt-px size-[18px] shrink-0 accent-[color:var(--lj-primary)]"
          checked={consent}
          aria-invalid={state === "consent" ? true : undefined}
          aria-describedby={state === "consent" ? `${id}-err` : undefined}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (state === "consent") setState("idle");
          }}
        />
        <span>
          <label htmlFor={`${id}-consent`}>{OPT_IN_TEXT[kind]}</label>{" "}
          <Link href="/loja/privacidade" className="lj-link">
            Privacidade
          </Link>
        </span>
      </div>
      {error && (
        <p id={`${id}-err`} className="lj-field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
