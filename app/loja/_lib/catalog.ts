/*
 * Single source of truth for the storefront catalog and store policies.
 *
 * Every commercial claim shown anywhere in /loja (price, previous price,
 * installments, shipping, delivery window, returns, ratings) comes from the
 * catalog registry below, which is filled from the database — components
 * never hardcode their own.
 * Relationships between products (`related`, `boughtTogether`) are
 * explicit, hand-configured lists: they only ever pair a product with its
 * own application accessories, never one medicine with another.
 */

export type CategorySlug = "frascos" | "kits" | "acessorios";

export type Category = {
  slug: CategorySlug;
  name: string;
  shortName: string;
  description: string;
  image: ProductImage;
};

export type ProductImage = {
  /** Base path without the `-480.webp` / `-960.webp` suffix. */
  base: string;
  alt: string;
  width: number;
  height: number;
};

export type Product = {
  slug: string;
  sku: string;
  brand: string;
  name: string;
  presentation: string;
  category: CategorySlug;
  summary: string;
  description: string;
  price: number;
  oldPrice?: number;
  /** Units inside the package — only set when > 1, drives "preço por unidade". */
  units?: { count: number; label: string };
  badge?: string;
  rating: number;
  reviewCount: number;
  specs: string[];
  freeShipping: boolean;
  available: boolean;
  /**
   * Whether it can be bought online. Vials and kits are shown but not sold
   * online until their regulatory status allows sale to consumers (owner
   * decision, see docs/loja-revisao-regulatoria.md). Server-enforced by
   * POST /api/loja/orders, not just hidden in the UI.
   */
  purchasable: boolean;
  coldChain: boolean;
  /** Shows the read-the-label notice on the PDP (vials/kits). Deliberately
   *  doesn't classify the product — that's a regulatory call, not the UI's. */
  healthNotice: boolean;
  image: ProductImage;
  keywords: string[];
  related: string[];
  boughtTogether: string[];
};

/** Store settings editable in the admin (loja_settings). */
export type StoreSettings = {
  supportHours: string;
  whatsappUrl: string;
  instagramUrl: string;
  supportEmail: string;
  privacyEmail: string;
  maxInstallments: number;
  deliveryWindow: string;
  deliveryDetail: string;
  paymentNote: string;
  returns: string;
  // Home page copy.
  heroTitle: string;
  heroLead: string;
  catalogTitle: string;
  catalogDescription: string;
  brandTitle: string;
  brandText: string;
  brandQuote: string;
};

/** Home-page copy keys of StoreSettings (edited in the admin's "Página inicial"). */
export const HOME_TEXT_KEYS = ["heroTitle", "heroLead", "catalogTitle", "catalogDescription", "brandTitle", "brandText", "brandQuote"] as const;
export type HomeTexts = Pick<StoreSettings, (typeof HOME_TEXT_KEYS)[number]>;

/**
 * An approved customer review. Only ever written from the page of a
 * DELIVERED order (lib/loja-reviews.ts) and published after moderation, so
 * "compra verificada" is literally true. Author is what the customer chose
 * to show (first name + initial by default), city comes from the order.
 */
export type PublicReview = { id: string; productSlug: string; productName: string; rating: number; text: string; author: string; city: string; month: string };

/** Store-wide review data for the home section: real counts per star and the latest approved reviews. */
export type ReviewsSummary = { breakdown: { stars: number; count: number }[]; latest: PublicReview[] };

/** Which payment methods are collected automatically on the site (server secrets configured). */
export type PaymentGateways = { pix: boolean; crypto: boolean };

export type CatalogSnapshot = { version: string; products: Product[]; settings: StoreSettings; gateways?: PaymentGateways; reviews?: ReviewsSummary };

/*
 * LIVE CATALOG REGISTRY.
 *
 * Products and store settings live in the database (loja_products /
 * loja_settings, edited in the admin) — not in this file. They are loaded:
 *  - on the server by `loadCatalog()` (lib/loja-catalog.ts), awaited by
 *    every /loja page, layout and API route before it reads the catalog;
 *  - in the browser by <CatalogProvider>, from the snapshot the server
 *    rendered with (so SSR and hydration always agree).
 *
 * `PRODUCTS` and `STORE` are updated IN PLACE by `applyCatalog`, so the
 * existing synchronous helpers (getProduct, STORE.delivery.window…) keep
 * working unchanged. Anything derived from them must be computed on call
 * (never at module load), since the registry starts empty.
 *
 * Known limitation: on the server the registry is shared by concurrent
 * requests in one isolate. It only changes when the cache expires AND an
 * admin actually edited something (same version → no-op), so a render in
 * flight at that instant could mix old/new values for a moment. Prices
 * are always re-validated server-side at order time, so this can never
 * charge a wrong amount.
 */
export const PRODUCTS: Product[] = [];

export const STORE = {
  // Company identity: fixed facts, not admin-editable.
  name: "Save Concept",
  legalName: "Save Concept Indústria e Comércio Ltda.",
  cnpj: "32.198.560/0001-07",
  city: "Cotia, SP",
  since: 2019,
  // Everything below comes from loja_settings via applyCatalog().
  supportHours: "",
  whatsappUrl: "",
  instagramUrl: "",
  supportEmail: "",
  privacyEmail: "",
  maxInstallments: 1,
  delivery: { window: "", detail: "" },
  payment: [] as { id: "pix" | "cartao" | "boleto" | "crypto"; label: string; detail: string }[],
  paymentNote: "",
  /** Pix charged on the site (QR code + automatic confirmation) instead of arranged by the team. */
  gateways: { pix: false, crypto: false } as PaymentGateways,
  returns: "",
  home: {} as HomeTexts,
  reviews: { breakdown: [], latest: [] } as ReviewsSummary,
};

/**
 * The payment methods to OFFER (lists, checkout): only the linked APIs, Pix
 * (pix-checkout) and crypto (crypto-checkout, while its gateway is on).
 * Pix stays offered even without its keys (then arranged by the team), so
 * checkout never ends up with no method. `STORE.payment` keeps every
 * method, card and boleto included, only for the labels of older orders.
 */
export function offeredPayments() {
  return STORE.payment.filter((p) => p.id === "pix" || (p.id === "crypto" && STORE.gateways.crypto));
}

/** The payment line shown to shoppers. The admin "Aviso de pagamento" is only for when Pix is not automatic. */
export function paymentNotice() {
  if (!STORE.gateways.pix) return STORE.paymentNote;
  return `Pagamento por Pix${STORE.gateways.crypto ? " ou cripto (USDT)" : ""} direto no site, com confirmação automática.`;
}

let appliedVersion = "";
let catalogVersion = 0;

/** Bumps whenever the registry changes — lets derived caches (search index) rebuild. */
export function currentCatalogVersion() {
  return catalogVersion;
}

/*
 * Admin-editable links end up in href / mailto. The admin form already
 * validates them (lib/loja-catalog.ts), but a row written any other way (D1
 * console, an old admin build, a restore) must still never become a
 * `javascript:`/`data:` link, a look-alike domain or a mailto with extra
 * headers (`?bcc=`). Same allowlist as the admin schema; anything else is
 * dropped and the UI simply hides that link.
 */
const WHATSAPP_URL_RE = /^https:\/\/(wa\.me|api\.whatsapp\.com)\/[^\s"'<>\\]*$/;
const INSTAGRAM_URL_RE = /^https:\/\/(www\.)?instagram\.com\/[^\s"'<>\\]*$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function safeExternalUrl(value: unknown, pattern: RegExp) {
  if (typeof value !== "string" || value.length > 300 || !pattern.test(value.trim())) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * The store WhatsApp link with a pre-filled message (wa.me and
 * api.whatsapp.com both read `text`). "" when no WhatsApp is configured.
 * encodeURIComponent, not URLSearchParams: WhatsApp expects %20, not "+".
 */
export function whatsappLink(message: string) {
  if (!STORE.whatsappUrl) return "";
  const url = new URL(STORE.whatsappUrl);
  url.searchParams.delete("text");
  return `${url.href}${url.search ? "&" : "?"}text=${encodeURIComponent(message)}`;
}

export function safeEmail(value: unknown) {
  return typeof value === "string" && value.length <= 120 && EMAIL_RE.test(value.trim()) ? value.trim() : "";
}

export function applyCatalog(snapshot: CatalogSnapshot) {
  if (snapshot.version === appliedVersion) return;
  appliedVersion = snapshot.version;
  catalogVersion++;
  PRODUCTS.splice(0, PRODUCTS.length, ...snapshot.products);
  const s = snapshot.settings;
  Object.assign(STORE, {
    supportHours: s.supportHours,
    whatsappUrl: safeExternalUrl(s.whatsappUrl, WHATSAPP_URL_RE),
    instagramUrl: safeExternalUrl(s.instagramUrl, INSTAGRAM_URL_RE),
    supportEmail: safeEmail(s.supportEmail),
    privacyEmail: safeEmail(s.privacyEmail),
    // Card is no longer offered (only the linked Pix/crypto APIs), so no
    // installments anywhere; the admin setting is kept for if card returns.
    maxInstallments: 1,
    delivery: { window: s.deliveryWindow, detail: s.deliveryDetail },
    payment: [
      { id: "pix", label: "Pix", detail: snapshot.gateways?.pix ? "À vista. QR Code gerado na hora e confirmação automática." : "À vista." },
      // Card and boleto are no longer offered; they stay listed only so older
      // orders keep their labels. Crypto is always listed for the same reason;
      // the checkout only offers it while the gateway is on (STORE.gateways.crypto).
      { id: "cartao", label: "Cartão de crédito", detail: "Não aceito em pedidos novos." },
      { id: "boleto", label: "Boleto", detail: "Não aceito em pedidos novos." },
      { id: "crypto", label: "Cripto (USDT)", detail: "USDT na rede Tron (TRC20). Cotação travada por 10 minutos e confirmação automática." },
    ],
    paymentNote: s.paymentNote,
    returns: s.returns,
    gateways: { pix: Boolean(snapshot.gateways?.pix), crypto: Boolean(snapshot.gateways?.crypto) },
    home: Object.fromEntries(HOME_TEXT_KEYS.map((k) => [k, s[k] ?? ""])) as HomeTexts,
    reviews: snapshot.reviews ?? { breakdown: [], latest: [] },
  });
}

const img = (base: string, alt: string, width: number, height: number): ProductImage => ({ base, alt, width, height });
const IMG_TIRZEPATIDA = img("/loja/tirzepatida-60mg", "Frasco Save Concept Tirzepatida 60mg", 960, 1280);

export const CATEGORIES: Category[] = [
  {
    slug: "frascos",
    name: "Frascos injetáveis",
    shortName: "Frascos",
    description: "Frascos da linha Save Concept e peptídeos da vitrine de estudo, com lote numerado. Apenas para consulta.",
    image: IMG_TIRZEPATIDA,
  },
  {
    slug: "kits",
    name: "Kits",
    shortName: "Kits",
    description: "Frascos do mesmo lote em conjunto, com preço por unidade menor.",
    image: IMG_TIRZEPATIDA,
  },
  {
    slug: "acessorios",
    name: "Acessórios de aplicação",
    shortName: "Acessórios",
    description: "Seringas, diluente e itens de conservação para a rotina de aplicação.",
    image: img("/loja/kit-aplicacao", "Kit de Aplicação Save Concept", 960, 877),
  },
];

export const TRUST_ITEMS = [
  { id: "fabricacao", title: "Fabricação própria", text: "Formulamos e envasamos em Cotia (SP) — não revendemos produto de terceiro." },
  { id: "lote", title: "Lote testado", text: "Toda leva de produção passa por controle interno antes do envio." },
  { id: "frio", title: "Cadeia fria", text: "Caixa térmica com gelo reciclável do nosso estoque até a sua porta." },
  { id: "garantia", title: "7 dias para devolução", text: "Devolução com reembolso em até 7 dias corridos, com lacre intacto." },
] as const;

export const DIFFERENTIATORS = [
  { id: "fabricante", title: "Fala direto com quem fabrica", text: "Dúvida sobre lote, conservação ou uso vai direto pra equipe que produziu." },
  { id: "nota", title: "Nota fiscal em todo pedido", text: "Toda venda sai com nota fiscal, na caixa e por e-mail — sem precisar pedir." },
  { id: "rastreio", title: "Rastreio desde a expedição", text: "Código de rastreio liberado assim que o pedido sai do estoque." },
  { id: "reposicao", title: "Avisamos a reposição", text: "Produto esgotado? Você recebe e-mail assim que o lote seguinte for liberado." },
] as const;

/** FAQ answers that quote store policies are built from the live settings. */
export function faq() {
  return [
  {
    question: "Vocês fabricam mesmo ou só revendem com etiqueta própria?",
    answer:
      "Fabricamos. A produção fica em Cotia (SP) desde 2019 — não compramos de laboratório terceiro pra revender com a nossa marca.",
  },
  {
    question: "Como funciona o envio de produtos que precisam de refrigeração?",
    answer:
      `Vai em caixa térmica com gelo reciclável, dimensionada pro tempo de trajeto até a sua região. Prazo médio de ${STORE.delivery.window}, dependendo do CEP.`,
  },
  {
    question: "Quais formas de pagamento vocês aceitam?",
    answer:
      `Pix${STORE.gateways.crypto ? " e cripto (USDT na rede Tron, para pedidos a partir de R$ 20,00)" : ""}. Não aceitamos cartão nem boleto. ${paymentNotice()}`,
  },
  {
    question: "Posso trocar ou devolver um pedido?",
    answer:
      `Sim. ${STORE.returns}`,
  },
  {
    question: "Emitem nota fiscal?",
    answer: "Sim, em todos os pedidos, sem exceção — vai impressa na caixa e também por e-mail.",
  },
  {
    question: "Como sei se o lote do meu produto é o mais recente?",
    answer:
      "O número do lote e a validade ficam impressos no rótulo. Se quiser confirmar antes de comprar, é só chamar o nosso atendimento.",
  },
  ];
}

/* ---------- derived helpers (computed on call — the registry starts empty) ---------- */

export function totalReviews() {
  return PRODUCTS.reduce((sum, p) => sum + p.reviewCount, 0);
}

export function averageRating() {
  const total = totalReviews();
  return total ? Math.round((PRODUCTS.reduce((sum, p) => sum + p.rating * p.reviewCount, 0) / total) * 10) / 10 : 0;
}

/** Discounts that can actually be bought online — drives every "Ofertas" entry point. */
export function purchasableOffers() {
  return PRODUCTS.filter((p) => p.purchasable && p.oldPrice !== undefined && p.oldPrice > p.price);
}

export function purchasableProducts() {
  return PRODUCTS.filter((p) => p.purchasable);
}

/**
 * True only while every product sold online ships free — the condition
 * behind any blanket "frete grátis" claim (banner, footer, hero). Read from
 * the live catalog, so an admin change can never leave a stale promise.
 */
export function freeShippingOnAllPurchasable() {
  const sold = purchasableProducts();
  return sold.length > 0 && sold.every((p) => p.freeShipping);
}

/** Storage instructions exactly as printed in the product's specs (e.g. "2-8°C, ao abrigo de luz"). */
export function storageOf(product: Pick<Product, "specs">) {
  const spec = product.specs.find((s) => /^conserva[cç][aã]o:/i.test(s));
  return spec ? spec.slice(spec.indexOf(":") + 1).trim() : null;
}

export function getProduct(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getCategory(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function productsBySlugs(slugs: readonly string[]) {
  return slugs.map(getProduct).filter((p): p is Product => Boolean(p));
}

export function productsInCategory(slug: CategorySlug) {
  return PRODUCTS.filter((p) => p.category === slug);
}

export function discountPct(product: Pick<Product, "price" | "oldPrice">) {
  if (!product.oldPrice || product.oldPrice <= product.price) return 0;
  return Math.round((1 - product.price / product.oldPrice) * 100);
}

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function installmentText(price: number) {
  const n = STORE.maxInstallments;
  return n > 1 ? `ou ${n}x de ${formatBRL(price / n)} sem juros` : "à vista";
}

export function productHref(slug: string) {
  return `/loja/produto/${slug}`;
}

export function categoryHref(slug: CategorySlug) {
  return `/loja/categoria/${slug}`;
}

export function imageSrcSet(image: ProductImage) {
  return `${image.base}-480.webp 480w, ${image.base}-960.webp 960w`;
}

export function imageSrc(image: ProductImage, size: 480 | 960 = 960) {
  return `${image.base}-${size}.webp`;
}
