"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, ImageUp, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, formatBRL, imageSrc, type CatalogSnapshot, type CategorySlug, type Product, type ProductImage, type StoreSettings } from "@/app/loja/_lib/catalog";
import { apiFetch } from "../_lib/api";
import { prepareImage } from "./image-upload";

/*
 * Admin editors for the storefront catalog and settings (D1). Changes go
 * live in the store within ~1 minute (per-isolate cache + page cache), are
 * validated server-side and audit-logged. Products can be created,
 * edited (texts, prices, category, photo), reordered and removed; vials
 * and vial kits stay locked out of online sale by the server.
 */

type FieldErrors = Record<string, string>;

const REGULATED_CATEGORIES: ReadonlySet<string> = new Set(["frascos", "kits"]);

async function sendWithErrors(
  method: "PUT" | "POST" | "DELETE",
  url: string,
  body?: unknown,
): Promise<{ ok: true; changed: string[] } | { ok: false; fields: FieldErrors; error: string }> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, fields: {}, error: "network_error" };
  const data = (await res.json().catch(() => ({}))) as { changed?: string[]; fields?: FieldErrors; error?: string };
  if (res.ok) return { ok: true, changed: data.changed ?? [] };
  return { ok: false, fields: data.fields ?? {}, error: data.error ?? `http_${res.status}` };
}

const putWithErrors = (url: string, body: unknown) => sendWithErrors("PUT", url, body);

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

const FIELD_LABELS: Record<string, string> = {
  name: "nome",
  presentation: "apresentação",
  category: "categoria",
  summary: "resumo",
  description: "descrição",
  price: "preço",
  oldPrice: "preço anterior",
  badge: "selo",
  specs: "especificações",
  freeShipping: "frete grátis",
  available: "disponível",
  purchasable: "venda online",
  coldChain: "refrigerado",
  image: "foto",
};

/** "minha-coisa" from "Minha Coisa 10mL" — a suggestion for new products. */
function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function PhotoField({ image, onChange, error }: { image: ProductImage; onChange: (img: ProductImage) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      const r = await apiFetch<{ base: string; width: number; height: number }>("/api/admin/loja/images", {
        method: "POST",
        body: JSON.stringify({ mime: prepared.mime, large: prepared.large, small: prepared.small }),
      });
      if (!r.ok) {
        URL.revokeObjectURL(prepared.previewUrl);
        toast.error(r.error === "payload_too_large" ? "Foto grande demais mesmo comprimida" : `Erro ao enviar a foto: ${r.error}`);
        return;
      }
      setPreview(prepared.previewUrl);
      onChange({ ...image, base: r.data.base, width: r.data.width, height: r.data.height });
      toast.success("Foto enviada — clique em Salvar para publicar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler a foto");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Foto do produto</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of a store asset */}
        <img src={preview ?? imageSrc(image, 480)} alt="" className="h-36 w-28 shrink-0 rounded-md border bg-muted object-contain" />
        <div className="flex-1 space-y-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <ImageUp className="size-3.5" /> {busy ? "Enviando…" : "Trocar foto"}
          </Button>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. A foto é reduzida e comprimida automaticamente (ideal: fundo limpo, retrato 3:4).</p>
          <Label htmlFor="p-alt" className="text-xs">
            Descrição da foto (acessibilidade)
          </Label>
          <Input id="p-alt" value={image.alt} onChange={(e) => onChange({ ...image, alt: e.target.value })} />
          <FieldError msg={error} />
        </div>
      </div>
    </div>
  );
}

function ProductEditor({ product, onSaved, onClose }: { product: Product | null; onSaved: () => void; onClose: () => void }) {
  const creating = product === null;
  const blankCategory = CATEGORIES.find((c) => c.slug === "acessorios")!;
  const [form, setForm] = useState({
    slug: product?.slug ?? "",
    sku: product?.sku ?? "",
    brand: product?.brand ?? "Save Concept",
    name: product?.name ?? "",
    presentation: product?.presentation ?? "",
    category: (product?.category ?? "acessorios") as CategorySlug,
    summary: product?.summary ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    oldPrice: product?.oldPrice ? String(product.oldPrice) : "",
    badge: product?.badge ?? "",
    specs: product?.specs.join("\n") ?? "",
    freeShipping: product?.freeShipping ?? true,
    available: product?.available ?? true,
    purchasable: product?.purchasable ?? false,
    coldChain: product?.coldChain ?? false,
  });
  const [image, setImage] = useState<ProductImage>(product?.image ?? { ...blankCategory.image, alt: "Foto do produto" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      // New product: suggest the address/SKU from the name until edited by hand.
      if (creating && k === "name" && !slugTouched) next.slug = next.sku = slugify(String(v));
      return next;
    });
  // Accepts "1290", "1290.5", "1.290,00" and "1290,00".
  const num = (v: string) => {
    const t = v.trim().replace(/\s|R\$/g, "");
    return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  };

  async function save() {
    setSaving(true);
    const body = {
      name: form.name,
      presentation: form.presentation,
      category: form.category,
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
      image,
      ...(creating ? { slug: form.slug, sku: form.sku, brand: form.brand } : {}),
    };
    const r = creating
      ? await sendWithErrors("POST", "/api/admin/loja/catalog/products", body)
      : await putWithErrors(`/api/admin/loja/catalog/products/${product.slug}`, body);
    setSaving(false);
    if (r.ok) {
      toast.success(creating ? "Produto criado" : r.changed.length ? `Salvo: ${r.changed.map((c) => FIELD_LABELS[c] ?? c).join(", ")}` : "Nada mudou");
      onSaved();
      onClose();
    } else {
      setErrors(Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k.startsWith("image") ? "image" : k, v])));
      toast.error(r.error === "invalid_fields" ? "Confira os campos destacados" : `Erro: ${r.error}`);
    }
  }

  async function remove() {
    if (!product) return;
    setSaving(true);
    const r = await sendWithErrors("DELETE", `/api/admin/loja/catalog/products/${product.slug}`);
    setSaving(false);
    if (r.ok) {
      toast.success(`${product.name} excluído da loja`);
      onSaved();
      onClose();
    } else toast.error(`Erro: ${r.error}`);
  }

  const text = (k: "name" | "presentation" | "badge" | "brand", label: string) => (
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
  // the server refuses online sale for these no matter what is sent, and a
  // vial can't be moved out of its category.
  const regulated = REGULATED_CATEGORIES.has(form.category);
  const lockedCategory = !creating && REGULATED_CATEGORIES.has(product.category);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{creating ? "Novo produto" : `Editar ${product.name}`}</DialogTitle>
        <DialogDescription>
          {creating ? "Preencha os dados e envie uma foto. O produto aparece na loja em até ~1 minuto." : `SKU ${product.sku}. As alterações aparecem na loja em até ~1 minuto.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", "Nome")}
        {text("presentation", "Apresentação")}
        {creating && (
          <>
            <div className="space-y-1">
              <Label htmlFor="p-slug">Endereço na loja</Label>
              <Input
                id="p-slug"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">/loja/produto/{form.slug || "…"} — não muda depois.</p>
              <FieldError msg={errors.slug} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-sku">SKU (código interno)</Label>
              <Input
                id="p-sku"
                value={form.sku}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("sku", e.target.value);
                }}
              />
              <FieldError msg={errors.sku} />
            </div>
            {text("brand", "Marca")}
          </>
        )}
        <div className="space-y-1">
          <Label htmlFor="p-category">Categoria</Label>
          <NativeSelect
            id="p-category"
            className="w-full"
            value={form.category}
            disabled={lockedCategory}
            onChange={(e) => {
              const next = e.target.value as CategorySlug;
              setForm((f) => ({ ...f, category: next, purchasable: REGULATED_CATEGORIES.has(next) ? false : f.purchasable }));
            }}
          >
            {CATEGORIES.filter((c) => !lockedCategory || REGULATED_CATEGORIES.has(c.slug)).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          {lockedCategory && <p className="text-xs text-muted-foreground">Frascos e kits não saem dessas categorias (restrição regulatória).</p>}
          <FieldError msg={errors.category} />
        </div>
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
        <PhotoField image={image} onChange={setImage} error={errors.image} />
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
      <DialogFooter className="gap-2 sm:justify-between">
        {!creating ? (
          confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-destructive">Excluir da loja? Pedidos antigos não mudam.</span>
              <Button variant="destructive" size="sm" onClick={remove} disabled={saving}>
                Sim, excluir
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Não
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3.5" /> Excluir produto
            </Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : creating ? "Criar produto" : "Salvar"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

export function CatalogTab({ catalog, onChanged }: { catalog: CatalogSnapshot; onChanged: () => void }) {
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  // Optimistic order while a move is saved; dropped as soon as the reloaded catalog arrives.
  const [pending, setPending] = useState<{ version: string; slugs: string[] } | null>(null);
  const [moving, setMoving] = useState(false);
  const order = pending?.version === catalog.version ? pending.slugs : catalog.products.map((p) => p.slug);
  const bySlug = new Map(catalog.products.map((p) => [p.slug, p]));
  const products = order.map((s) => bySlug.get(s)).filter((p): p is Product => Boolean(p));

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setPending({ version: catalog.version, slugs: next });
    setMoving(true);
    const r = await putWithErrors("/api/admin/loja/catalog/order", { slugs: next });
    setMoving(false);
    if (!r.ok) {
      toast.error(r.error === "stale_list" ? "A lista mudou — recarregando" : `Erro: ${r.error}`);
      setPending(null);
    }
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Catálogo</CardTitle>
          <CardDescription>
            Crie, edite, reordene e exclua produtos: preço, textos, categoria, foto e venda online. Alterar preço não muda pedidos já registrados —
            eles guardam o preço da época.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> Novo produto
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Ordem</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p, i) => (
              <TableRow key={p.slug}>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Subir ${p.name}`} disabled={moving || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Descer ${p.name}`} disabled={moving || i === products.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a store asset */}
                    <img src={imageSrc(p.image, 480)} alt="" loading="lazy" className="size-10 shrink-0 rounded border bg-muted object-contain" />
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.presentation} · {CATEGORIES.find((c) => c.slug === p.category)?.shortName}
                      </p>
                    </div>
                  </div>
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
        {editing && (
          <ProductEditor key={editing === "new" ? "new" : editing.slug} product={editing === "new" ? null : editing} onSaved={onChanged} onClose={() => setEditing(null)} />
        )}
      </Dialog>
    </Card>
  );
}

const SETTING_FIELDS: { key: keyof StoreSettings; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "whatsappUrl", label: "WhatsApp (link)", hint: "Ex.: https://wa.me/5511999999999 — vazio: o botão de atendimento leva à Central de ajuda." },
  { key: "instagramUrl", label: "Instagram (link)", hint: "Ex.: https://instagram.com/saveconcept — vazio esconde." },
  { key: "supportEmail", label: "E-mail de atendimento", hint: "Aparece na Central de ajuda." },
  { key: "privacyEmail", label: "E-mail de privacidade (LGPD)", hint: "Aparece na página de Privacidade." },
  { key: "supportHours", label: "Horário de atendimento" },
  { key: "deliveryWindow", label: "Prazo médio de entrega", hint: "Ex.: 3 a 7 dias úteis" },
  { key: "deliveryDetail", label: "Detalhe da entrega", multiline: true },
  { key: "paymentNote", label: "Aviso de pagamento", multiline: true, hint: "Só aparece na loja quando o Pix automático estiver fora do ar (sem as chaves). Com o Pix ativo, a loja mostra \"Pagamento por Pix ou cripto direto no site\"." },
  { key: "returns", label: "Política de trocas e devoluções", multiline: true },
];

const HOME_FIELDS: { key: keyof StoreSettings; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "heroTitle", label: "Título principal (topo da página)" },
  { key: "heroLead", label: "Texto abaixo do título", multiline: true },
  { key: "catalogTitle", label: "Título da seção de produtos" },
  { key: "catalogDescription", label: "Descrição da seção de produtos", multiline: true },
  { key: "brandTitle", label: "Título da seção \"Nossa marca\"" },
  { key: "brandText", label: "Texto da seção \"Nossa marca\"", multiline: true },
  { key: "brandQuote", label: "Citação da equipe", multiline: true, hint: "Sem aspas — a loja coloca." },
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

  const field = (f: (typeof SETTING_FIELDS)[number], wide: boolean) => (
    <div key={f.key} className={`space-y-1 ${f.multiline || wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={`s-${f.key}`}>{f.label}</Label>
      {f.multiline ? (
        <Textarea id={`s-${f.key}`} rows={2} value={String(form[f.key])} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
      ) : (
        <Input id={`s-${f.key}`} value={String(form[f.key])} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
      )}
      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
      <FieldError msg={errors[f.key]} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurações da loja</CardTitle>
        <CardDescription>Contatos, prazos e políticas exibidos em toda a loja, e os textos da página inicial.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {SETTING_FIELDS.map((f) => field(f, false))}
        <div className="space-y-1">
          <Label htmlFor="s-inst">Parcelas sem juros (máximo)</Label>
          <p className="text-xs text-muted-foreground">Sem efeito: o cartão está desativado (a loja aceita só Pix e cripto).</p>
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
        <h3 className="border-t pt-4 text-sm font-semibold sm:col-span-2">Página inicial da loja</h3>
        {HOME_FIELDS.map((f) => field(f, true))}
        <div className="flex items-end justify-end sm:col-span-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type AdminReview = {
  id: string;
  orderNumber: string | null;
  productSlug: string;
  rating: number;
  text: string;
  author: string;
  city: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  moderatedBy: string | null;
};

const REVIEW_FILTERS = [
  { value: "pending", label: "Aguardando" },
  { value: "approved", label: "Publicadas" },
  { value: "rejected", label: "Recusadas" },
] as const;

/*
 * Reviews come only from customers whose order was delivered (they write
 * them on the order page). Nothing is public until approved here; the
 * product rating and the home "O que dizem os clientes" section are
 * recalculated from the approved ones.
 */
export function ReviewsTab({ catalog, onChanged }: { catalog: CatalogSnapshot; onChanged: () => void }) {
  const [filter, setFilter] = useState<AdminReview["status"]>("pending");
  const [loaded, setLoaded] = useState<{ filter: string; list: AdminReview[] } | null>(null);
  const reviews = loaded?.filter === filter ? loaded.list : null;
  const setReviews = (update: (list: AdminReview[] | null) => AdminReview[] | null) =>
    setLoaded((cur) => (cur ? { ...cur, list: update(cur.list) ?? [] } : cur));
  const [busy, setBusy] = useState<string | null>(null);
  const names = new Map(catalog.products.map((p) => [p.slug, p.name]));

  useEffect(() => {
    let alive = true;
    void apiFetch<{ reviews: AdminReview[] }>(`/api/admin/loja/reviews?status=${filter}`).then((r) => {
      if (!alive) return;
      setLoaded({ filter, list: r.ok ? r.data.reviews : [] });
      if (!r.ok) toast.error(`Erro ao carregar avaliações: ${r.error}`);
    });
    return () => {
      alive = false;
    };
  }, [filter]);

  async function moderate(review: AdminReview, status: "approved" | "rejected") {
    setBusy(review.id);
    const r = await putWithErrors(`/api/admin/loja/reviews/${review.id}`, { status });
    setBusy(null);
    if (!r.ok) {
      toast.error(`Erro: ${r.error}`);
      return;
    }
    toast.success(status === "approved" ? "Avaliação publicada" : "Avaliação recusada");
    setReviews((list) => list?.filter((x) => x.id !== review.id) ?? null);
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Avaliações de clientes</CardTitle>
        <CardDescription>
          Só clientes com pedido <strong>entregue</strong> conseguem avaliar, pela página do pedido. Nada aparece na loja antes de você publicar. A nota
          de cada produto é calculada só com as avaliações publicadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {REVIEW_FILTERS.map((f) => (
            <Button key={f.value} size="sm" variant={filter === f.value ? "default" : "outline"} onClick={() => setFilter(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>
        {reviews === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "pending" ? "Nenhuma avaliação aguardando revisão." : "Nenhuma avaliação aqui ainda."}
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-0.5" aria-label={`Nota ${r.rating} de 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`size-3.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} aria-hidden="true" />
                    ))}
                  </span>
                  <span className="font-medium">{names.get(r.productSlug) ?? r.productSlug}</span>
                  <span className="text-muted-foreground">
                    · {r.author}, {r.city} · pedido {r.orderNumber ?? "—"} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm">{r.text}</p>
                <div className="flex gap-2">
                  {r.status !== "approved" && (
                    <Button size="sm" onClick={() => moderate(r, "approved")} disabled={busy === r.id}>
                      <Check className="size-3.5" /> Publicar
                    </Button>
                  )}
                  {r.status !== "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => moderate(r, "rejected")} disabled={busy === r.id}>
                      <X className="size-3.5" /> {r.status === "approved" ? "Despublicar" : "Recusar"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
