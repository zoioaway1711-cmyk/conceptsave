"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Check, CreditCard, Info, Share2, Snowflake, FileCheck, PackageCheck, ShieldCheck, ShoppingCart, X, ZoomIn } from "lucide-react";
import {
  STORE,
  formatBRL,
  installmentText,
  storageOf,
  imageSrc,
  productsBySlugs,
  offeredPayments,
  type Product,
} from "../_lib/catalog";
import { useAvailability } from "../_lib/stock";
import { notify, useFlash } from "../_lib/feedback";
import { addToCart } from "../_lib/store";
import { CepLookup, DeliveryInfo } from "./delivery";
import { OptInForm } from "./client-sections";
import { FavoriteButton, StockLabel } from "./product-card";
import { PriceBlock, ProductImage, QuantityStepper, StarRating } from "./ui";

const LENS = 140;
const ZOOM = 2.4;

export function ProductGallery({ product }: { product: Product }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number; bx: number; by: number; w: number; h: number } | null>(null);
  const [open, setOpen] = useState(false);
  const full = imageSrc(product.image, 960);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(LENS / 2, Math.min(e.clientX - rect.left, rect.width - LENS / 2));
    const y = Math.max(LENS / 2, Math.min(e.clientY - rect.top, rect.height - LENS / 2));
    setLens({
      x: x - LENS / 2,
      y: y - LENS / 2,
      bx: -(x * ZOOM - LENS / 2),
      by: -(y * ZOOM - LENS / 2),
      w: rect.width * ZOOM,
      h: rect.height * ZOOM,
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="lj-card relative overflow-hidden">
        <div
          ref={ref}
          className="lj-media relative aspect-square cursor-zoom-in p-6 sm:p-10"
          onPointerMove={onMove}
          onPointerLeave={() => setLens(null)}
          onClick={() => setOpen(true)}
        >
          <ProductImage image={product.image} sizes="(max-width: 1023px) 92vw, 560px" priority />
          {lens && (
            <div
              className="lj-lens"
              aria-hidden="true"
              style={{
                left: lens.x,
                top: lens.y,
                width: LENS,
                height: LENS,
                backgroundImage: `url(${full})`,
                backgroundSize: `${lens.w}px ${lens.h}px`,
                backgroundPosition: `${lens.bx}px ${lens.by}px`,
              }}
            />
          )}
        </div>
        <Dialog.Trigger asChild>
          <button type="button" className="lj-btn lj-btn--secondary lj-btn--sm absolute bottom-3 right-3">
            <ZoomIn aria-hidden="true" /> Ampliar
          </button>
        </Dialog.Trigger>
        <FavoriteButton product={product} className="absolute right-3 top-3" />
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="lj-scope lj-sheet-overlay fixed inset-0 z-50" />
        <Dialog.Content className="lj-scope fixed inset-3 z-50 flex flex-col overflow-hidden rounded-[var(--lj-r-xl)] bg-[color:var(--lj-surface)] shadow-[var(--lj-shadow-lg)] sm:inset-8">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--lj-line)] px-4 py-3">
            <Dialog.Title className="lj-display truncate text-base font-extrabold text-[color:var(--lj-ink)]">
              {product.name}
            </Dialog.Title>
            <Dialog.Close className="lj-header-icon" aria-label="Fechar ampliação">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="lj-sr-only">{product.image.alt}</Dialog.Description>
          <div className="lj-media min-h-0 flex-1 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- static pre-optimized WebP */}
            <img src={full} alt={product.image.alt} className="max-h-full" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Native share sheet on phones; copy-link fallback elsewhere. */
function ShareButton({ product }: { product: Product }) {
  return (
    <button
      type="button"
      className="lj-btn lj-btn--ghost lj-btn--sm"
      onClick={async () => {
        const url = window.location.href.split("#")[0];
        const data = { title: `${product.name} | Save Concept`, text: product.summary, url };
        if (typeof navigator.share === "function") {
          try {
            await navigator.share(data);
          } catch {
            // user closed the share sheet
          }
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          notify({ tone: "success", title: "Link do produto copiado" });
        } catch {
          notify({ tone: "error", title: "Não foi possível copiar o link" });
        }
      }}
    >
      <Share2 aria-hidden="true" /> Compartilhar
    </button>
  );
}

export function BuyBox({ product }: { product: Product }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);
  const availability = useAvailability(product);
  const [added, flashAdded] = useFlash();
  const storage = storageOf(product);
  const add = () => {
    addToCart(product.slug, qty);
    flashAdded();
  };

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [availability.buyable]);

  function buyNow() {
    addToCart(product.slug, qty, { notify: false });
    router.push("/loja/checkout");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="lj-small font-semibold text-[color:var(--lj-muted)]">{product.brand}</span>
          {product.badge && <span className="lj-badge lj-badge--info">{product.badge}</span>}
          <span className="ml-auto">
            <ShareButton product={product} />
          </span>
        </div>
        <h1 className="lj-h1 text-[26px] sm:text-[32px]">{product.name}</h1>
        <p className="lj-small text-[color:var(--lj-text)]">{product.presentation}</p>
        <StarRating rating={product.rating} count={product.reviewCount} />
      </div>

      <div className="lj-card lj-card--pad flex flex-col gap-4">
        <PriceBlock product={product} size="lg" />
        <StockLabel product={product} long />
        {product.coldChain && storage && (
          <p className="lj-tiny inline-flex items-center gap-1.5 font-semibold text-[color:var(--lj-primary)]">
            <Snowflake className="size-4" aria-hidden="true" /> Conservar em {storage} · enviado refrigerado
          </p>
        )}
        {availability.buyable ? (
          <>
            <div ref={ctaRef} className="flex flex-col gap-3 sm:flex-row">
              <QuantityStepper value={qty} onChange={setQty} label={product.name} />
              <button type="button" className="lj-btn lj-btn--primary lj-btn--lg flex-1" data-done={added ? "" : undefined} onClick={add}>
                {added ? <Check aria-hidden="true" /> : <ShoppingCart aria-hidden="true" />}
                {added ? "Adicionado ao carrinho" : "Adicionar ao carrinho"}
              </button>
            </div>
            <button type="button" className="lj-btn lj-btn--secondary lj-btn--block" onClick={buyNow}>
              Comprar agora
            </button>
          </>
        ) : availability.offline ? (
          <p className="lj-alert lj-alert--info">
            <Info aria-hidden="true" />
            <span>
              Este produto não está disponível para compra online no momento. As informações ficam aqui para consulta; a
              autenticidade de unidades já adquiridas pode ser verificada no portal.
            </span>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="lj-alert lj-alert--warning">
              <Info aria-hidden="true" />
              <span>Esgotado no momento. Deixe seu e-mail para saber quando voltar.</span>
            </p>
            <OptInForm kind="restock" sku={product.sku} productName={product.name} />
          </div>
        )}
        <ul className="lj-tiny grid grid-cols-1 gap-2 text-[color:var(--lj-text)] min-[420px]:grid-cols-3">
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" /> Autenticidade verificável
          </li>
          <li className="inline-flex items-center gap-1.5">
            <FileCheck className="size-4 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" /> Nota fiscal
          </li>
          <li className="inline-flex items-center gap-1.5">
            <PackageCheck className="size-4 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" /> 7 dias para devolver
          </li>
        </ul>
      </div>

      <div className="lj-card lj-card--pad flex flex-col gap-4">
        <h2 className="lj-h3">Entrega</h2>
        <CepLookup />
        <hr className="lj-divider" />
        <DeliveryInfo product={product} />
      </div>

      <div className="lj-card lj-card--pad flex flex-col gap-3">
        <h2 className="lj-h3 inline-flex items-center gap-2">
          <CreditCard className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> Pagamento
        </h2>
        <p className="lj-tiny lj-muted -mt-1">{STORE.paymentNote}</p>
        <ul className="flex flex-col gap-2">
          {offeredPayments().map((p) => (
            <li key={p.id} className="lj-small flex justify-between gap-3">
              <span className="font-semibold text-[color:var(--lj-ink)]">{p.label}</span>
              <span className="lj-muted text-right">{p.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile sticky buy bar — shown whenever the main CTA is off screen. */}
      {/* Sticky buy bar (all sizes) once the main CTA scrolls away — premium-store pattern. */}
      {!ctaVisible && availability.buyable && (
        <div className="lj-buybar lj-scope">
          <div className="lj-container flex items-center gap-3 !px-0 lg:!px-[var(--lj-gutter)]">
            <span className="lj-media hidden size-12 shrink-0 rounded-[var(--lj-r-sm)] p-1 lg:flex">
              <ProductImage image={product.image} sizes="48px" decorative />
            </span>
            <div className="min-w-0 flex-1">
              <p className="lj-tiny lj-muted truncate lg:text-sm lg:font-semibold lg:text-[color:var(--lj-ink)]">{product.name}</p>
              <p className="lj-price text-lg">{formatBRL(product.price)}</p>
            </div>
            <span className="lj-small lj-muted hidden lg:inline">{installmentText(product.price)}</span>
            <button type="button" className="lj-btn lj-btn--primary" onClick={add}>
              {added ? <Check aria-hidden="true" /> : <ShoppingCart aria-hidden="true" />} {added ? "Adicionado" : "Adicionar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * "Compre junto": the main product plus its explicitly configured
 * accessories (catalog.ts `boughtTogether`) — never medicine-to-medicine.
 * Everything starts selected but the total and each checkbox are fully
 * visible, and nothing is added until the shopper clicks the button.
 */
export function BuyTogether({ product }: { product: Product }) {
  const extras = useMemo(() => productsBySlugs(product.boughtTogether).filter((p) => p.available && p.purchasable), [product]);
  const [selected, setSelected] = useState<string[]>(() => extras.map((p) => p.slug));
  const [added, setAdded] = useState(false);
  const main = useAvailability(product);
  if (extras.length === 0 || !main.buyable) return null;

  const items = [product, ...extras.filter((p) => selected.includes(p.slug))];
  const total = items.reduce((sum, p) => sum + p.price, 0);

  return (
    <section className="lj-card lj-card--pad" aria-labelledby="junto-title">
      <h2 id="junto-title" className="lj-h3">
        Compre junto
      </h2>
      <p className="lj-small lj-muted mt-1">Acessórios de aplicação compatíveis com este produto.</p>
      <ul className="mt-4 flex flex-col divide-y divide-[color:var(--lj-line)]">
        <li className="flex items-center gap-3 py-3">
          <span className="flex size-[18px] items-center justify-center text-[color:var(--lj-primary)]">
            <Check className="size-4" aria-hidden="true" />
          </span>
          <span className="lj-media size-14 shrink-0 rounded-[var(--lj-r-sm)] p-1">
            <ProductImage image={product.image} sizes="56px" decorative />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[color:var(--lj-ink)]">Este produto: {product.name}</span>
            <span className="lj-tiny lj-muted">{product.presentation}</span>
          </span>
          <span className="text-sm font-bold text-[color:var(--lj-ink)]">{formatBRL(product.price)}</span>
        </li>
        {extras.map((p) => (
          <li key={p.slug}>
            <label className="flex cursor-pointer items-center gap-3 py-3">
              <input
                type="checkbox"
                className="size-[18px] accent-[color:var(--lj-primary)]"
                checked={selected.includes(p.slug)}
                onChange={() => {
                  setSelected((s) => (s.includes(p.slug) ? s.filter((x) => x !== p.slug) : [...s, p.slug]));
                  // A new selection hasn't been added yet: the button offers it again.
                  setAdded(false);
                }}
              />
              <span className="lj-media size-14 shrink-0 rounded-[var(--lj-r-sm)] p-1">
                <ProductImage image={p.image} sizes="56px" decorative />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[color:var(--lj-ink)]">{p.name}</span>
                <span className="lj-tiny lj-muted">{p.presentation}</span>
              </span>
              <span className="text-sm font-bold text-[color:var(--lj-ink)]">{formatBRL(p.price)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-3 border-t border-[color:var(--lj-line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="lj-muted">
            Total de {items.length} {items.length === 1 ? "item" : "itens"}:{" "}
          </span>
          <strong className="lj-price text-lg">{formatBRL(total)}</strong>
        </p>
        <button
          type="button"
          className="lj-btn lj-btn--primary"
          onClick={() => {
            items.forEach((p, i) => addToCart(p.slug, 1, { notify: i === 0 }));
            setAdded(true);
          }}
        >
          {added ? <Check aria-hidden="true" /> : <ShoppingCart aria-hidden="true" />}
          {added ? "Adicionados ao carrinho" : `Adicionar ${items.length} ao carrinho`}
        </button>
      </div>
    </section>
  );
}
