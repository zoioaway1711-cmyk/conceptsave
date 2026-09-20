"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "../_lib/api";

type DailyCount = { date: string; count: number };
type CountryCount = { country: string; count: number };

// Single series each — no legend/multi-hue needed (see dataviz skill: a
// legend/CVD-separation concern only applies once there's more than one
// series to tell apart). Reuses the app's own brand blue (--chart-1) so
// these charts read as part of the same visual identity as the rest of
// the admin panel, not a bolt-on widget with its own palette.
const activationsConfig = { count: { label: "Ativações", color: "var(--chart-1)" } } satisfies ChartConfig;
const countriesConfig = { count: { label: "Eventos", color: "var(--chart-1)" } } satisfies ChartConfig;

function formatDay(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

export function ActivationsChart() {
  const [series, setSeries] = useState<DailyCount[] | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void apiFetch<{ series: DailyCount[] }>("/api/admin/dashboard/activations?days=30").then((result) => {
        if (result.ok) setSeries(result.data.series);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const total = series?.reduce((sum, point) => sum + point.count, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ativações nos últimos 30 dias</CardTitle>
        <CardDescription>{series ? `${total} ${total === 1 ? "ativação" : "ativações"} no período` : "Carregando…"}</CardDescription>
      </CardHeader>
      <CardContent>
        {!series ? (
          <div className="flex h-[200px] items-center justify-center"><Spinner className="size-6" /></div>
        ) : total === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Nenhuma ativação registrada nesse período.</div>
        ) : (
          <ChartContainer config={activationsConfig} className="aspect-auto h-[200px] w-full">
            <AreaChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="activationsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatDay} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDay(String(value))} />} />
              <Area dataKey="count" type="monotone" stroke="var(--chart-1)" strokeWidth={2} fill="url(#activationsFill)" />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// Country codes only (no name lookup table to maintain) — unambiguous to
// an admin and avoids a stale/incomplete ISO-3166 name map.
export function TopCountriesChart() {
  const [countries, setCountries] = useState<CountryCount[] | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void apiFetch<{ countries: CountryCount[] }>("/api/admin/dashboard/geo?days=30").then((result) => {
        if (result.ok) setCountries(result.data.countries);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>De onde vêm as verificações</CardTitle>
        <CardDescription>Top países por atividade de clientes nos últimos 30 dias (localização aproximada por IP).</CardDescription>
      </CardHeader>
      <CardContent>
        {!countries ? (
          <div className="flex h-[200px] items-center justify-center"><Spinner className="size-6" /></div>
        ) : countries.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Sem sinal de localização registrado ainda.</div>
        ) : (
          <ChartContainer config={countriesConfig} className="aspect-auto h-[200px] w-full">
            <BarChart data={countries} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis dataKey="country" type="category" width={36} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--chart-1)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
