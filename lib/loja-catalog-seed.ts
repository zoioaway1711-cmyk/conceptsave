import type { Product, ProductImage, StoreSettings } from "@/app/loja/_lib/catalog";

/*
 * SERVER-ONLY seed for the storefront catalog. This is the data that
 * migration 0015 inserted into `loja_products` / `loja_settings`; after
 * that, the database is the source of truth (edited in the admin). This
 * file is used only by tests and as documentation of the initial state —
 * never imported by browser code, so prices don't ship in the JS bundle.
 *
 * Kept in sync with migration 0015's INSERTs by tests/loja-catalog.test.ts
 * ("migration 0015 seeded exactly…"), which runs the real SQL and compares.
 */

const img = (base: string, alt: string, width: number, height: number): ProductImage => ({ base, alt, width, height });

const IMG_TIRZEPATIDA = img("/loja/tirzepatida-60mg", "Frasco Save Concept Tirzepatida 60mg", 960, 1280);

export const SEED_PRODUCTS: Product[] = [
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
    purchasable: false,
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
    purchasable: false,
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
    purchasable: false,
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
    freeShipping: true,
    available: true,
    purchasable: true,
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
    freeShipping: true,
    available: true,
    purchasable: true,
    coldChain: false,
    healthNotice: false,
    image: img("/loja/diluente", "Frasco de diluente Save Concept com logo da marca", 960, 1440),
    keywords: ["diluente", "bacteriostatico", "agua", "nacl", "soro", "10ml", "acessorio"],
    related: ["kit-aplicacao-premium"],
    boughtTogether: ["kit-aplicacao-premium"],
  },
];

export const SEED_SETTINGS: StoreSettings = {
  supportHours: "Seg. a sex., 9h às 18h",
  whatsappUrl: "",
  instagramUrl: "",
  supportEmail: "",
  privacyEmail: "",
  maxInstallments: 3,
  deliveryWindow: "3 a 7 dias úteis",
  deliveryDetail: "Prazo médio, conforme o CEP. Código de rastreio enviado assim que o pedido sai do estoque.",
  paymentNote: "Não há cobrança automática no site: depois do pedido, nossa equipe entra em contato para combinar o pagamento.",
  returns: "Até 7 dias corridos após o recebimento, com lacre intacto. Reembolso na mesma forma de pagamento em até 10 dias úteis.",
};
