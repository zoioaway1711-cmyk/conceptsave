"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, type CatalogSnapshot, type Product, type StoreSettings } from "@/app/loja/_lib/catalog";

/*
 * Admin editors for the storefront catalog and settings (D1). Changes go
 * live in the store within ~15s (per-isolate cache), are validated
 * server-side and audit-logged. Structural fields (slug, SKU, category,
 * image, related lists) stay under engineering control.
 */

type FieldErrors = Record<string, string>;

const REGULATED_CATEGORIES: ReadonlySet<string> = new Set(["frascos", "kits"]);

async function putWithErrors(url: string, body: unknown): Promise<{ ok: true; changed: string[] } | { ok: false; fields: FieldErrors; error: string }> {
  const res = await fetch(url, { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { changed?: string[]; fields?: FieldErrors; error?: string };
  if (res.ok) return { ok: true, changed: data.changed ?? [] };
  return { ok: false, fields: data.fields ?? {}, error: data.error ?? `http_${res.status}` };
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

function ProductEditor({ product, onSaved, onClose }: { product: Product; onSaved: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: product.name,
    presentation: product.presentation,
    summary: product.summary,
    description: product.description,
    price: String(product.price),
    oldPrice: product.oldPrice ? String(product.oldPrice) : "",
    badge: product.badge ?? "",
    specs: product.specs.join("\n"),
    freeShipping: product.freeShipping,
    available: product.available,
    purchasable: product.purchasable,
    coldChain: product.coldChain,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  // Accepts "1290", "1290.5", "1.290,00" and "1290,00".
  const num = (v: string) => {
    const t = v.trim().replace(/\s|R\$/g, "");
    return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  };

  async function save() {
    setSaving(true);
    const r = await putWithErrors(`/api/admin/loja/catalog/products/${product.slug}`, {
      name: form.name,
      presentation: form.presentation,
      summary: form.summary,
      description: form.description,
      price: num(form.price),
      oldPrice: form.oldPrice.trim() ? num(form.oldPrice) : null,
      badge: form.badge.trim() || null,
      specs: form.specs.split("\n").map((l) => l.trim()).filter(Boolean),
      freeShipping: form.freeShipping,
      available: form.available,
      purchasable: form.purchasable,
      coldChain: form.coldChain,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.changed.length ? `Salvo: ${r.changed.join(", ")}` : "Nada mudou");
      onSaved();
      onClose();
    } else {
      setErrors(r.fields);
      toast.error(r.error === "invalid_fields" ? "Confira os campos destacados" : `Erro: ${r.error}`);
    }
  }

  const text = (k: "name" | "presentation" | "badge", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`p-${k}`}>{label}</Label>
      <Input id={`p-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} />
      <FieldError msg={errors[k]} />
    </div>
  );
  const toggle = (k: "available" | "purchasable" | "freeShipping" | "coldChain", label: string, hint: string, disabled = false) => (
    <div className="flex flex-col gap-1">
      <label className="flex items-start justify-between gap-3 rounded-md border p-3">
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
        <Switch checked={form[k]} onCheckedChange={(v) => set(k, v)} disabled={disabled} />
      </label>
      <FieldError msg={errors[k]} />
    </div>
  );
  // Mirrors REGULATED_CATEGORIES in lib/loja-catalog.ts (server-only module):
  // the server refuses online sale for these no matter what is sent.
  const regulated = REGULATED_CATEGORIES.has(product.category);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Editar {product.name}</DialogTitle>
        <DialogDescription>
          SKU {product.sku} · categoria {product.category}. As alterações aparecem na loja em até ~1 minuto.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", "Nome")}
        {text("presentation", "Apresentação")}
        <div className="space-y-1">
          <Label htmlFor="p-price">Preço (R$)</Label>
          <Input id="p-price" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} />
          <FieldError msg={errors.price} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-old">Preço anterior (R$) — opcional</Label>
          <Input id="p-old" inputMode="decimal" value={form.oldPrice} onChange={(e) => set("oldPrice", e.target.value)} placeholder="vazio = sem desconto" />
          <FieldError msg={errors.oldPrice} />
        </div>
        {text("badge", "Selo (opcional)")}
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="p-summary">Resumo</Label>
          <Textarea id="p-summary" rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} />
          <FieldError msg={errors.summary} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="p-desc">Descrição</Label>
          <Textarea id="p-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          <FieldError msg={errors.description} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="p-specs">Especificações (uma por linha, “Rótulo: valor”)</Label>
          <Textarea id="p-specs" rows={4} value={form.specs} onChange={(e) => set("specs", e.target.value)} />
          <FieldError msg={errors.specs} />
        </div>
        {toggle("available", "Disponível", "Desligado = aparece como indisponível.")}
        {regulated
          ? toggle("purchasable", "Venda online", "Bloqueado: esta categoria não pode ser vendida online (sem registro na ANVISA). Veja a revisão regulatória.", !form.purchasable)
          : toggle("purchasable", "Venda online", "Desligado = só para consulta; o servidor recusa pedidos. Veja a revisão regulatória.")}
        {toggle("freeShipping", "Frete grátis", "Afeta o resumo do pedido.")}
        {toggle("coldChain", "Envio refrigerado", "Mostra os avisos de cadeia fria.")}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function CatalogTab({ catalog, onChanged }: { catalog: CatalogSnapshot; onChanged: () => void }) {
  const [editing, setEditing] = useState<Product | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo</CardTitle>
        <CardDescription>
          Preço, preço anterior, textos, disponibilidade e venda online. Alterar preço não muda pedidos já registrados — eles guardam o
          preço da época; carrinhos abertos avisam o cliente sobre a mudança.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.products.map((p) => (
              <TableRow key={p.slug}>
                <TableCell>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.presentation}</p>
                </TableCell>
                <TableCell>
                  {formatBRL(p.price)}
                  {p.oldPrice ? <span className="ml-2 text-xs text-muted-foreground line-through">{formatBRL(p.oldPrice)}</span> : null}
                </TableCell>
                <TableCell className="space-x-1">
                  {p.purchasable ? <Badge>Venda online</Badge> : <Badge variant="outline">Só consulta</Badge>}
                  {!p.available && <Badge variant="destructive">Indisponível</Badge>}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        {editing && <ProductEditor key={editing.slug} product={editing} onSaved={onChanged} onClose={() => setEditing(null)} />}
      </Dialog>
    </Card>
  );
}

const SETTING_FIELDS: { key: keyof StoreSettings; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "whatsappUrl", label: "WhatsApp (link)", hint: "Ex.: https://wa.me/5511999999999 — vazio esconde o botão." },
  { key: "instagramUrl", label: "Instagram (link)", hint: "Ex.: https://instagram.com/saveconcept — vazio esconde." },
  { key: "supportEmail", label: "E-mail de atendimento", hint: "Aparece na Central de ajuda." },
  { key: "privacyEmail", label: "E-mail de privacidade (LGPD)", hint: "Aparece na página de Privacidade." },
  { key: "supportHours", label: "Horário de atendimento" },
  { key: "deliveryWindow", label: "Prazo médio de entrega", hint: "Ex.: 3 a 7 dias úteis" },
  { key: "deliveryDetail", label: "Detalhe da entrega", multiline: true },
  { key: "paymentNote", label: "Aviso de pagamento", multiline: true },
  { key: "returns", label: "Política de trocas e devoluções", multiline: true },
];

export function SettingsTab({ catalog, onChanged }: { catalog: CatalogSnapshot; onChanged: () => void }) {
  const [form, setForm] = useState<StoreSettings>(catalog.settings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await putWithErrors("/api/admin/loja/catalog/settings", form);
    setSaving(false);
    if (r.ok) {
      setErrors({});
      toast.success(r.changed.length ? `Salvo: ${r.changed.join(", ")}` : "Nada mudou");
      onChanged();
    } else {
      setErrors(r.fields);
      toast.error(r.error === "invalid_fields" ? "Confira os campos destacados" : `Erro: ${r.error}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurações da loja</CardTitle>
        <CardDescription>Contatos, prazos e políticas exibidos em toda a loja (ajuda, privacidade, produto, checkout e pedido).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {SETTING_FIELDS.map((f) => (
          <div key={f.key} className={`space-y-1 ${f.multiline ? "sm:col-span-2" : ""}`}>
            <Label htmlFor={`s-${f.key}`}>{f.label}</Label>
            {f.multiline ? (
              <Textarea id={`s-${f.key}`} rows={2} value={String(form[f.key])} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
            ) : (
              <Input id={`s-${f.key}`} value={String(form[f.key])} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
            )}
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            <FieldError msg={errors[f.key]} />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="s-inst">Parcelas sem juros (máximo)</Label>
          <Input
            id="s-inst"
            type="number"
            min={1}
            max={12}
            value={form.maxInstallments}
            onChange={(e) => setForm((s) => ({ ...s, maxInstallments: Math.floor(Number(e.target.value) || 1) }))}
          />
          <FieldError msg={errors.maxInstallments} />
        </div>
        <div className="flex items-end justify-end sm:col-span-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
