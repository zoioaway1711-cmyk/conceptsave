"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Circle, Copy, Home, MessageCircle, Package, Printer, Truck, XCircle } from "lucide-react";
import { STORE, formatBRL, getProduct } from "../_lib/catalog";
import { notify } from "../_lib/feedback";
import { ORDER_FLOW, ORDER_STATUS_HINT, ORDER_STATUS_LABEL, type OrderStatus } from "../_lib/order-status";
import type { OrderTotals } from "../_lib/pricing";
import { ORDER_TOKEN_RE, orderAccessToken, orderShareUrl, rememberOrderAccess, useOrderRefs } from "../_lib/store";
import { OrderSummary, useHydrated } from "./cart-view";
import { HowItWorks } from "./how-it-works";
import { OnlinePayment, PaymentReceipt, type PaymentState } from "./online-payment";
import { Breadcrumbs, ProductImage } from "./ui";

export type PublicOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  customer: { name: string; email: string; phone: string; cpfMasked: string };
  address: { cep: string; street: string; number: string; complement: string; district: string; city: string; uf: string };
  items: { sku: string; slug: string; name: string; presentation: string; qty: number; unitPrice: number; listUnitPrice: number }[];
  totals: OrderTotals;
  payment: { method: "pix" | "cartao" | "boleto" | "crypto"; installments: number };
  trackingCode: string | null;
  history: { status: OrderStatus; at: string; note?: string }[];
  createdAt: string;
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export async function fetchOrder(
  id: string,
  token: string,
): Promise<{ state: "ok"; order: PublicOrder; payment: PaymentState } | { state: "not_found" | "error" }> {
  try {
    // Token in a header, not the URL: URLs end up in server logs.
    const res = await fetch(`/api/loja/orders/${encodeURIComponent(id)}`, { headers: { "x-order-token": token }, cache: "no-store" });
    if (res.status === 404) return { state: "not_found" };
    if (!res.ok) return { state: "error" };
    const data = (await res.json()) as { order: PublicOrder; payment?: PaymentState };
    return { state: "ok", order: data.order, payment: data.payment ?? { mode: "manual" } };
  } catch {
    return { state: "error" };
  }
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone = status === "cancelled" ? "lj-badge--neutral" : status === "delivered" ? "lj-badge--success" : status === "received" ? "lj-badge--warning" : "lj-badge--info";
  return <span className={`lj-badge ${tone}`}>{ORDER_STATUS_LABEL[status]}</span>;
}

/** Only recorded steps get a date; the rest of the happy path is shown as "próximas etapas". */
function Timeline({ order, autoPayment }: { order: PublicOrder; autoPayment: boolean }) {
  const reached = new Map(order.history.map((h) => [h.status, h]));
  if (order.status === "cancelled") {
    return (
      <ol className="flex flex-col gap-3">
        {order.history.map((h) => (
          <li key={h.status + h.at} className="flex items-start gap-3 text-sm">
            {h.status === "cancelled" ? (
              <XCircle className="mt-0.5 size-5 text-[color:var(--lj-danger)]" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 text-[color:var(--lj-muted)]" aria-hidden="true" />
            )}
            <span>
              <strong className="text-[color:var(--lj-ink)]">{ORDER_STATUS_LABEL[h.status]}</strong>
              <span className="lj-muted block">{formatDate(h.at)}</span>
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="flex flex-col gap-0">
      {ORDER_FLOW.map((status, i) => {
        const entry = reached.get(status);
        const current = status === order.status;
        return (
          <li key={status} className="relative flex items-start gap-3 pb-5 text-sm last:pb-0" aria-current={current ? "step" : undefined}>
            {i < ORDER_FLOW.length - 1 && (
              <span
                className={`absolute left-[9px] top-6 h-[calc(100%-20px)] w-0.5 ${entry && !current ? "bg-[color:var(--lj-success)]" : "bg-[color:var(--lj-line)]"}`}
                aria-hidden="true"
              />
            )}
            {entry ? (
              <CheckCircle2 className="relative mt-0.5 size-5 shrink-0 text-[color:var(--lj-success)]" aria-hidden="true" />
            ) : (
              <Circle className="relative mt-0.5 size-5 shrink-0 text-[color:var(--lj-line-strong)]" aria-hidden="true" />
            )}
            <span>
              <strong className={entry ? "text-[color:var(--lj-ink)]" : "lj-muted font-semibold"}>{ORDER_STATUS_LABEL[status]}</strong>
              <span className="lj-muted block">
                {entry ? formatDate(entry.at) : "Próxima etapa"}
                {current && (
                  <>
                    {" "}
                    ·{" "}
                    {status === "received" && autoPayment
                      ? "Aguardando o pagamento, que é confirmado automaticamente nesta página."
                      : status === "payment_approved" && autoPayment
                        ? "Pagamento confirmado automaticamente. O pedido segue para separação."
                        : ORDER_STATUS_HINT[status]}
                  </>
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/*
 * The access token (`?t=`) is a capability: anyone holding the URL sees the
 * order (name, masked contact, address). It is read ONCE from the URL,
 * kept for this tab (store.ts → rememberOrderAccess) and then removed from
 * the address bar with history.replaceState, so it doesn't linger in the
 * history, in screenshots/screen shares, in printed pages' URL footer or in
 * a Referer. Orders placed in this browser need no token in the URL at all
 * ("Meus pedidos" keeps it). The page also sets `referrer: no-referrer`.
 */
export function OrderView({ id }: { id: string }) {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const refs = useOrderRefs();
  // Captured once per mount: stripping the URL below re-renders with empty
  // search params, and these must survive that. On a full page load,
  // useSearchParams() hydrates with the params the server rendered with,
  // and the worker strips `t`/`novo` before the cached render (so a token
  // never lands in shared HTML) — the real address bar is the fallback.
  // Client navigations (checkout → `?novo=1`) do carry them in `params`.
  const [fromUrl] = useState(() => {
    const live = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const t = params.get("t") ?? live?.get("t") ?? "";
    const novo = params.get("novo") ?? live?.get("novo");
    return { token: ORDER_TOKEN_RE.test(t) ? t : "", isNew: novo === "1" };
  });
  const isNew = fromUrl.isNew;
  const token = hydrated ? fromUrl.token || orderAccessToken(id, refs) : "";
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchOrder>> | null>(null);
  // Bumped by "Tentar de novo": refetches in place (skeleton, then result)
  // instead of reloading the whole store.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (fromUrl.token) rememberOrderAccess(id, fromUrl.token);
    const url = new URL(window.location.href);
    if (!url.searchParams.has("t") && !url.searchParams.has("novo")) return;
    url.searchParams.delete("t");
    url.searchParams.delete("novo");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [hydrated, id, fromUrl.token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void fetchOrder(id, token).then((r) => alive && setResult(r));
    return () => {
      alive = false;
    };
  }, [id, token, attempt]);

  // Silent refresh for the Pix panel: never swaps the page for a skeleton,
  // and a failed poll keeps what's on screen. A state handed over directly
  // (the answer to "generate code") is applied without a request.
  const refresh = useCallback(
    (payment?: PaymentState) => {
      if (payment) {
        setResult((cur) => (cur?.state === "ok" ? { ...cur, payment } : cur));
        return;
      }
      if (!token) return;
      void fetchOrder(id, token).then((r) => {
        if (r.state === "ok") setResult(r);
      });
    },
    [id, token],
  );

  // No token anywhere (link without `?t=`, other browser): same answer the
  // API would give, without a request.
  const view = hydrated && !token ? ({ state: "not_found" } as const) : result;

  if (!view) return <div className="lj-skeleton h-96 rounded-[var(--lj-r-lg)]" aria-busy="true" aria-label="Carregando pedido" />;
  if (view.state !== "ok") {
    const retry = () => {
      setResult(null);
      setAttempt((n) => n + 1);
    };
    return <OrderUnavailable state={view.state} onRetry={retry} />;
  }
  return <OrderDetails order={view.order} payment={view.payment} isNew={isNew} token={token} onRefresh={refresh} />;
}

function OrderUnavailable({ state, onRetry }: { state: "not_found" | "error"; onRetry: () => void }) {
  return (
    <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-12 text-center" role="alert">
      <AlertCircle className="size-9 text-[color:var(--lj-muted)]" aria-hidden="true" />
      <h1 className="lj-h3">{state === "not_found" ? "Pedido não encontrado" : "Não foi possível carregar o pedido"}</h1>
      <p className="lj-small lj-muted max-w-md">
        {state === "not_found"
          ? "O link pode estar incompleto. Use o link do pedido salvo em “Minha conta” neste navegador."
          : "Verifique sua conexão e tente novamente em instantes."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/loja/conta#pedidos" className="lj-btn lj-btn--primary">
          Meus pedidos
        </Link>
        {state === "error" && (
          <button type="button" className="lj-btn lj-btn--secondary" onClick={onRetry}>
            Tentar de novo
          </button>
        )}
      </div>
    </div>
  );
}

function OrderDetails({
  order,
  payment: paymentState,
  isNew,
  token,
  onRefresh,
}: {
  order: PublicOrder;
  payment: PaymentState;
  isNew: boolean;
  token: string;
  onRefresh: (next?: PaymentState) => void;
}) {
  const payment = STORE.payment.find((p) => p.id === order.payment.method)?.label ?? order.payment.method;
  const auto = paymentState.mode === "auto" ? paymentState : null;
  const paidOnline = auto?.current?.status === "paid" ? auto.current : null;
  // The payment panel shows while there is something to pay (or a payment
  // to explain); once the order moved on, the "Pagamento" card has the receipt.
  // Stays up right after an automatic confirmation (order just moved to
  // payment_approved) so the customer sees "Pagamento confirmado!" and the
  // receipt where they were looking; later statuses show it in "Pagamento".
  const justPaid = order.status === "payment_approved" && auto?.current?.status === "paid";
  const showOnline = Boolean(auto && (order.status === "received" || auto.current?.status === "review" || justPaid));
  const onlineLabel = auto?.provider === "crypto" ? "USDT" : "Pix";

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Minha conta", href: "/loja/conta#pedidos" }, { label: `Pedido ${order.number}` }]} />

      {isNew && (
        <div className="lj-card lj-card--pad flex flex-col gap-3 border-[color:var(--lj-success)] bg-[color:var(--lj-success-soft)] sm:flex-row sm:items-start" role="status">
          <CheckCircle2 className="size-8 shrink-0 text-[color:var(--lj-success)]" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h1 className="lj-h2 text-[22px]">Pedido registrado, {order.customer.name}!</h1>
            {auto ? (
              <p className="lj-small text-[color:var(--lj-text)]">
                Número <strong>{order.number}</strong>. Agora é só pagar {auto.provider === "crypto" ? "em USDT" : "com Pix"} aqui embaixo: a
                confirmação é automática e esta página se atualiza sozinha.
              </p>
            ) : (
              <p className="lj-small text-[color:var(--lj-text)]">
                Número <strong>{order.number}</strong>. <strong>O pagamento ainda não foi feito:</strong> nossa equipe vai entrar em contato
                pelo e-mail {order.customer.email} ou pelo celular {order.customer.phone} para combinar o pagamento via {payment.toLowerCase()}.
              </p>
            )}
            <p className="lj-tiny lj-muted">Este link fica salvo em “Minha conta” neste navegador para você acompanhar o pedido.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!isNew && <h1 className="lj-h2">Pedido {order.number}</h1>}
          <p className="lj-small lj-muted">Feito em {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <button type="button" className="lj-btn lj-btn--ghost lj-btn--sm lj-no-print" onClick={() => window.print()}>
            <Printer aria-hidden="true" /> Imprimir
          </button>
          <button
            type="button"
            className="lj-btn lj-btn--ghost lj-btn--sm lj-no-print"
            onClick={async () => {
              try {
                // Built explicitly (the address bar no longer carries the token).
                await navigator.clipboard.writeText(orderShareUrl(order.id, token));
                notify({
                  tone: "success",
                  title: "Link do pedido copiado",
                  description: "Quem tiver este link vê os dados do pedido. Compartilhe só com quem precisa.",
                });
              } catch {
                notify({ tone: "error", title: "Não foi possível copiar o link" });
              }
            }}
          >
            <Copy aria-hidden="true" /> Copiar link
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          {showOnline && auto && <OnlinePayment orderId={order.id} token={token} state={auto} onRefresh={onRefresh} />}

          <section className="lj-card lj-card--pad" aria-labelledby="acompanhamento">
            <h2 id="acompanhamento" className="lj-h3 mb-4">
              Acompanhamento
            </h2>
            <Timeline order={order} autoPayment={Boolean(auto)} />
            {order.trackingCode && (
              <div className="lj-panel mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="inline-flex items-center gap-2 text-sm">
                  <Truck className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> Código de rastreio:{" "}
                  <strong className="font-mono">{order.trackingCode}</strong>
                </span>
                <button
                  type="button"
                  className="lj-btn lj-btn--secondary lj-btn--sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(order.trackingCode ?? "");
                      notify({ tone: "success", title: "Código de rastreio copiado", description: "Use-o no site da transportadora." });
                    } catch {
                      notify({ tone: "error", title: "Não foi possível copiar o código" });
                    }
                  }}
                >
                  <Copy aria-hidden="true" /> Copiar código
                </button>
              </div>
            )}
          </section>

          {order.status === "received" && (
            <section className="lj-card lj-card--pad" aria-labelledby="proximos">
              <h2 id="proximos" className="lj-h3 mb-4">
                Próximos passos
              </h2>
              <HowItWorks compact method={order.payment.method} />
            </section>
          )}

          <section className="lj-card lj-card--pad" aria-labelledby="itens">
            <h2 id="itens" className="lj-h3 mb-3">
              Itens
            </h2>
            <ul className="flex flex-col divide-y divide-[color:var(--lj-line)]">
              {order.items.map((item) => {
                const product = getProduct(item.slug);
                return (
                  <li key={item.sku} className="flex items-center gap-3 py-3">
                    <span className="lj-media size-14 shrink-0 rounded-[var(--lj-r-sm)] p-1">
                      {product && <ProductImage image={product.image} sizes="56px" decorative />}
                    </span>
                    <span className="lj-small min-w-0 flex-1">
                      <span className="block font-semibold text-[color:var(--lj-ink)]">{item.name}</span>
                      <span className="lj-muted">
                        {item.qty} × {formatBRL(item.unitPrice)}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-[color:var(--lj-ink)]">{formatBRL(item.unitPrice * item.qty)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <section className="lj-card lj-card--pad" aria-labelledby="entrega-pedido">
              <h2 id="entrega-pedido" className="lj-h3 mb-2 inline-flex items-center gap-2">
                <Home className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> Receber em casa
              </h2>
              <p className="lj-small text-[color:var(--lj-text)]">
                {order.address.street}, {order.address.number}
                {order.address.complement ? ` — ${order.address.complement}` : ""}
                <br />
                {order.address.district} · {order.address.city}/{order.address.uf}
                <br />
                CEP {order.address.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}
              </p>
              <p className="lj-tiny lj-muted mt-2">Prazo médio de {STORE.delivery.window} após a confirmação do pagamento.</p>
            </section>
            <section className="lj-card lj-card--pad" aria-labelledby="pagamento-pedido">
              <h2 id="pagamento-pedido" className="lj-h3 mb-2">
                Pagamento
              </h2>
              <p className="lj-small text-[color:var(--lj-text)]">
                {payment}
                {order.payment.method === "cartao" && order.payment.installments > 1 ? ` em ${order.payment.installments}x sem juros` : ""}
              </p>
              <p className="lj-tiny lj-muted mt-2">
                {order.status === "received"
                  ? auto
                    ? `Aguardando o pagamento em ${onlineLabel} — pague por esta página.`
                    : "Aguardando pagamento — nossa equipe entra em contato para combinar."
                  : order.status === "cancelled"
                    ? "Pedido cancelado."
                    : paidOnline
                      ? `${onlineLabel} confirmado automaticamente.`
                      : "Pagamento confirmado pela equipe."}
              </p>
              {paidOnline && order.status !== "received" && !showOnline && (
                <span className="mt-2 block">
                  <PaymentReceipt payment={paidOnline} orderId={order.id} token={token} compact />
                </span>
              )}
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--lj-header-real,120px)+24px)] lg:self-start">
          <OrderSummary totals={order.totals} title="Valores do pedido" />
          <div className="lj-card lj-card--pad flex flex-col gap-3">
            <h2 className="lj-h3 inline-flex items-center gap-2">
              <MessageCircle className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> Precisa de ajuda?
            </h2>
            <p className="lj-small lj-muted">
              Fale com o atendimento ({STORE.supportHours.toLowerCase()}) informando o número <strong>{order.number}</strong>.
            </p>
            {STORE.whatsappUrl && (
              <a href={STORE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="lj-btn lj-btn--secondary">
                Falar no WhatsApp<span className="lj-sr-only"> (abre em nova aba)</span>
              </a>
            )}
          </div>
          <Link href="/loja/produtos" className="lj-btn lj-btn--secondary">
            <Package aria-hidden="true" /> Continuar comprando
          </Link>
        </div>
      </div>
    </div>
  );
}
