"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRODUCTS, applyCatalog, formatBRL, type CatalogSnapshot } from "@/app/loja/_lib/catalog";
import { CatalogTab, SettingsTab } from "./catalog-admin";
import { ALLOWED_TRANSITIONS, ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/app/loja/_lib/order-status";
import { apiDelete, apiFetch, apiPatch, apiPost } from "../_lib/api";
import { downloadCsv } from "../_lib/csv";

type AdminOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  customer: { name: string; email: string; phone: string; cpfMasked: string };
  address: { cep: string; street: string; number: string; complement: string; district: string; city: string; uf: string };
  items: { sku: string; name: string; qty: number; unitPrice: number; reserved?: boolean }[];
  total: number;
  payment: { method: "pix" | "cartao" | "boleto"; installments: number };
  trackingCode: string | null;
  history: { status: OrderStatus; at: string; note?: string }[];
  createdAt: string;
};

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const PAYMENT_LABELS: Record<string, string> = { pix: "Pix", cartao: "Cartão de crédito", boleto: "Boleto" };
const paymentLabel = (m: string) => PAYMENT_LABELS[m] ?? m;
const ERRORS: Record<string, string> = {
  invalid_transition: "Essa mudança de status não é permitida (ou o pedido foi alterado por outra pessoa). Recarregue.",
  tracking_required: "Informe o código de rastreio para marcar como enviado.",
  out_of_stock: "Estoque insuficiente para confirmar o pagamento deste pedido. Ajuste o estoque na aba Estoque ou fale com o cliente.",
  forbidden: "Sem permissão.",
  network_error: "Falha de rede.",
  rate_limited: "Limite de revelações de CPF por hora atingido. Por segurança, tente novamente mais tarde.",
  invalid_tracking_code: "Código de rastreio inválido. Use só letras e números (ex.: AB123456789BR).",
  cpf_unavailable: "Não foi possível abrir o CPF deste pedido (a chave do servidor mudou depois da compra). Peça o CPF ao cliente.",
  stock_conflict: "O estoque deste produto mudou enquanto você editava (por exemplo, um pedido aprovado). Recarregue e ajuste de novo.",
};

function statusVariant(s: OrderStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "cancelled") return "destructive";
  if (s === "received") return "outline";
  if (s === "delivered") return "secondary";
  return "default";
}

function OrderCard({ order, onChanged }: { order: AdminOrder; onChanged: (o: AdminOrder) => void }) {
  const [tracking, setTracking] = useState(order.trackingCode ?? "");
  const [busy, setBusy] = useState<OrderStatus | "cpf" | null>(null);
  const [cpf, setCpf] = useState<string | null>(null);

  async function move(to: OrderStatus) {
    if (to === "cancelled" && !window.confirm(`Cancelar o pedido ${order.number}? O estoque reservado por ele volta automaticamente.`)) return;
    setBusy(to);
    const r = await apiPatch<{ order: AdminOrder }>(`/api/admin/loja/orders/${order.id}`, { status: to, ...(tracking.trim() ? { trackingCode: tracking.trim() } : {}) });
    setBusy(null);
    if (r.ok) {
      toast.success(`${order.number}: ${ORDER_STATUS_LABEL[to]}`);
      onChanged({ ...order, ...r.data.order });
    } else toast.error(ERRORS[r.error] ?? `Erro: ${r.error}`);
  }

  async function revealCpf() {
    setBusy("cpf");
    const r = await apiPost<{ cpf: string }>(`/api/admin/loja/orders/${order.id}`, { action: "reveal_cpf" });
    setBusy(null);
    if (r.ok) setCpf(r.data.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"));
    else toast.error(ERRORS[r.error] ?? `Erro: ${r.error}`);
  }

  const next = ALLOWED_TRANSITIONS[order.status];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{order.number}</CardTitle>
          <CardDescription>
            {fmt.format(new Date(order.createdAt))} · {formatBRL(order.total)} · {paymentLabel(order.payment.method)}
            {order.payment.method === "cartao" && order.payment.installments > 1 ? ` ${order.payment.installments}x` : ""}
          </CardDescription>
        </div>
        <Badge variant={statusVariant(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-3">
        <div className="space-y-1">
          <p className="font-medium">Cliente</p>
          <p>{order.customer.name}</p>
          <p className="text-muted-foreground">{order.customer.email}</p>
          <p className="text-muted-foreground">{order.customer.phone.replace(/(\d{2})(\d{4,5})(\d{4})/, "($1) $2-$3")}</p>
          <p className="flex items-center gap-2 text-muted-foreground">
            CPF {cpf ?? order.customer.cpfMasked}
            {!cpf && (
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={revealCpf} disabled={busy === "cpf"}>
                <Eye className="size-3.5" /> Revelar
              </Button>
            )}
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Entrega</p>
          <p>
            {order.address.street}, {order.address.number}
            {order.address.complement ? ` — ${order.address.complement}` : ""}
          </p>
          <p className="text-muted-foreground">
            {order.address.district} · {order.address.city}/{order.address.uf} · {order.address.cep}
          </p>
          <p className="font-medium pt-2">Itens</p>
          {order.items.map((i) => (
            <p key={i.sku} className="text-muted-foreground">
              {i.qty}× {i.name} — {formatBRL(i.unitPrice * i.qty)}
              {i.reserved ? " · estoque reservado" : ""}
            </p>
          ))}
        </div>
        <div className="space-y-2">
          <p className="font-medium">Histórico</p>
          {order.history.map((h) => (
            <p key={h.status + h.at} className="text-muted-foreground">
              {ORDER_STATUS_LABEL[h.status]} · {fmt.format(new Date(h.at))}
            </p>
          ))}
          {next.length > 0 && (
            <div className="space-y-2 pt-2">
              {next.includes("shipped") && (
                <Input placeholder="Código de rastreio" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={40} />
              )}
              <div className="flex flex-wrap gap-2">
                {next.map((to) => (
                  <Button key={to} size="sm" variant={to === "cancelled" ? "destructive" : "default"} disabled={busy !== null} onClick={() => move(to)}>
                    {busy === to ? <Spinner /> : null}
                    {to === "cancelled" ? "Cancelar" : `→ ${ORDER_STATUS_LABEL[to]}`}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {order.trackingCode && <p className="text-muted-foreground">Rastreio: {order.trackingCode}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (before?: string) => {
      const sp = new URLSearchParams();
      if (filter) sp.set("status", filter);
      if (search) sp.set("q", search);
      if (before) sp.set("before", before);
      return apiFetch<{ orders: AdminOrder[]; nextBefore: string | null }>(`/api/admin/loja/orders?${sp}`);
    },
    [filter, search],
  );

  const load = useCallback(async () => {
    setError(null);
    const r = await fetchPage();
    if (r.ok) {
      setOrders(r.data.orders);
      setNextBefore(r.data.nextBefore);
    } else setError(r.error);
  }, [fetchPage]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function loadMore() {
    if (!nextBefore) return;
    setLoadingMore(true);
    const r = await fetchPage(nextBefore);
    setLoadingMore(false);
    if (r.ok) {
      setOrders((cur) => [...(cur ?? []), ...r.data.orders]);
      setNextBefore(r.data.nextBefore);
    } else toast.error(`Erro: ${r.error}`);
  }

  return (
    <div className="space-y-4">
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
        }}
      >
        <Input placeholder="Buscar por número, e-mail ou nome" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {(["", ...ORDER_STATUSES] as const).map((s) => (
          <Button key={s || "all"} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s ? ORDER_STATUS_LABEL[s] : "Todos"}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!orders?.length}
          onClick={() =>
            downloadCsv(
              `pedidos-loja-${new Date().toISOString().slice(0, 10)}.csv`,
              (orders ?? []).map((o) => ({
                numero: o.number,
                data: fmt.format(new Date(o.createdAt)),
                status: ORDER_STATUS_LABEL[o.status],
                total: o.total.toFixed(2).replace(".", ","),
                pagamento: paymentLabel(o.payment.method),
                parcelas: o.payment.installments,
                cliente: o.customer.name,
                email: o.customer.email,
                celular: o.customer.phone,
                cpf: o.customer.cpfMasked,
                cidade: `${o.address.city}/${o.address.uf}`,
                itens: o.items.map((i) => `${i.qty}x ${i.name}`).join(" | "),
                rastreio: o.trackingCode ?? "",
              })),
            )
          }
        >
          <Download className="size-4" /> Exportar CSV (lista carregada)
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">Erro ao carregar: {error}</p>}
      {!orders ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido{filter ? ` com status “${ORDER_STATUS_LABEL[filter]}”` : ""}
          {search ? ` para “${search}”` : ""}.
        </p>
      ) : (
        <>
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} onChanged={(u) => setOrders((all) => all?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
          ))}
          {nextBefore && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Spinner /> : null} Carregar mais pedidos
            </Button>
          )}
        </>
      )}
    </div>
  );
}

type StockRow = { sku: string; quantity: number; updatedAt: string; updatedBy: string };

function StockTab() {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await apiFetch<{ stock: StockRow[] }>("/api/admin/loja/stock");
    if (r.ok) setRows(r.data.stock);
    else toast.error(`Erro: ${r.error}`);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function save(sku: string, quantity: number | null) {
    // Send what we're looking at, so the server refuses if it changed meanwhile.
    const expected = rows?.find((row) => row.sku === sku)?.quantity ?? null;
    const r = await apiFetch<{ stock: StockRow[] }>("/api/admin/loja/stock", { method: "PUT", body: JSON.stringify({ sku, quantity, expected }) });
    if (r.ok) {
      setRows(r.data.stock);
      setDraft((d) => ({ ...d, [sku]: "" }));
      toast.success(quantity === null ? "Estoque deixou de ser controlado" : "Estoque atualizado");
    } else {
      toast.error(ERRORS[r.error] ?? `Erro: ${r.error}`);
      if (r.error === "stock_conflict") void load();
    }
  }

  if (!rows) return <Spinner />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estoque da loja</CardTitle>
        <CardDescription>
          Sem quantidade definida, o produto não tem estoque controlado (vale a disponibilidade do catálogo). Com quantidade, a loja não
          aceita pedidos acima do disponível; o estoque é reservado quando você confirma o pagamento de um pedido e volta se ele for
          cancelado. Com 0, o produto aparece como esgotado. A loja nunca mostra números — só “Em estoque”, “Últimas unidades” (≤ 3) ou
          “Esgotado”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Venda online</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead className="w-[260px]">Definir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PRODUCTS.map((p) => {
              const row = rows.find((r) => r.sku === p.sku);
              const value = draft[p.sku] ?? "";
              return (
                <TableRow key={p.sku}>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </TableCell>
                  <TableCell>{p.purchasable ? <Badge>Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell>
                  <TableCell>
                    {row ? (
                      <>
                        <span className="font-semibold">{row.quantity}</span>
                        <p className="text-xs text-muted-foreground">
                          {fmt.format(new Date(row.updatedAt))} · {row.updatedBy}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Não controlado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="Qtd."
                        value={value}
                        onChange={(e) => setDraft((d) => ({ ...d, [p.sku]: e.target.value }))}
                        className="w-24"
                      />
                      <Button size="sm" disabled={value === "" || Number(value) < 0 || !Number.isInteger(Number(value))} onClick={() => save(p.sku, Number(value))}>
                        Salvar
                      </Button>
                      {row && (
                        <Button size="sm" variant="ghost" onClick={() => save(p.sku, null)}>
                          Liberar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type Metrics = {
  days: number;
  sessions: number;
  funnel: { step: string; sessions: number; total: number }[];
  searches: { term: string; n: number; zero: number }[];
  products: { item: string; views: number; adds: number }[];
};

const STEP_LABEL: Record<string, string> = {
  view_item: "Viu produto",
  add_to_cart: "Adicionou ao carrinho",
  view_cart: "Abriu o carrinho",
  begin_checkout: "Iniciou checkout",
  add_shipping_info: "Preencheu entrega",
  add_payment_info: "Escolheu pagamento",
  purchase: "Registrou pedido",
};

function MetricsTab() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Metrics | null>(null);
  useEffect(() => {
    let alive = true;
    void apiFetch<Metrics>(`/api/admin/loja/metrics?days=${days}`).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else toast.error(`Erro: ${r.error}`);
    });
    return () => {
      alive = false;
    };
  }, [days]);

  const top = data?.funnel[0]?.sessions || 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d === 1 ? "24h" : `${d} dias`}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Só de visitantes que aceitaram a medição anônima no banner da loja — os números são uma amostra, não o total de visitas.
      </p>
      {!data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funil ({data.sessions} sessões)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.funnel.map((f) => (
                <div key={f.step} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{STEP_LABEL[f.step] ?? f.step}</span>
                    <span className="font-medium">
                      {f.sessions}
                      {top ? <span className="text-muted-foreground"> · {Math.round((f.sessions / top) * 100)}%</span> : null}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${top ? (f.sessions / top) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Buscas</CardTitle>
              <CardDescription>“Sem resultado” mostra o que as pessoas procuram e o catálogo não tem.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.searches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem buscas no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Termo</TableHead>
                      <TableHead className="text-right">Buscas</TableHead>
                      <TableHead className="text-right">Sem resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.searches.map((s) => (
                      <TableRow key={s.term}>
                        <TableCell>{s.term}</TableCell>
                        <TableCell className="text-right">{s.n}</TableCell>
                        <TableCell className="text-right">{s.zero}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Produtos</CardTitle>
            </CardHeader>
            <CardContent>
              {data.products.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Visualizações</TableHead>
                      <TableHead className="text-right">Adições ao carrinho</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.products.map((p) => (
                      <TableRow key={p.item}>
                        <TableCell>{p.item}</TableCell>
                        <TableCell className="text-right">{p.views}</TableCell>
                        <TableCell className="text-right">{p.adds}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

type Summary = {
  awaitingPayment: { n: number; value: number };
  toShip: { n: number };
  confirmed: { n: number; value: number };
  lastWeek: number;
  subscribers: { news?: number; restock?: number };
};

function SummaryCards() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    let alive = true;
    void apiFetch<Summary>("/api/admin/loja/summary").then((r) => alive && r.ok && setData(r.data));
    return () => {
      alive = false;
    };
  }, []);
  const cards = [
    { label: "Aguardando pagamento", value: data ? `${data.awaitingPayment.n}` : "–", hint: data ? formatBRL(data.awaitingPayment.value) : "" },
    { label: "A preparar/enviar", value: data ? `${data.toShip.n}` : "–", hint: "pagos, ainda não enviados" },
    { label: "Receita confirmada", value: data ? formatBRL(data.confirmed.value) : "–", hint: data ? `${data.confirmed.n} pedidos pagos` : "" },
    { label: "Pedidos em 7 dias", value: data ? `${data.lastWeek}` : "–", hint: "todos os status" },
    { label: "Inscritos", value: data ? `${(data.subscribers.news ?? 0) + (data.subscribers.restock ?? 0)}` : "–", hint: data ? `${data.subscribers.news ?? 0} novidades · ${data.subscribers.restock ?? 0} reposição` : "" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className="text-2xl">{c.value}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{c.hint}</CardContent>
        </Card>
      ))}
    </div>
  );
}

type Subscriber = { id: number; email: string; kind: "news" | "restock"; sku: string; consentText: string; createdAt: string };

function SubscribersTab() {
  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const load = useCallback(async () => {
    const r = await apiFetch<{ subscribers: Subscriber[] }>("/api/admin/loja/subscribers");
    if (r.ok) setRows(r.data.subscribers);
    else toast.error(r.error === "rate_limited" ? "Muitas consultas à lista de inscritos nesta hora. Tente mais tarde." : `Erro: ${r.error}`);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function remove(s: Subscriber) {
    if (!window.confirm(`Remover ${s.email} da lista? (use quando a pessoa pedir a exclusão)`)) return;
    const r = await apiDelete(`/api/admin/loja/subscribers?id=${s.id}`);
    if (r.ok) {
      setRows((cur) => cur?.filter((x) => x.id !== s.id) ?? null);
      toast.success("Removido");
    } else toast.error(`Erro: ${r.error}`);
  }

  const productName = (sku: string) => PRODUCTS.find((p) => p.sku === sku)?.name ?? sku;
  if (!rows) return <Spinner />;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Inscritos por e-mail</CardTitle>
          <CardDescription>
            Pessoas que autorizaram receber avisos. Nenhum e-mail é enviado automaticamente — exporte a lista para a sua ferramenta de
            envio e respeite a finalidade autorizada (novidades ou reposição de um produto).
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              `inscritos-loja-${new Date().toISOString().slice(0, 10)}.csv`,
              rows.map((r) => ({
                email: r.email,
                tipo: r.kind === "news" ? "Novidades" : "Reposição",
                produto: r.kind === "restock" ? productName(r.sku) : "",
                data: fmt.format(new Date(r.createdAt)),
                consentimento: r.consentText,
              })),
            )
          }
        >
          <Download className="size-4" /> Exportar CSV
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém se inscreveu ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>{r.kind === "news" ? "Novidades" : `Reposição: ${productName(r.sku)}`}</TableCell>
                  <TableCell>{fmt.format(new Date(r.createdAt))}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" aria-label={`Remover ${r.email}`} onClick={() => remove(r)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function LojaAdminClient({ canOrders, canAnalytics, canCatalog }: { canOrders: boolean; canAnalytics: boolean; canCatalog: boolean }) {
  // The catalog now lives in D1: load it once (also fills the registry the
  // stock/subscribers tabs read product names from).
  // Orders/stock/subscribers/metrics must keep working even if this fails
  // (product names then fall back to SKUs); only the catalog tabs wait.
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const loadCatalogData = useCallback(async () => {
    setCatalogError(null);
    const r = await apiFetch<CatalogSnapshot>("/api/admin/loja/catalog");
    if (r.ok) {
      applyCatalog(r.data);
      setCatalog(r.data);
    } else setCatalogError(r.error);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void loadCatalogData(), 0);
    return () => window.clearTimeout(t);
  }, [loadCatalogData]);

  const catalogPending = (
    <div className="space-y-2">
      {catalogError ? (
        <>
          <p className="text-sm text-destructive">Não foi possível carregar o catálogo ({catalogError}).</p>
          <Button size="sm" variant="outline" onClick={() => void loadCatalogData()}>
            Tentar de novo
          </Button>
        </>
      ) : (
        <Spinner />
      )}
    </div>
  );
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loja</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos da loja online (pagamento combinado pela equipe — não há cobrança automática), estoque e métricas anônimas.
        </p>
      </div>
      {canOrders && <SummaryCards />}
      <Tabs defaultValue={canOrders ? "pedidos" : canCatalog ? "catalogo" : "metricas"}>
        <TabsList>
          {canOrders && <TabsTrigger value="pedidos">Pedidos</TabsTrigger>}
          {canOrders && <TabsTrigger value="estoque">Estoque</TabsTrigger>}
          {canOrders && <TabsTrigger value="inscritos">Inscritos</TabsTrigger>}
          {canCatalog && <TabsTrigger value="catalogo">Catálogo</TabsTrigger>}
          {canCatalog && <TabsTrigger value="config">Configurações</TabsTrigger>}
          {canAnalytics && <TabsTrigger value="metricas">Métricas</TabsTrigger>}
        </TabsList>
        {canOrders && (
          <TabsContent value="pedidos" className="pt-4">
            <OrdersTab />
          </TabsContent>
        )}
        {canOrders && (
          <TabsContent value="estoque" className="pt-4">
            <StockTab />
          </TabsContent>
        )}
        {canOrders && (
          <TabsContent value="inscritos" className="pt-4">
            <SubscribersTab />
          </TabsContent>
        )}
        {canCatalog && (
          <TabsContent value="catalogo" className="pt-4">
            {catalog ? <CatalogTab catalog={catalog} onChanged={loadCatalogData} /> : catalogPending}
          </TabsContent>
        )}
        {canCatalog && (
          <TabsContent value="config" className="pt-4">
            {catalog ? <SettingsTab key={catalog.version} catalog={catalog} onChanged={loadCatalogData} /> : catalogPending}
          </TabsContent>
        )}
        {canAnalytics && (
          <TabsContent value="metricas" className="pt-4">
            <MetricsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
