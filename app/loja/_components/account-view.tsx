"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, Heart, History, MapPin, MessageCircle, Package, Search, ShieldCheck, ShoppingCart, Trash2 } from "lucide-react";
import { STORE, formatBRL } from "../_lib/catalog";
import { notify } from "../_lib/feedback";
import {
  clearAllLocalShoppingData,
  clearDeliveryLocation,
  clearRecentSearches,
  clearRecentlyViewed,
  useCart,
  useDeliveryLocation,
  useFavorites,
  useOrderRefs,
  useRecentSearches,
  useRecentlyViewed,
  type OrderRef,
} from "../_lib/store";
import { useHydrated } from "./cart-view";
import { OrderStatusBadge, fetchOrder, formatDate, type PublicOrder } from "./order-view";
import { CepLookup } from "./delivery";
import { searchHref } from "./search-box";

const SECTIONS = [
  { id: "pedidos", label: "Meus pedidos" },
  { id: "atividade", label: "Sua atividade" },
  { id: "entrega", label: "Endereço de entrega" },
  { id: "autenticidade", label: "Autenticidade" },
  { id: "privacidade", label: "Privacidade" },
];

/*
 * "Minha conta" without accounts: the store has no customer login, orders
 * or saved addresses server-side, so this page manages what the store
 * actually keeps (in this browser) and is explicit about what doesn't
 * exist yet instead of showing placeholders. The verification portal's
 * own login (serial/QR) is a separate system and is linked, not merged.
 */
export function AccountView() {
  const hydrated = useHydrated();
  const favorites = useFavorites();
  const viewed = useRecentlyViewed();
  const searches = useRecentSearches();
  const location = useDeliveryLocation();
  const { count } = useCart();
  const [confirming, setConfirming] = useState(false);
  // The trigger and the confirmation replace each other: move focus with
  // them, so keyboard users are never dropped at the top of the page.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  if (!hydrated) return <div className="lj-skeleton h-96 rounded-[var(--lj-r-lg)]" aria-busy="true" aria-label="Carregando" />;

  const tiles = [
    { href: "/loja/favoritos", icon: Heart, label: "Favoritos", value: favorites.length },
    { href: "/loja/carrinho", icon: ShoppingCart, label: "No carrinho", value: count },
    { href: "/loja#vistos-title", icon: History, label: "Vistos recentemente", value: viewed.length },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Seções da conta" className="lg:sticky lg:top-[calc(var(--lj-header-real,120px)+24px)] lg:self-start">
        <ul className="-mx-[var(--lj-gutter)] flex gap-2 overflow-x-auto px-[var(--lj-gutter)] pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="lj-chip lg:flex lg:w-full lg:rounded-[var(--lj-r-md)] lg:border-transparent lg:bg-transparent">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col gap-6">
        <section id="pedidos" className="lj-card lj-card--pad scroll-mt-40" aria-labelledby="pedidos-title">
          <h2 id="pedidos-title" className="lj-h3 mb-1 inline-flex items-center gap-2">
            <Package className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> Meus pedidos
          </h2>
          <p className="lj-small lj-muted mb-4">Pedidos feitos neste navegador. O status vem direto do nosso sistema.</p>
          <OrdersList />
          <p className="lj-small mt-4 inline-flex items-center gap-2 text-[color:var(--lj-ink)]">
            <MessageCircle className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> Dúvidas sobre um pedido: atendimento{" "}
            {STORE.supportHours.toLowerCase()}.
          </p>
        </section>

        <section id="atividade" className="scroll-mt-40" aria-labelledby="atividade-title">
          <h2 id="atividade-title" className="lj-h3 mb-3">
            Sua atividade
          </h2>
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
            {tiles.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="lj-card lj-card--pad flex items-center gap-3 hover:shadow-[var(--lj-shadow-md)]">
                  <span className="lj-icon-circle">
                    <t.icon aria-hidden="true" />
                  </span>
                  <span>
                    <span className="lj-display block text-2xl font-extrabold">{t.value}</span>
                    <span className="lj-tiny lj-muted">{t.label}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="lj-card lj-card--pad mt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="lj-label inline-flex items-center gap-2">
                <Clock className="size-4" aria-hidden="true" /> Buscas recentes
              </h3>
              {searches.length > 0 && (
                <button type="button" className="lj-link lj-hit text-sm" onClick={clearRecentSearches}>
                  Limpar
                </button>
              )}
            </div>
            {searches.length ? (
              <ul className="flex flex-wrap gap-2">
                {searches.map((term) => (
                  <li key={term}>
                    <Link href={searchHref(term)} className="lj-chip">
                      <Search aria-hidden="true" /> {term}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lj-small lj-muted">Nenhuma busca por enquanto.</p>
            )}
            {viewed.length > 0 && (
              <button type="button" className="lj-link lj-hit self-start text-sm" onClick={clearRecentlyViewed}>
                Limpar produtos vistos recentemente
              </button>
            )}
          </div>
        </section>

        <section id="entrega" className="lj-card lj-card--pad scroll-mt-40" aria-labelledby="entrega-title">
          <h2 id="entrega-title" className="lj-h3 mb-1 inline-flex items-center gap-2">
            <MapPin className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> Endereço de entrega
          </h2>
          <p className="lj-small lj-muted mb-4">Usamos o CEP para mostrar o prazo e preencher o endereço no checkout.</p>
          <CepLookup />
          {location && (
            <button
              type="button"
              className="lj-link mt-3 text-sm"
              onClick={() => {
                clearDeliveryLocation();
                notify({ tone: "info", title: "CEP removido deste navegador" });
              }}
            >
              Remover CEP salvo
            </button>
          )}
        </section>

        <section id="autenticidade" className="lj-card lj-card--pad scroll-mt-40" aria-labelledby="autenticidade-title">
          <h2 id="autenticidade-title" className="lj-h3 mb-1 inline-flex items-center gap-2">
            <ShieldCheck className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> Autenticidade e benefícios
          </h2>
          <p className="lj-small lj-muted mb-4">
            Verificação de produtos, perfil e benefícios ficam no portal de autenticidade, com acesso pelo serial ou QR Code da sua
            embalagem.
          </p>
          <Link href="/" className="lj-btn lj-btn--secondary">
            Abrir portal de verificação
          </Link>
        </section>

        <section id="privacidade" className="lj-card lj-card--pad scroll-mt-40" aria-labelledby="privacidade-title">
          <h2 id="privacidade-title" className="lj-h3 mb-1">
            Privacidade
          </h2>
          <p className="lj-small lj-muted mb-4">
            Carrinho, favoritos, histórico, buscas, CEP e os links dos seus pedidos ficam apenas neste navegador e não são enviados para nossos servidores.
          </p>
          {confirming ? (
            <div
              className="lj-alert lj-alert--warning flex-col gap-3 sm:flex-row sm:items-center"
              role="alert"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  returnFocus.current = true;
                  setConfirming(false);
                }
              }}
            >
              <span className="flex-1">Apagar carrinho, favoritos, histórico, buscas, CEP e a lista de pedidos deste navegador? Os pedidos continuam registrados com a gente; só o acesso rápido por aqui é removido. Não dá para desfazer.</span>
              <span className="flex gap-2">
                <button
                  ref={cancelRef}
                  type="button"
                  className="lj-btn lj-btn--secondary lj-btn--sm"
                  onClick={() => {
                    returnFocus.current = true;
                    setConfirming(false);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="lj-btn lj-btn--primary lj-btn--sm"
                  onClick={() => {
                    clearAllLocalShoppingData();
                    returnFocus.current = true;
                    setConfirming(false);
                    notify({ tone: "success", title: "Dados da loja apagados deste navegador" });
                  }}
                >
                  Apagar tudo
                </button>
              </span>
            </div>
          ) : (
            <button ref={triggerRef} type="button" className="lj-btn lj-btn--danger-ghost" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden="true" /> Apagar meus dados desta loja
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

const itemCountLabel = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;

function OrderRow({ order: ref }: { order: OrderRef }) {
  const [live, setLive] = useState<PublicOrder | null | "error">(null);
  useEffect(() => {
    let alive = true;
    void fetchOrder(ref.id, ref.token).then((r) => alive && setLive(r.state === "ok" ? r.order : "error"));
    return () => {
      alive = false;
    };
  }, [ref.id, ref.token]);
  const order = live && live !== "error" ? live : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[color:var(--lj-ink)]">{ref.number}</p>
        <p className="lj-tiny lj-muted">
          {formatDate(ref.createdAt)} · {order ? `${itemCountLabel(order.items.reduce((s, i) => s + i.qty, 0))} · ` : ""}
          {formatBRL(order?.totals.total ?? ref.total)}
        </p>
      </div>
      {order ? (
        <OrderStatusBadge status={order.status} />
      ) : live === "error" ? (
        <span className="lj-badge lj-badge--neutral">Status indisponível</span>
      ) : (
        <span className="lj-skeleton h-5 w-28 rounded-full" aria-label="Carregando status" />
      )}
      {/* No token in the URL: the order page reads it from "Meus pedidos". */}
      <Link href={`/loja/pedido/${ref.id}`} className="lj-btn lj-btn--secondary lj-btn--sm">
        Ver detalhes
      </Link>
    </li>
  );
}

function OrdersList() {
  const refs = useOrderRefs();
  if (refs.length === 0) {
    return (
      <div className="lj-panel flex flex-col items-start gap-2 p-4">
        <p className="lj-small text-[color:var(--lj-text)]">Nenhum pedido feito neste navegador ainda.</p>
        <Link href="/loja/categoria/acessorios" className="lj-link text-sm">
          Ver produtos disponíveis para compra online
        </Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[color:var(--lj-line)]">
      {refs.map((r) => (
        <OrderRow key={r.id} order={r} />
      ))}
    </ul>
  );
}
