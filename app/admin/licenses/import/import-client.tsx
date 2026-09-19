"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { toast } from "sonner";
import { ArrowLeft, Download, Printer, TriangleAlert, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { apiPost } from "../../_lib/api";

type ParsedRow = { serial: string; lot: string; product: string; expiresAt: string | null };
type ImportResult =
  | { index: number; status: "created"; product: string; materialId: number; licenseId: number; serial: string }
  | { index: number; status: "duplicate" | "error"; product: string; error: string };

const PLACEHOLDER = `SERIAL,LOTE,PRODUTO,VALIDADE
SAVEC-WD3T-R8WP-3MDH-MJUW,SC-2609-001,T3,2028-09-19
SAVEC-VH69-BBZQ-ATSM-9EEB,SC-2609-002,Diana injetável,2028-09-19`;

function detectDelimiter(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function parseDateFlexible(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const isoLike = /^\d{4}-\d{2}-\d{2}/.test(value);
  const brLike = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let date: Date;
  if (brLike) {
    date = new Date(Date.UTC(Number(brLike[3]), Number(brLike[2]) - 1, Number(brLike[1])));
  } else if (isoLike) {
    date = new Date(value.length <= 10 ? `${value}T00:00:00.000Z` : value);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  if (lines.length === 0) return { rows, errors };
  const delimiter = detectDelimiter(lines[0]);
  const startIndex = lines[0].toUpperCase().startsWith("SERIAL") ? 1 : 0;
  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const [serial, lot, product, expiry] = cols;
    if (!serial || !product) {
      errors.push(`Linha ${i + 1}: faltam colunas obrigatórias (serial/produto).`);
      continue;
    }
    rows.push({ serial: serial.toUpperCase(), lot: lot ?? "", product, expiresAt: expiry ? parseDateFlexible(expiry) : null });
  }
  return { rows, errors };
}

export function ImportClient() {
  const [raw, setRaw] = useState("");
  const [maker, setMaker] = useState("Save Concept");
  const [brand, setBrand] = useState("Save Concept");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [qrByIndex, setQrByIndex] = useState<Record<number, string>>({});

  const { rows, errors } = useMemo(() => parseCsv(raw), [raw]);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function submit() {
    if (rows.length === 0) return;
    setSubmitting(true);
    const result = await apiPost<{ results: ImportResult[]; summary: { total: number; created: number; skipped: number } }>(
      "/api/admin/licenses/import",
      { rows: rows.map((row) => ({ serial: row.serial, lot: row.lot, product: row.product, expiresAt: row.expiresAt })), maker, brand },
    );
    setSubmitting(false);
    if (!result.ok) {
      toast.error("Falha ao importar", { description: result.error });
      return;
    }
    setResults(result.data.results);
    toast.success(`${result.data.summary.created} de ${result.data.summary.total} produtos importados`);

    const created = result.data.results.filter((r): r is Extract<ImportResult, { status: "created" }> => r.status === "created");
    const origin = window.location.origin;
    const entries = await Promise.all(created.map(async (r) => {
      const url = `${origin}/?serial=${encodeURIComponent(r.serial)}`;
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 260 }).catch(() => null);
      return [r.index, dataUrl] as const;
    }));
    setQrByIndex(Object.fromEntries(entries.filter(([, url]) => url) as [number, string][]));
  }

  function downloadAll() {
    if (!results) return;
    const created = results.filter((r): r is Extract<ImportResult, { status: "created" }> => r.status === "created");
    created.forEach((r, i) => {
      const dataUrl = qrByIndex[r.index];
      if (!dataUrl) return;
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `qr-${r.product.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${r.serial.slice(-4)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 120);
    });
  }

  const created = results?.filter((r) => r.status === "created") ?? [];
  const skipped = results?.filter((r) => r.status !== "created") ?? [];

  return (
    <div className="space-y-6 p-6 lg:p-8 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Importar produtos</h1>
          <p className="text-sm text-muted-foreground">Cria os produtos (materials) e as licenças a partir de uma lista com serial, lote, produto e validade — e gera o QR Code de cada um.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/licenses"><ArrowLeft className="size-4" /> Voltar para licenças</Link>
        </Button>
      </div>

      {!results ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>1. Cole ou envie a lista</CardTitle>
            <CardDescription>Colunas nesta ordem: Serial, Lote, Produto, Validade (aceita vírgula, ponto e vírgula ou tabulação — como copiado do Excel).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="import-maker">Fabricante</Label>
                <Input id="import-maker" value={maker} onChange={(event) => setMaker(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-brand">Marca</Label>
                <Input id="import-brand" value={brand} onChange={(event) => setBrand(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-file">Enviar arquivo (.csv ou .txt exportado do Excel)</Label>
              <Input id="import-file" type="file" accept=".csv,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-textarea">Ou cole aqui</Label>
              <Textarea id="import-textarea" rows={10} className="font-mono text-xs" placeholder={PLACEHOLDER} value={raw} onChange={(event) => setRaw(event.target.value)} />
            </div>
            {errors.length > 0 ? (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>{errors.length} linha(s) com problema</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">{errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>
                </AlertDescription>
              </Alert>
            ) : null}
            <p className="text-sm text-muted-foreground">{rows.length} linha{rows.length === 1 ? "" : "s"} pronta{rows.length === 1 ? "" : "s"} para importar.</p>
            <Button onClick={() => void submit()} disabled={rows.length === 0 || submitting}>
              {submitting ? <Spinner className="size-4" /> : <Upload className="size-4" />}
              {submitting ? "Importando…" : `Importar ${rows.length} produto${rows.length === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert variant="destructive" className="print:hidden">
            <TriangleAlert />
            <AlertTitle>Os seriais abaixo só aparecem agora</AlertTitle>
            <AlertDescription>Baixe ou imprima os QR Codes antes de sair desta página — depois disso só o formato mascarado (••••) fica disponível no painel.</AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Badge variant="outline" className="border-emerald-900/60 bg-emerald-950/70 text-emerald-400">{created.length} criados</Badge>
            {skipped.length > 0 ? <Badge variant="outline">{skipped.length} ignorados/duplicados</Badge> : null}
            <Button variant="outline" onClick={downloadAll} disabled={created.length === 0}>
              <Download className="size-4" /> Baixar todos os QR Codes
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimir etiquetas
            </Button>
            <Button variant="outline" onClick={() => { setResults(null); setRaw(""); setQrByIndex({}); }}>
              Importar outra lista
            </Button>
          </div>

          {skipped.length > 0 ? (
            <Card className="print:hidden">
              <CardHeader><CardTitle className="text-sm">Ignorados</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {skipped.map((r) => (
                  <div key={r.index}>{r.product}: {"error" in r ? r.error : ""}</div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-2">
            {created.map((r) => (
              <div key={r.index} className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center print:break-inside-avoid">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r.product}</span>
                {qrByIndex[r.index] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data: URL generated in-browser
                  <img src={qrByIndex[r.index]} alt={`QR Code de ${r.product}`} width={160} height={160} className="size-[160px]" />
                ) : (
                  <div className="flex size-[160px] items-center justify-center"><Spinner className="size-5" /></div>
                )}
                <code className="break-all text-[10px] text-muted-foreground">{r.serial}</code>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
