"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRODUCTS, STORE, formatBRL } from "@/app/loja/_lib/catalog";
import { ALLOWED_TRANSITIONS, ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/app/loja/_lib/order-status";
import { apiFetch, apiPatch, apiPost } from "../_lib/api";

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
const paymentLabel = (m: string) => STORE.payment.find((p) => p.id === m)?.label ?? m;
const ERRORS: Record<string, string> = {
  invalid_transition: "Essa mudança de status não é permitida (ou o pedido foi alterado por outra pessoa). Recarregue.",
  tracking_required: "Informe o código de rastreio para marcar como enviado.",
  out_of_stock: "Estoque insuficiente para confirmar o pagamento deste pedido. Ajuste o estoque na aba Estoque ou fale com o cliente.",
  forbidden: "Sem permissão.",
  network_error: "Falha de rede.",
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
    const r = await apiFetch<{ stock: StockRow[] }>("/api/admin/loja/stock", { method: "PUT", body: JSON.stringify({ sku, quantity }) });
    if (r.ok) {
      setRows(r.data.stock);
      setDraft((d) => ({ ...d, [sku]: "" }));
      toast.success(quantity === null ? "Estoque deixou de ser controlado" : "Estoque atualizado");
    } else toast.error(`Erro: ${r.error}`);
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

export function LojaAdminClient({ canOrders, canAnalytics }: { canOrders: boolean; canAnalytics: boolean }) {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loja</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos da loja online (pagamento combinado pela equipe — não há cobrança automática), estoque e métricas anônimas.
        </p>
      </div>
      <Tabs defaultValue={canOrders ? "pedidos" : "metricas"}>
        <TabsList>
          {canOrders && <TabsTrigger value="pedidos">Pedidos</TabsTrigger>}
          {canOrders && <TabsTrigger value="estoque">Estoque</TabsTrigger>}
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
        {canAnalytics && (
          <TabsContent value="metricas" className="pt-4">
            <MetricsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
