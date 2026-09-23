/*
 * Single source of truth for the storefront catalog and store policies.
 *
 * Every commercial claim shown anywhere in /loja (price, previous price,
 * installments, shipping, delivery window, returns, ratings) must come from
 * this file — components never hardcode their own. Values here were carried
 * over verbatim from the original single-page store; nothing was added.
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
  coldChain: boolean;
  /** Shows the read-the-label notice on the PDP (vials/kits). Deliberately
   *  doesn't classify the product — that's a regulatory call, not the UI's. */
  healthNotice: boolean;
  image: ProductImage;
  keywords: string[];
  related: string[];
  boughtTogether: string[];
};

export const STORE = {
  name: "Save Concept",
  legalName: "Save Concept Indústria e Comércio Ltda.",
  cnpj: "32.198.560/0001-07",
  city: "Cotia, SP",
  since: 2019,
  supportHours: "Seg. a sex., 9h às 18h",
  /** Left empty on purpose: no real number/profile is configured yet. */
  whatsappUrl: "",
  instagramUrl: "",
  maxInstallments: 3,
  delivery: {
    window: "3 a 7 dias úteis",
    detail: "Prazo médio, conforme o CEP. Código de rastreio enviado assim que o pedido sai do estoque.",
  },
  payment: [
    { id: "pix", label: "Pix", detail: "Confirmação imediata." },
    { id: "cartao", label: "Cartão de crédito", detail: "Em até 3x sem juros." },
    { id: "boleto", label: "Boleto", detail: "Envio após a compensação (até 2 dias úteis)." },
  ],
  returns: "Até 7 dias corridos após o recebimento, com lacre intacto. Reembolso na mesma forma de pagamento em até 10 dias úteis.",
} as const;

const img = (base: string, alt: string, width: number, height: number): ProductImage => ({ base, alt, width, height });

const IMG_TIRZEPATIDA = img("/loja/tirzepatida-60mg", "Frasco Save Concept Tirzepatida 60mg", 960, 1280);

export const PRODUCTS: Product[] = [
  {
    slug: "tirzepatida-60mg",
    sku: "tirzepatida-60-individual",
    brand: "Save Concept",
    name: "Tirzepatida 60mg",
    presentation: "Frasco individual · 60mg / 4ml",
    category: "frascos",
    summary: "Frasco multidose de 60mg, vidro borossilicato tipo I com selo de inviolabilidade.",
    description:
      "Mesma base que envasamos desde 2019, agora concentrada em 60mg por frasco. Vidro borossilicato tipo I, lacre com selo de inviolabilidade.",
    price: 1290,
    oldPrice: 1450,
    badge: "Mais vendido",
    rating: 4.9,
    reviewCount: 312,
    specs: [
      "Concentração: 60mg / 4ml",
      "Lote atual: SC-0924B · val. 08/2027",
      "Conservação: 2-8°C, ao abrigo de luz",
      "Uso: multidose, via subcutânea",
    ],
    freeShipping: true,
    available: true,
    coldChain: true,
    healthNotice: true,
    image: IMG_TIRZEPATIDA,
    keywords: ["tirzepatida", "tirzepatide", "frasco", "60mg", "injetavel"],
    related: ["tirzepatida-60mg-kit-duo", "kit-aplicacao-premium", "diluente-bacteriostatico"],
    boughtTogether: ["kit-aplicacao-premium", "diluente-bacteriostatico"],
  },
  {
    slug: "retatrutida-60mg",
    sku: "retatrutida-60-individual",
    brand: "Save Concept",
    name: "Retatrutida 60mg",
    presentation: "Frasco individual · 60mg / 4ml",
    category: "frascos",
    summary: "Envasada na mesma planta e sob o mesmo controle de lote da linha Tirzepatida.",
    description:
      "Linha que entrou no catálogo em 2025, envasada na mesma planta e sob o mesmo controle de lote da Tirzepatida — muda o princípio ativo, não o processo.",
    price: 1390,
    badge: "Novidade",
    rating: 4.9,
    reviewCount: 41,
    specs: [
      "Concentração: 60mg / 4ml",
      "Lote atual: SC-1024R · val. 10/2027",
      "Conservação: 2-8°C, ao abrigo de luz",
      "Uso: multidose, via subcutânea",
    ],
    freeShipping: true,
    available: true,
    coldChain: true,
    healthNotice: true,
    image: img("/loja/retatrutida-60mg", "Frasco Save Concept Retatrutida 60mg", 960, 1283),
    keywords: ["retatrutida", "retatrutide", "frasco", "60mg", "injetavel"],
    related: ["kit-aplicacao-premium", "diluente-bacteriostatico"],
    boughtTogether: ["kit-aplicacao-premium", "diluente-bacteriostatico"],
  },
  {
    slug: "tirzepatida-60mg-kit-duo",
    sku: "tirzepatida-60-kit-duo",
    brand: "Save Concept",
    name: "Tirzepatida 60mg — Kit Duo",
    presentation: "Kit com 2 frascos · 60mg / 4ml cada",
    category: "kits",
    summary: "Dois frascos do mesmo lote, com bolsa térmica reutilizável inclusa.",
    description:
      "Os mesmos dois frascos vendidos separado, saindo do mesmo lote e com desconto pra quem já fechou a rotina de 2 meses.",
    price: 2450,
    oldPrice: 2680,
    units: { count: 2, label: "frasco" },
    badge: "Kit com 2 unidades",
    rating: 4.8,
    reviewCount: 187,
    specs: [
      "Conteúdo: 2x frascos de 60mg / 4ml",
      "Lotes parelhos (mesma leva de produção)",
      "Conservação: 2-8°C, ao abrigo de luz",
      "Inclui: bolsa térmica reutilizável",
    ],
    freeShipping: true,
    available: true,
    coldChain: true,
    healthNotice: true,
    image: { ...IMG_TIRZEPATIDA, alt: "Frasco Save Concept Tirzepatida 60mg (kit com 2 unidades)" },
    keywords: ["tirzepatida", "tirzepatide", "kit", "duo", "2 frascos", "combo"],
    related: ["tirzepatida-60mg", "kit-aplicacao-premium", "diluente-bacteriostatico"],
    boughtTogether: ["kit-aplicacao-premium", "diluente-bacteriostatico"],
  },
  {
    slug: "kit-aplicacao-premium",
    sku: "kit-aplicacao-premium",
    brand: "Save Concept",
    name: "Kit de Aplicação Premium",
    presentation: "10 seringas + bolsa térmica + lenços",
    category: "acessorios",
    summary: "Seringas 31G, bolsa térmica compacta, lenços com álcool 70% e cartela de controle.",
    description:
      "Era o brinde que mandávamos nos primeiros pedidos — virou produto porque quase todo mundo pedia pra comprar avulso.",
    price: 219,
    badge: "Acessório",
    rating: 4.7,
    reviewCount: 98,
    specs: [
      "10 seringas 1ml com agulha 31G",
      "Bolsa térmica compacta",
      "6 lenços com álcool 70%",
      "Cartela de controle de aplicação",
    ],
    freeShipping: false,
    available: true,
    coldChain: false,
    healthNotice: false,
    image: img(
      "/loja/kit-aplicacao",
      "Kit de Aplicação Save Concept aberto, com seringas, bolsa térmica e lenços com álcool",
      960,
      877,
    ),
    keywords: ["kit", "aplicacao", "seringa", "seringas", "agulha", "31g", "bolsa termica", "alcool", "acessorio"],
    related: ["diluente-bacteriostatico"],
    boughtTogether: ["diluente-bacteriostatico"],
  },
  {
    slug: "diluente-bacteriostatico",
    sku: "diluente-bacteriostatico",
    brand: "Save Concept",
    name: "Diluente Bacteriostático",
    presentation: "NaCl 0,9% · 10ml",
    category: "acessorios",
    summary: "Frasco multiperfuração de 10ml, compatível com toda a linha injetável.",
    description:
      "O mesmo diluente que vai junto quando você fecha um kit completo — vendido separado pra quem só precisa repor.",
    price: 89,
    badge: "Essencial",
    rating: 4.9,
    reviewCount: 141,
    specs: [
      "Composição: NaCl 0,9% bacteriostático",
      "Volume: 10ml, multiperfuração",
      "Validade após aberto: 28 dias",
      "Compatível com toda a linha injetável",
    ],
    freeShipping: false,
    available: true,
    coldChain: false,
    healthNotice: false,
    image: img("/loja/diluente", "Frasco de diluente Save Concept com logo da marca", 960, 1440),
    keywords: ["diluente", "bacteriostatico", "agua", "nacl", "soro", "10ml", "acessorio"],
    related: ["kit-aplicacao-premium"],
    boughtTogether: ["kit-aplicacao-premium"],
  },
];

export const CATEGORIES: Category[] = [
  {
    slug: "frascos",
    name: "Frascos injetáveis",
    shortName: "Frascos",
    description: "Frascos multidose de 60mg, com lote numerado e testado antes do envio.",
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

export const RATING_BREAKDOWN = [
  { stars: 5, pct: 78 },
  { stars: 4, pct: 15 },
  { stars: 3, pct: 5 },
  { stars: 2, pct: 1 },
  { stars: 1, pct: 1 },
];

export const TESTIMONIALS = [
  {
    name: "Marina T.",
    location: "Campinas, SP",
    meta: "Compra verificada · ago/2025",
    text: "Peguei o kit duo e testei a bolsa térmica com termômetro de cozinha por curiosidade — segurou a faixa direitinho até o produto chegar. Chegou dois dias antes do previsto.",
    rating: 5,
  },
  {
    name: "Rafael C.",
    location: "Belo Horizonte, MG",
    meta: "Compra verificada · jun/2025",
    text: "Terceira compra. O que mais pesa pra mim é sair com nota fiscal em todo pedido, sem ter que pedir — facilita minha organização.",
    rating: 5,
  },
  {
    name: "Bianca A.",
    location: "Recife, PE",
    meta: "Compra verificada · set/2025",
    text: "Produto veio certinho, só acho que o prazo pra cá no Nordeste podia ser um pouco mais curto. Fora isso, sem nenhum problema com o pedido.",
    rating: 4,
  },
];

export const FAQ = [
  {
    question: "Vocês fabricam mesmo ou só revendem com etiqueta própria?",
    answer:
      "Fabricamos. A produção fica em Cotia (SP) desde 2019 — não compramos de laboratório terceiro pra revender com a nossa marca.",
  },
  {
    question: "Como funciona o envio de produtos que precisam de refrigeração?",
    answer:
      "Vai em caixa térmica com gelo reciclável, dimensionada pro tempo de trajeto até a sua região. Prazo médio de 3 a 7 dias úteis, dependendo do CEP.",
  },
  {
    question: "Quais formas de pagamento vocês aceitam?",
    answer:
      "Pix, cartão de crédito (em até 3x sem juros) e boleto. No boleto, o envio começa depois da compensação, que leva até 2 dias úteis.",
  },
  {
    question: "Posso trocar ou devolver um pedido?",
    answer:
      "Sim, em até 7 dias corridos após o recebimento, desde que o lacre esteja intacto. O reembolso cai na mesma forma de pagamento em até 10 dias úteis.",
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

/* ---------- derived helpers ---------- */

export const TOTAL_REVIEWS = PRODUCTS.reduce((sum, p) => sum + p.reviewCount, 0);
export const AVERAGE_RATING =
  Math.round((PRODUCTS.reduce((sum, p) => sum + p.rating * p.reviewCount, 0) / TOTAL_REVIEWS) * 10) / 10;

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
  return `ou ${n}x de ${formatBRL(price / n)} sem juros`;
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
