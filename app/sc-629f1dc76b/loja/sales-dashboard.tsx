"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Copy, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/app/loja/_lib/catalog";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/app/loja/_lib/order-status";
import type { SalesDashboard } from "@/lib/loja-dashboard";
import { apiFetch } from "../_lib/api";

const REFRESH_MS = 30_000;
const METHOD_LABEL: Record<string, string> = { pix: "Pix", crypto: "Cripto (USDT)", cartao: "Cartão", boleto: "Boleto" };
const CHARGE_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  creating: { label: "gerando", variant: "outline" },
  pending: { label: "aguardando", variant: "outline" },
  paid: { label: "pago", variant: "default" },
  expired: { label: "expirou", variant: "secondary" },
  review: { label: "em análise", variant: "destructive" },
  failed: { label: "falhou", variant: "secondary" },
};
const EVENT_LABEL: Record<string, string> = {
  "order.paid": "Pago",
  "order.expired": "Expirou",
  "order.held": "Retido p/ análise",
  "order.confirmed": "Confirmado",
  "order.paid_late": "Pago com atraso",
  "order.underpaid": "Pago a menos",
};

const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const cents = (c: number) => formatBRL(c / 100);
const longDay = (day: string) => {
  const s = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** São Paulo calendar day, `daysAgo` before now, as YYYY-MM-DD. */
function spDay(daysAgo = 0) {
  const d = new Date(Date.now() - 3 * 3600 * 1000 - daysAgo * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function delta(now: number, before: number) {
  if (!before) return now ? "sem pedidos no dia anterior" : "igual ao dia anterior";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "igual ao dia anterior" : `${pct > 0 ? "+" : ""}${pct}% vs. dia anterior`;
}

// One series (the day's sales per hour, brand blue) — no legend needed.
const hourlyConfig = { value: { label: "Vendas", color: "var(--chart-1)" } } satisfies ChartConfig;

export function SalesDashboardTab() {
  const [day, setDay] = useState(spDay());
  const [data, setData] = useState<SalesDashboard | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const r = await apiFetch<SalesDashboard>(`/api/admin/loja/dashboard?day=${d}`);
    setLoading(false);
    if (r.ok) setData(r.data);
    else toast.error(`Erro ao carregar vendas: ${r.error}`);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(day), 0);
    // Today keeps updating by itself (webhooks confirm payments in the background).
    const timer = day === spDay() ? window.setInterval(() => void load(day), REFRESH_MS) : undefined;
    return () => {
      window.clearTimeout(first);
      if (timer) window.clearInterval(timer);
    };
  }, [day, load]);

  const today = spDay();
  const yesterday = spDay(1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={day === today ? "default" : "outline"} onClick={() => setDay(today)}>
          Hoje
        </Button>
        <Button size="sm" variant={day === yesterday ? "default" : "outline"} onClick={() => setDay(yesterday)}>
          Ontem
        </Button>
        <Input
          type="date"
          aria-label="Escolher dia"
          className="h-8 w-auto"
          max={today}
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={() => void load(day)} disabled={loading} aria-label="Atualizar">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        {data && (
          <span className="text-xs text-muted-foreground">
            {longDay(data.day)} · atualizado às {time.format(new Date(data.generatedAt))}
            {data.isToday ? " · atualiza sozinho a cada 30 s" : ""}
          </span>
        )}
      </div>
      {!data ? <Spinner /> : <Dashboard data={data} />}
    </div>
  );
}

function Dashboard({ data }: { data: SalesDashboard }) {
  const { orders, received } = data;
  const tiles = [
    { label: "Pedidos", value: `${orders.n}`, hint: delta(orders.n, orders.previousDay.n) },
    { label: "Vendido (pedidos)", value: formatBRL(orders.value), hint: delta(orders.value, orders.previousDay.value) },
    { label: "Ticket médio", value: orders.n ? formatBRL(orders.avgTicket) : "–", hint: "sem contar cancelados" },
    {
      label: "Recebido online",
      value: cents(received.cents),
      hint: received.n
        ? `${received.n} pagamento${received.n === 1 ? "" : "s"} · líquido ${cents(received.netCents)}${received.tests ? ` · ${received.tests} TESTE` : ""}`
        : "nenhum pagamento confirmado",
    },
    { label: "Cancelados", value: `${orders.cancelled}`, hint: "pedidos do dia" },
  ];
  const maxMethod = Math.max(1, ...orders.byMethod.map((m) => m.value));
  const hasSales = data.hourly.some((h) => h.orders > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="pb-2">
              <CardDescription>{t.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{t.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">{t.hint}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Vendas por hora</CardTitle>
            <CardDescription>Valor dos pedidos feitos em cada hora (horário de Brasília), sem cancelados.</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasSales ? (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Nenhum pedido neste dia ainda.</div>
            ) : (
              <ChartContainer config={hourlyConfig} className="aspect-auto h-[220px] w-full">
                <BarChart data={data.hourly} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tickLine={false} axisLine={false} interval={2} />
                  <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(v) => compact.format(Number(v))} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, p) => {
                          const row = p?.[0]?.payload as { hour: number; orders: number } | undefined;
                          return row ? `${row.hour}h–${row.hour + 1}h · ${row.orders} pedido${row.orders === 1 ? "" : "s"}` : "";
                        }}
                        formatter={(v) => formatBRL(Number(v))}
                      />
                    }
                  />
                  <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formas de pagamento</CardTitle>
            <CardDescription>Pedidos do dia, sem cancelados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.byMethod.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem pedidos.</p>
            ) : (
              orders.byMethod.map((m) => (
                <div key={m.method} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{METHOD_LABEL[m.method] ?? m.method}</span>
                    <span className="font-medium tabular-nums">
                      {formatBRL(m.value)} <span className="text-muted-foreground">· {m.n}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(m.value / maxMethod) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
            {received.byProvider.length > 0 && (
              <div className="space-y-1 border-t pt-3 text-sm">
                <p className="font-medium">Recebido online no dia</p>
                {received.byProvider.map((p) => (
                  <div key={p.provider} className="flex flex-wrap justify-between gap-x-2 text-muted-foreground">
                    <span>{METHOD_LABEL[p.provider] ?? p.provider}</span>
                    <span className="tabular-nums">
                      {cents(p.cents)} · taxa {cents(p.feeCents)} · líquido {cents(p.netCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pedidos do dia ({data.list.length})</CardTitle>
            <CardDescription>Detalhes completos (endereço, CPF, rastreio) na aba Pedidos.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido neste dia.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.list.map((o) => {
                      const c = o.charge ? CHARGE_LABEL[o.charge.status] : null;
                      return (
                        <TableRow key={o.id} className={o.status === "cancelled" ? "opacity-60" : undefined}>
                          <TableCell className="tabular-nums">{time.format(new Date(o.createdAt))}</TableCell>
                          <TableCell className="font-mono text-xs">{o.number}</TableCell>
                          <TableCell>{o.customer}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              <span>{METHOD_LABEL[o.method] ?? o.method}</span>
                              {c && <Badge variant={c.variant}>{c.label}</Badge>}
                              {o.charge?.test && <Badge variant="secondary">TESTE</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={o.status === "cancelled" ? "destructive" : o.status === "received" ? "outline" : "default"}>
                              {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(o.total)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Produtos vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              {data.products.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada vendido neste dia.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.products.map((p) => (
                    <li key={p.sku} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        <span className="font-medium tabular-nums">{p.qty}×</span> {p.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatBRL(p.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Precisa de atenção agora</CardTitle>
              <CardDescription>Independe do dia escolhido.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Aguardando pagamento</span>
                <span className="font-medium tabular-nums">
                  {data.attention.awaiting.n} · {formatBRL(data.attention.awaiting.value)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pagos a preparar/enviar</span>
                <span className="font-medium tabular-nums">{data.attention.toShip}</span>
              </div>
              {data.attention.review.length > 0 ? (
                <div className="space-y-1 border-t pt-2">
                  <p className="font-medium text-destructive">Pagamentos em análise ({data.attention.review.length})</p>
                  {data.attention.review.map((r) => (
                    <p key={`${r.number}-${r.updatedAt}`} className="text-muted-foreground">
                      <span className="font-mono text-xs">{r.number}</span> · {METHOD_LABEL[r.provider] ?? r.provider} · {cents(r.cents)}
                      {r.providerStatus ? ` · ${r.providerStatus}` : ""}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum pagamento em análise.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <WebhooksCard webhooks={data.webhooks} />
    </div>
  );
}

function WebhooksCard({ webhooks }: { webhooks: SalesDashboard["webhooks"] }) {
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Webhooks de pagamento</CardTitle>
        <CardDescription>
          Endereços que o pix-checkout e o crypto-checkout chamam para confirmar pagamentos (assinados com HMAC-SHA256). As chaves ficam só
          no servidor e não aparecem aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
          {webhooks.providers.map((w) => (
            <div key={w.provider} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{w.provider === "pix" ? "Pix" : "Cripto (USDT-TRC20)"}</span>
                {w.configured ? <Badge>Ativo</Badge> : <Badge variant="destructive">Sem chaves — pagamento manual</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{w.url}</code>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Copiar URL" onClick={() => void copy(w.url)}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {w.lastEventAt ? `Último evento: ${dateTime.format(new Date(w.lastEventAt))}` : "Nenhum evento recebido ainda"} · {w.eventsOnDay} no
                dia escolhido
              </p>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Últimos eventos recebidos</p>
          {webhooks.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum webhook recebido ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cobrança</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.recent.map((e) => (
                    <TableRow key={`${e.provider}-${e.providerRef}-${e.event}`}>
                      <TableCell className="tabular-nums">{dateTime.format(new Date(e.receivedAt))}</TableCell>
                      <TableCell>{e.provider === "pix" ? "Pix" : "Cripto"}</TableCell>
                      <TableCell>{EVENT_LABEL[e.event] ?? e.event}</TableCell>
                      <TableCell className="font-mono text-xs">{e.number ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.providerRef}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
