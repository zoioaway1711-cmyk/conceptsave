"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Syringe,
  Sparkles,
  ShoppingBag,
  Plus,
  Minus,
  X,
  PackageCheck,
  ArrowRight,
  Star,
  FlaskConical,
  Factory,
  Snowflake,
  ChevronDown,
  Mail,
  Quote,
  MessageCircle,
  FileCheck,
  Truck,
  BellRing,
  AtSign,
  CreditCard,
  QrCode,
  Barcode,
  ZoomIn,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  oldPrice?: number;
  badge: string;
  rating: number;
  reviewCount: number;
  specs: string[];
  freeShipping?: boolean;
  media:
    | { kind: "image"; src: string; alt: string; width: number; height: number; frame?: boolean; card?: boolean }
    | { kind: "icon" };
};

const PRODUCTS: Product[] = [
  {
    id: "tirzepatida-60-individual",
    name: "Tirzepatida 60mg",
    tagline: "Frasco individual",
    description:
      "Mesma base que envasamos desde 2019, agora concentrada em 60mg por frasco. Vidro borossilicato tipo I, lacre com selo de inviolabilidade.",
    price: 1290,
    oldPrice: 1450,
    badge: "Mais vendido",
    rating: 4.9,
    reviewCount: 312,
    specs: ["Concentração: 60mg / 4ml", "Lote atual: SC-0924B · val. 08/2027", "Conservação: 2-8°C, ao abrigo de luz", "Uso: multidose, via subcutânea"],
    freeShipping: true,
    media: { kind: "image", src: "/save-concept-tirzepatida-60mg-real.png", alt: "Frasco Save Concept Tirzepatida 60mg", width: 1086, height: 1448 },
  },
  {
    id: "retatrutida-60-individual",
    name: "Retatrutida 60mg",
    tagline: "Frasco individual",
    description:
      "Linha que entrou no catálogo em 2025, envasada na mesma planta e sob o mesmo controle de lote da Tirzepatida — muda o princípio ativo, não o processo.",
    price: 1390,
    badge: "Novidade",
    rating: 4.9,
    reviewCount: 41,
    specs: ["Concentração: 60mg / 4ml", "Lote atual: SC-1024R · val. 10/2027", "Conservação: 2-8°C, ao abrigo de luz", "Uso: multidose, via subcutânea"],
    freeShipping: true,
    media: { kind: "image", src: "/save-concept-retatrutida-60mg-real.png", alt: "Frasco Save Concept Retatrutida 60mg", width: 1085, height: 1450 },
  },
  {
    id: "tirzepatida-60-kit-duo",
    name: "Tirzepatida 60mg",
    tagline: "Kit Duo · 2 frascos",
    description:
      "Os mesmos dois frascos vendidos separado, saindo do mesmo lote e com desconto pra quem já fechou a rotina de 2 meses.",
    price: 2450,
    oldPrice: 2680,
    badge: "Kit com 2 unidades",
    rating: 4.8,
    reviewCount: 187,
    specs: ["2x frascos de 60mg / 4ml", "Lotes parelhos (mesma leva de produção)", "Conservação: 2-8°C, ao abrigo de luz", "Bolsa térmica reutilizável inclusa"],
    freeShipping: true,
    media: { kind: "image", src: "/save-concept-tirzepatida-60mg-real.png", alt: "Frasco Save Concept Tirzepatida 60mg (kit com 2 unidades)", width: 1086, height: 1448 },
  },
  {
    id: "kit-aplicacao-premium",
    name: "Kit de Aplicação Premium",
    tagline: "Acessório essencial",
    description:
      "Era o brinde que mandávamos nos primeiros pedidos — virou produto porque quase todo mundo pedia pra comprar avulso.",
    price: 219,
    badge: "Acessório",
    rating: 4.7,
    reviewCount: 98,
    specs: ["10 seringas 1ml com agulha 31G", "Bolsa térmica compacta", "6 lenços com álcool 70%", "Cartela de controle de aplicação"],
    media: {
      kind: "image",
      src: "/save-concept-kit-aplicacao-real.png",
      alt: "Kit de Aplicação Save Concept aberto, com seringas, bolsa térmica e lenços com álcool",
      width: 1312,
      height: 1199,
      card: true,
    },
  },
  {
    id: "diluente-bacteriostatico",
    name: "Diluente Bacteriostático",
    tagline: "NaCl 0,9% · 10ml",
    description:
      "O mesmo diluente que vai junto quando você fecha um kit completo — vendido separado pra quem só precisa repor.",
    price: 89,
    badge: "Essencial",
    rating: 4.9,
    reviewCount: 141,
    specs: ["NaCl 0,9% bacteriostático", "Volume: 10ml, multiperfuração", "Validade após aberto: 28 dias", "Compatível com toda a linha injetável"],
    media: { kind: "image", src: "/save-concept-diluente-branded.png", alt: "Frasco de diluente Save Concept com logo da marca", width: 1024, height: 1536 },
  },
];

const TRUST_ITEMS = [
  { icon: Factory, title: "Fabricação própria", text: "Formulamos e envasamos internamente, em Cotia (SP) — não revendemos produto de terceiro." },
  { icon: FlaskConical, title: "Lote testado", text: "Toda leva de produção passa por controle interno antes de liberar pra envio." },
  { icon: Snowflake, title: "Cadeia fria", text: "Caixa térmica com gelo reciclável do nosso estoque até a sua porta." },
  { icon: PackageCheck, title: "7 dias de garantia", text: "Não gostou? Devolução com reembolso em até 7 dias corridos." },
];

const DIFFERENTIATORS = [
  {
    icon: MessageCircle,
    title: "Fala direto com quem fabrica",
    text: "Sem central terceirizada: dúvida sobre lote, conservação ou uso vai direto pra equipe que produziu.",
  },
  {
    icon: FileCheck,
    title: "Nota fiscal em todo pedido",
    text: "Toda venda sai com nota fiscal, na caixa e por e-mail — sem precisar pedir.",
  },
  {
    icon: Truck,
    title: "Rastreio desde a expedição",
    text: "Código de rastreio liberado assim que o pedido sai do nosso estoque em Cotia (SP).",
  },
  {
    icon: BellRing,
    title: "Avisamos a reposição",
    text: "Produto esgotado? Você entra na lista e recebe e-mail assim que o lote seguinte for liberado.",
  },
];

const RATING_BREAKDOWN = [
  { stars: 5, pct: 78 },
  { stars: 4, pct: 15 },
  { stars: 3, pct: 5 },
  { stars: 2, pct: 1 },
  { stars: 1, pct: 1 },
];

const TESTIMONIALS = [
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

const FAQ = [
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
      "O número do lote e a validade ficam impressos no rótulo. Se quiser confirmar antes de comprar, é só chamar no nosso WhatsApp de atendimento.",
  },
];

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StarRating({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Avaliação ${rating} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < rounded ? "loja-star fill-current" : "loja-star-empty fill-current"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

const LENS_SIZE = 112;
const LENS_ZOOM = 2.3;

type LensState = { x: number; y: number; bgX: number; bgY: number; bgW: number; bgH: number };

function MagnifierImage({
  src,
  alt,
  frame,
  sizes,
  onZoomClick,
  priority,
}: {
  src: string;
  alt: string;
  frame?: boolean;
  sizes: string;
  onZoomClick: (src: string, alt: string) => void;
  priority?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<LensState | null>(null);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    x = Math.max(LENS_SIZE / 2, Math.min(x, rect.width - LENS_SIZE / 2));
    y = Math.max(LENS_SIZE / 2, Math.min(y, rect.height - LENS_SIZE / 2));
    setLens({
      x: x - LENS_SIZE / 2,
      y: y - LENS_SIZE / 2,
      bgX: -(x * LENS_ZOOM - LENS_SIZE / 2),
      bgY: -(y * LENS_ZOOM - LENS_SIZE / 2),
      bgW: rect.width * LENS_ZOOM,
      bgH: rect.height * LENS_ZOOM,
    });
  }

  return (
    <div
      ref={containerRef}
      className="group relative h-full w-full cursor-zoom-in"
      onMouseMove={handleMove}
      onMouseLeave={() => setLens(null)}
      onClick={() => onZoomClick(src, alt)}
      role="button"
      aria-label={`Ampliar foto: ${alt}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-contain ${frame ? "rounded-[20px] p-3" : ""}`}
      />
      <span className="loja-zoom-hint pointer-events-none absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full text-white opacity-0 transition-opacity group-hover:opacity-100">
        <ZoomIn className="size-3.5" aria-hidden="true" />
      </span>
      {lens && (
        <div
          className="loja-lens pointer-events-none absolute rounded-full"
          style={{
            left: lens.x,
            top: lens.y,
            width: LENS_SIZE,
            height: LENS_SIZE,
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${lens.bgW}px ${lens.bgH}px`,
            backgroundPosition: `${lens.bgX}px ${lens.bgY}px`,
          }}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  index,
  onAddToCart,
  onZoomClick,
}: {
  product: Product;
  index: number;
  onAddToCart: (product: Product) => void;
  onZoomClick: (src: string, alt: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50, active: false });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - py) * 10,
      ry: (px - 0.5) * 10,
      mx: px * 100,
      my: py * 100,
      active: true,
    });
  }

  function handleLeave() {
    setTilt((t) => ({ ...t, rx: 0, ry: 0, active: false }));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
      style={{ perspective: 1000 }}
    >
      <article
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="loja-card loja-tilt relative flex flex-col overflow-hidden rounded-3xl"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(${tilt.active ? -6 : 0}px) scale(${tilt.active ? 1.015 : 1})`,
        }}
      >
        <span
          className="loja-tilt-shine"
          style={{
            opacity: tilt.active ? 1 : 0,
            background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.16), transparent 45%)`,
          }}
          aria-hidden="true"
        />
        <div className="loja-media relative flex h-60 items-center justify-center py-6">
          {product.media.kind === "image" ? (
            <div
              className={`relative h-full ${product.media.card ? "max-w-[92%] overflow-hidden rounded-2xl border border-[color:var(--lj-line)] shadow-lg" : "max-w-[80%]"} ${product.media.frame ? "loja-photo-frame" : ""}`}
              style={{ aspectRatio: `${product.media.width} / ${product.media.height}` }}
            >
              <MagnifierImage
                src={product.media.src}
                alt={product.media.alt}
                frame={product.media.frame}
                sizes="(max-width: 640px) 60vw, 20vw"
                onZoomClick={onZoomClick}
              />
            </div>
          ) : (
            <span className="loja-media-icon absolute inset-0 flex items-center justify-center">
              <Syringe className="size-16" aria-hidden="true" />
              <span className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-white/95 p-1.5 shadow-lg">
                <Image src="/save-concept-mark-v2.png" alt="" width={20} height={20} aria-hidden="true" />
              </span>
            </span>
          )}
          <span className="loja-badge-authentic absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            {product.badge}
          </span>
          {product.freeShipping && (
            <span className="absolute right-3 top-3 rounded-full bg-[#04101f] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              Frete grátis
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--lj-accent)]">
              {product.tagline}
            </p>
            <h3 className="mt-0.5 text-lg font-extrabold text-[color:var(--lj-ink)]">{product.name}</h3>
            <div className="mt-1.5 flex items-center gap-2">
              <StarRating rating={product.rating} />
              <span className="text-[11px] font-semibold text-[color:var(--lj-muted)]">
                {product.rating.toFixed(1)} ({product.reviewCount} avaliações)
              </span>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-[color:var(--lj-muted)]">{product.description}</p>

          <ul className="flex flex-col gap-1">
            {product.specs.map((spec) => (
              <li key={spec} className="loja-spec-dot flex items-center text-[12px] text-[color:var(--lj-muted)]">
                {spec}
              </li>
            ))}
          </ul>

          <p className="loja-stock-dot flex flex-1 items-end text-[11px] font-semibold text-[color:var(--lj-ink)]">
            Em estoque — pronto para envio
          </p>

          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="loja-price flex items-baseline gap-2">
              <span className="text-xl font-extrabold text-[color:var(--lj-ink)]">{formatBRL(product.price)}</span>
              {product.oldPrice && <em>{formatBRL(product.oldPrice)}</em>}
            </div>
            <button
              type="button"
              onClick={() => onAddToCart(product)}
              className="loja-cta-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Adicionar
            </button>
          </div>
        </div>
      </article>
    </motion.div>
  );
}

type CartLine = { product: Product; qty: number };

export default function LojaPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [newsletterSent, setNewsletterSent] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(null);
  const reduceMotion = useReducedMotion();

  const totalItems = useMemo(() => cart.reduce((sum, line) => sum + line.qty, 0), [cart]);
  const totalPrice = useMemo(
    () => cart.reduce((sum, line) => sum + line.qty * line.product.price, 0),
    [cart],
  );

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [...current, { product, qty: 1 }];
    });
    setDrawerOpen(true);
  }

  function changeQty(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId ? { ...line, qty: line.qty + delta } : line,
        )
        .filter((line) => line.qty > 0),
    );
  }

  return (
    <>
      {/* Header */}
      <header className="loja-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/loja" className="flex items-center gap-2">
            <Image src="/save-concept-mark-v2.png" alt="Save Concept" width={30} height={30} priority />
            <span className="text-sm font-extrabold tracking-tight text-[color:var(--lj-ink)]">
              Save Concept <span className="font-medium text-[color:var(--lj-muted)]">Loja</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[color:var(--lj-muted)] sm:flex">
            <a href="#produtos" className="hover:text-[color:var(--lj-accent)]">Produtos</a>
            <a href="#marca" className="hover:text-[color:var(--lj-accent)]">Nossa marca</a>
            <a href="#diferenciais" className="hover:text-[color:var(--lj-accent)]">Diferenciais</a>
            <a href="#faq" className="hover:text-[color:var(--lj-accent)]">Dúvidas</a>
          </nav>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="loja-btn-ghost relative flex size-10 items-center justify-center rounded-full transition"
            aria-label="Abrir carrinho"
          >
            <ShoppingBag className="size-4.5" aria-hidden="true" />
            {totalItems > 0 && (
              <span className="loja-cart-count flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20">
          <div
            className="loja-hero-visual pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 lg:block"
            aria-hidden="true"
          >
            <span className="loja-hero-ring" />
            <span className="loja-hero-ring loja-hero-ring-2" />
            <motion.div
              className="loja-hero-vial relative"
              animate={reduceMotion ? { y: 0, rotate: 0 } : { y: [0, -16, 0], rotate: [-4, 4, -4] }}
              transition={reduceMotion ? { duration: 0 } : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
            >
              <Image
                src="/save-concept-tirzepatida-60mg-real.png"
                alt=""
                width={220}
                height={220}
                className="relative object-contain drop-shadow-2xl"
              />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="loja-hero-copy mx-auto max-w-2xl text-center"
          >
            <div className="loja-btn-ghost mx-auto mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--lj-accent-2)]">
              <Sparkles className="size-3.5" aria-hidden="true" /> Fabricação própria desde 2019
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-[color:var(--lj-ink)] sm:text-5xl">
              A gente fabrica. Você recebe. <em>Sem</em> atravessador no meio
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-[color:var(--lj-muted)] sm:text-base">
              Formulamos, envasamos e embalamos cada item na nossa própria estrutura em Cotia (SP).
              Nada de comprar de terceiro e colar etiqueta — o que sai daqui é o que a gente testou.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#produtos"
                className="loja-cta-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
              >
                Ver produtos <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <a
                href="#marca"
                className="loja-btn-ghost inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition"
              >
                <Factory className="size-4" aria-hidden="true" /> Como fabricamos
              </a>
            </div>
            <div className="mx-auto mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-[color:var(--lj-line)] pt-6">
              <div>
                <p className="text-xl font-extrabold text-[color:var(--lj-ink)]">6 anos</p>
                <p className="text-[11px] text-[color:var(--lj-muted)]">de fabricação própria</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-[color:var(--lj-ink)]">50 mil+</p>
                <p className="text-[11px] text-[color:var(--lj-muted)]">frascos envasados</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-[color:var(--lj-ink)]">4.8/5</p>
                <p className="text-[11px] text-[color:var(--lj-muted)]">em 779 avaliações</p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Trust strip */}
        <section className="loja-trust-strip">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6">
            {TRUST_ITEMS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="flex flex-col items-center gap-2 text-center sm:items-start sm:text-left"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-[color:var(--lj-soft)] text-[color:var(--lj-accent)]">
                  <item.icon className="size-4.5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-bold text-[color:var(--lj-ink)]">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[color:var(--lj-muted)]">{item.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Products */}
        <section id="produtos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto mb-10 max-w-xl text-center">
            <h2 className="text-2xl font-extrabold text-[color:var(--lj-ink)] sm:text-3xl">Nossos produtos</h2>
            <p className="mt-2 text-sm text-[color:var(--lj-muted)]">
              Catálogo enxuto de marca própria — cada item é formulado, produzido e embalado por nós.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCTS.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                index={i}
                onAddToCart={addToCart}
                onZoomClick={(src, alt) => setZoomImage({ src, alt })}
              />
            ))}
          </div>
        </section>

        {/* Brand story */}
        <section id="marca" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="loja-glass grid grid-cols-1 overflow-hidden rounded-3xl lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="flex flex-col justify-center gap-4 p-8 sm:p-10"
            >
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[color:var(--lj-soft)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--lj-accent)]">
                <Factory className="size-3.5" aria-hidden="true" /> Nossa marca
              </div>
              <h2 className="text-2xl font-extrabold text-[color:var(--lj-ink)] sm:text-3xl">
                De um forno de bancada a 50 mil frascos por ano
              </h2>
              <p className="text-sm leading-relaxed text-[color:var(--lj-muted)]">
                Começamos em 2019, em Cotia (SP), com três formulações e uma estrutura pequena.
                Hoje testamos cada lote antes de liberar o envio — é o mesmo cuidado do início,
                só que em escala maior.
              </p>
              <blockquote className="border-l-2 border-[color:var(--lj-accent)] py-1 pl-4 text-sm italic leading-relaxed text-[color:var(--lj-ink)]">
                “A gente não terceiriza a produção pra depois só colar etiqueta. Se sai daqui com o
                nome Save Concept, foi a nossa equipe que formulou e envasou.”
                <footer className="mt-1 text-xs font-semibold not-italic text-[color:var(--lj-muted)]">
                  — Equipe de produção Save Concept
                </footer>
              </blockquote>
              <ul className="mt-2 flex flex-col gap-3">
                <li className="flex items-start gap-2 text-sm text-[color:var(--lj-ink)]">
                  <FileCheck className="mt-0.5 size-4 shrink-0 text-[color:var(--lj-accent)]" aria-hidden="true" />
                  Formulação e envase realizados sob controle próprio, com nota fiscal em todo pedido.
                </li>
                <li className="flex items-start gap-2 text-sm text-[color:var(--lj-ink)]">
                  <FlaskConical className="mt-0.5 size-4 shrink-0 text-[color:var(--lj-accent)]" aria-hidden="true" />
                  Lote numerado e testado antes de liberar pra envio.
                </li>
                <li className="flex items-start gap-2 text-sm text-[color:var(--lj-ink)]">
                  <Snowflake className="mt-0.5 size-4 shrink-0 text-[color:var(--lj-accent)]" aria-hidden="true" />
                  Cadeia fria mantida do nosso estoque até a sua entrega.
                </li>
              </ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.94, rotateY: -12 }}
              whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
              style={{ perspective: 800 }}
              className="loja-about-media relative min-h-[260px]"
            >
              <Image
                src="/save-concept-vial-signature-v1.png"
                alt="Frasco Save Concept, produto de marca própria"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-8"
              />
            </motion.div>
          </div>
        </section>

        {/* Differentiators */}
        <section id="diferenciais" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mx-auto mb-10 max-w-xl text-center">
            <h2 className="text-2xl font-extrabold text-[color:var(--lj-ink)] sm:text-3xl">
              Detalhes que a gente cuida sem você pedir
            </h2>
            <p className="mt-2 text-sm text-[color:var(--lj-muted)]">
              Coisas pequenas que fazem diferença quando o pedido é seu.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DIFFERENTIATORS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.07 }}
                className="loja-testimonial rounded-2xl p-5"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-[color:var(--lj-soft)] text-[color:var(--lj-accent)]">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-[color:var(--lj-ink)]">{item.title}</h3>
                <p className="mt-1 text-[12px] leading-snug text-[color:var(--lj-muted)]">{item.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mx-auto mb-10 max-w-xl text-center">
            <h2 className="text-2xl font-extrabold text-[color:var(--lj-ink)] sm:text-3xl">
              Avaliações de quem já comprou
            </h2>
            <p className="mt-2 text-sm text-[color:var(--lj-muted)]">
              4.8 de 5, com base em 779 avaliações verificadas.
            </p>
          </div>

          <div className="mx-auto mb-10 flex max-w-md flex-col gap-1.5">
            {RATING_BREAKDOWN.map((row) => (
              <div key={row.stars} className="flex items-center gap-3 text-xs text-[color:var(--lj-muted)]">
                <span className="w-10 shrink-0 font-semibold text-[color:var(--lj-ink)]">{row.stars} ★</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--lj-soft)]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${row.pct}%`, background: "linear-gradient(90deg, var(--lj-accent), var(--lj-accent-2))" }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right">{row.pct}%</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <motion.figure
                key={t.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="loja-testimonial flex flex-col gap-3 rounded-2xl p-5"
              >
                <Quote className="size-5 text-[color:var(--lj-accent)]" aria-hidden="true" />
                <StarRating rating={t.rating} />
                <blockquote className="flex-1 text-[13px] leading-relaxed text-[color:var(--lj-muted)]">
                  “{t.text}”
                </blockquote>
                <figcaption>
                  <p className="text-xs font-bold text-[color:var(--lj-ink)]">{t.name} · {t.location}</p>
                  <p className="text-[11px] text-[color:var(--lj-muted)]">{t.meta}</p>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
          <div className="mx-auto mb-8 max-w-xl text-center">
            <h2 className="text-2xl font-extrabold text-[color:var(--lj-ink)] sm:text-3xl">Dúvidas frequentes</h2>
          </div>
          <div className="loja-card rounded-3xl px-5 sm:px-8">
            {FAQ.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={item.question} className="loja-faq-item">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-bold text-[color:var(--lj-ink)]">{item.question}</span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-[color:var(--lj-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <p className="pb-4 text-[13px] leading-relaxed text-[color:var(--lj-muted)]">
                          {item.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* Newsletter */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="loja-newsletter flex flex-col items-center gap-4 rounded-3xl px-6 py-10 text-center sm:px-12">
            <Mail className="size-7 text-white" aria-hidden="true" />
            <h2 className="text-xl font-extrabold text-white sm:text-2xl">Fique por dentro dos lançamentos</h2>
            <p className="max-w-md text-sm text-white/85">
              Novidades da nossa marca própria, condições especiais e reposição de estoque direto no seu e-mail.
            </p>
            <form
              className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                setNewsletterSent(true);
              }}
            >
              <input
                type="email"
                required
                placeholder="Seu melhor e-mail"
                className="loja-input flex-1 rounded-full px-4 py-2.5 text-sm outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-[#04101f] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
              >
                {newsletterSent ? "Cadastrado!" : "Cadastrar"}
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="loja-footer">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Image src="/save-concept-mark-v2.png" alt="Save Concept" width={26} height={26} />
              <span className="text-sm font-bold text-[color:var(--lj-ink)]">Save Concept</span>
            </div>
            <p className="max-w-[220px] text-xs leading-relaxed text-[color:var(--lj-muted)]">
              Fabricação própria em Cotia (SP) desde 2019.
            </p>
            <div className="flex items-center gap-2">
              <a
                href="#"
                className="flex size-8 items-center justify-center rounded-full border border-[color:var(--lj-line)] text-[color:var(--lj-muted)] transition hover:border-[color:var(--lj-accent)] hover:text-[color:var(--lj-accent-2)]"
                aria-label="Instagram Save Concept"
              >
                <AtSign className="size-4" aria-hidden="true" />
              </a>
              <a
                href="#"
                className="flex size-8 items-center justify-center rounded-full border border-[color:var(--lj-line)] text-[color:var(--lj-muted)] transition hover:border-[color:var(--lj-accent)] hover:text-[color:var(--lj-accent-2)]"
                aria-label="WhatsApp Save Concept"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--lj-ink)]">Loja</p>
            <nav className="flex flex-col gap-2 text-xs font-semibold text-[color:var(--lj-muted)]">
              <a href="#produtos" className="hover:text-[color:var(--lj-accent)]">Produtos</a>
              <a href="#marca" className="hover:text-[color:var(--lj-accent)]">Nossa marca</a>
              <a href="#diferenciais" className="hover:text-[color:var(--lj-accent)]">Diferenciais</a>
              <a href="#faq" className="hover:text-[color:var(--lj-accent)]">Dúvidas</a>
            </nav>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--lj-ink)]">Atendimento</p>
            <div className="flex flex-col gap-1.5 text-xs text-[color:var(--lj-muted)]">
              <p>Seg. a sex., 9h às 18h</p>
              <p>Save Concept Indústria e Comércio Ltda.</p>
              <p>CNPJ 32.198.560/0001-07</p>
              <p>Cotia, SP — Brasil</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--lj-ink)]">Pagamento</p>
            <div className="flex flex-wrap gap-2">
              <span className="loja-btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-[color:var(--lj-muted)]">
                <QrCode className="size-3.5" aria-hidden="true" /> Pix
              </span>
              <span className="loja-btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-[color:var(--lj-muted)]">
                <CreditCard className="size-3.5" aria-hidden="true" /> Cartão
              </span>
              <span className="loja-btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-[color:var(--lj-muted)]">
                <Barcode className="size-3.5" aria-hidden="true" /> Boleto
              </span>
            </div>
          </div>
        </div>
        <div className="border-t border-[color:var(--lj-line)] px-4 py-5 sm:px-6">
          <p className="mx-auto max-w-6xl text-[11px] text-[color:var(--lj-muted)]">
            © {new Date().getFullYear()} Save Concept Indústria e Comércio Ltda. — CNPJ 32.198.560/0001-07. Todos os direitos reservados.
          </p>
        </div>
      </footer>

      {/* Cart drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="loja-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              className="loja-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              role="dialog"
              aria-label="Carrinho de compras"
            >
              <div className="flex items-center justify-between border-b border-[color:var(--lj-line)] px-5 py-4">
                <h2 className="text-sm font-extrabold text-[color:var(--lj-ink)]">Seu carrinho</h2>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="flex size-8 items-center justify-center rounded-full text-[color:var(--lj-muted)] hover:bg-[color:var(--lj-soft)]"
                  aria-label="Fechar carrinho"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {cart.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-[color:var(--lj-muted)]">
                    <ShoppingBag className="size-8 text-[color:var(--lj-line)]" aria-hidden="true" />
                    Seu carrinho está vazio.
                  </div>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {cart.map((line) => (
                      <li key={line.product.id} className="flex items-center gap-3">
                        <div className="loja-media flex size-16 shrink-0 items-center justify-center rounded-xl p-1.5">
                          {line.product.media.kind === "image" ? (
                            <div
                              className={`relative h-full max-w-full ${line.product.media.frame ? "loja-photo-frame" : ""}`}
                              style={{ aspectRatio: `${line.product.media.width} / ${line.product.media.height}` }}
                            >
                              <Image
                                src={line.product.media.src}
                                alt={line.product.media.alt}
                                fill
                                sizes="48px"
                                className={`object-contain ${line.product.media.frame ? "rounded-[14px] p-1" : ""}`}
                              />
                            </div>
                          ) : (
                            <span className="loja-media-icon flex size-full items-center justify-center rounded-xl">
                              <Syringe className="size-6" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[color:var(--lj-ink)]">{line.product.name}</p>
                          <p className="text-xs text-[color:var(--lj-muted)]">{formatBRL(line.product.price)}</p>
                          <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-[color:var(--lj-line)] px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => changeQty(line.product.id, -1)}
                              className="flex size-5 items-center justify-center text-[color:var(--lj-muted)]"
                              aria-label="Diminuir quantidade"
                            >
                              <Minus className="size-3" aria-hidden="true" />
                            </button>
                            <span className="w-4 text-center text-xs font-bold text-[color:var(--lj-ink)]">{line.qty}</span>
                            <button
                              type="button"
                              onClick={() => changeQty(line.product.id, 1)}
                              className="flex size-5 items-center justify-center text-[color:var(--lj-muted)]"
                              aria-label="Aumentar quantidade"
                            >
                              <Plus className="size-3" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-[color:var(--lj-ink)]">
                          {formatBRL(line.product.price * line.qty)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-[color:var(--lj-line)] px-5 py-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-semibold text-[color:var(--lj-muted)]">Subtotal</span>
                  <span className="text-lg font-extrabold text-[color:var(--lj-ink)]">{formatBRL(totalPrice)}</span>
                </div>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  className="loja-cta-primary flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold disabled:opacity-50"
                >
                  Finalizar compra <ArrowRight className="size-4" aria-hidden="true" />
                </button>
                <p className="mt-2 text-center text-[11px] text-[color:var(--lj-muted)]">
                  Pagamento seguro em breve — checkout ainda em configuração.
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Image zoom viewer */}
      <AnimatePresence>
        {zoomImage && (
          <motion.div
            className="loja-zoom-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomImage(null)}
          >
            <motion.div
              className="loja-zoom-frame"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setZoomImage(null)}
                className="loja-zoom-close flex size-9 items-center justify-center rounded-full"
                aria-label="Fechar ampliação"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              <Image
                src={zoomImage.src}
                alt={zoomImage.alt}
                fill
                sizes="90vw"
                className="object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating cart button (mobile-friendly, mirrors header cart) */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="loja-cart-fab flex size-14 items-center justify-center rounded-full sm:hidden"
        aria-label="Abrir carrinho"
      >
        <ShoppingBag className="size-5.5" aria-hidden="true" />
        {totalItems > 0 && (
          <span className="loja-cart-count flex size-5 items-center justify-center rounded-full text-[11px] font-bold">
            {totalItems}
          </span>
        )}
      </button>
    </>
  );
}
