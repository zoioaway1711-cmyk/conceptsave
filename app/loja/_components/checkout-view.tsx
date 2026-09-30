"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Info, Lock, Pencil, ShoppingCart } from "lucide-react";
import { ecommerce, toItem, track } from "../_lib/analytics";
import { lookupCep, maskCep, type CepStatus } from "../_lib/cep";
import { STORE, formatBRL, offeredPayments } from "../_lib/catalog";
import {
  EMPTY_CHECKOUT,
  CRYPTO_MIN_BRL,
  FIELD_LABELS,
  UFS,
  fieldError,
  hasPersonalData,
  maskCpf,
  maskPhone,
  parseCreatedOrder,
  parseDraft,
  sanitizeFieldErrors,
  suggestEmail,
  validateStep,
  type CheckoutErrors,
  type CheckoutForm,
} from "../_lib/checkout";
import { refreshStock } from "../_lib/stock";
import {
  clearCart,
  formatCep,
  rememberOrder,
  rememberOrderAccess,
  saveDeliveryLocation,
  useCart,
  useDeliveryLocation,
} from "../_lib/store";
import { HoneypotField, MIN_FILL_MS, useAntiBot } from "./anti-bot";
import { CartChanges, OrderSummary, useHydrated } from "./cart-view";
import { FulfillmentOption } from "./delivery";
import { HowItWorks } from "./how-it-works";
import { ProductImage } from "./ui";

/*
 * Checkout UI, ready for a payment/order backend that doesn't exist yet.
 *
 * Only what an order needs is asked: name + CPF (for the nota fiscal every
 * order ships with), e-mail (receipt + tracking), phone (carrier contact)
 * and the delivery address. Card data is never collected here — that
 * belongs to the payment provider's hosted form once one is integrated.
 *
 * Progress survives a reload: the draft lives in sessionStorage (this tab
 * only, gone when it closes) and deliberately never includes the CPF. It
 * also expires after DRAFT_TTL_MS idle (_lib/checkout.ts): a tab left open
 * on a shared computer — or restored with "reopen closed tab", which
 * restores sessionStorage too — must not keep someone's name, e-mail,
 * phone and address around.
 * The order is created by POST /api/loja/orders, which re-validates every
 * field, price and stock server-side. There's no payment gateway: the
 * order is registered as "Pedido recebido" and the team collects payment.
 */

const STEPS = ["Identificação", "Entrega", "Pagamento", "Revisão"] as const;
const DRAFT_KEY = "sc-loja-checkout-draft";

type Draft = { form: CheckoutForm; step: number };

function dropDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}

function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) ?? "null");
  } catch {
    raw = undefined; // corrupted: dropped below
  }
  const form = parseDraft(raw, Date.now());
  if (!form) {
    if (raw !== null) dropDraft();
    return null;
  }
  // Never resume past identification without the CPF re-entered.
  return { form, step: 0 };
}

function Field({
  id,
  error,
  hint,
  optional,
  className = "",
  children,
  ...input
}: {
  id: keyof CheckoutForm;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`lj-field ${className}`}>
      <label htmlFor={`co-${id}`} className="lj-label">
        {FIELD_LABELS[id]} {optional && <small>(opcional)</small>}
      </label>
      <input
        id={`co-${id}`}
        name={id}
        className="lj-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={!optional}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="lj-field-error inline-flex items-start gap-1.5">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      {hint && (
        <div id={`${id}-hint`} className="lj-field-hint">
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

export function CheckoutView() {
  const hydrated = useHydrated();
  const { lines, totals, changes } = useCart();
  const saved = useDeliveryLocation();
  const [draft] = useState(readDraft);
  const [step, setStep] = useState(draft?.step ?? 0);
  const [form, setForm] = useState<CheckoutForm>(draft?.form ?? EMPTY_CHECKOUT);
  // Until the first edit, empty address fields show the remembered CEP
  // lookup; the first edit copies them into the form for good, so clearing
  // a field afterwards really clears it.
  const [materialized, setMaterialized] = useState(() =>
    Boolean(draft && (Object.keys(draft.form) as (keyof CheckoutForm)[]).some((k) => k !== "payment" && k !== "installments" && draft.form[k])),
  );
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [summary, setSummary] = useState<(keyof CheckoutForm)[]>([]);
  const [cepStatus, setCepStatus] = useState<CepStatus>({ state: "idle" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRender = useRef(true);
  const began = useRef(false);
  // Latest CEP typed: a slower lookup for an older value must not overwrite it.
  const cepRequest = useRef("");
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  // A 201 we couldn't read: the order may exist, so no blind resubmit.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const { trapRef, antiBotFields } = useAntiBot(MIN_FILL_MS.order);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Keep the draft (minus CPF) so a reload or accidental back doesn't wipe
  // it — only once something was typed, stamped for the expiry.
  useEffect(() => {
    if (!hasPersonalData(form)) {
      dropDraft();
      return;
    }
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form: { ...form, cpf: "" }, step, savedAt: Date.now() }));
    } catch {
      // storage unavailable: progress just isn't kept across reloads
    }
  }, [form, step]);

  useEffect(() => {
    if (!hydrated || began.current || lines.length === 0) return;
    began.current = true;
    track({ name: "begin_checkout", params: ecommerce(lines.map((l) => toItem(l.product, { quantity: l.qty }))) });
  }, [hydrated, lines]);

  if (!hydrated) {
    return <div className="lj-skeleton h-96 rounded-[var(--lj-r-lg)]" aria-busy="true" aria-label="Carregando checkout" />;
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <CartChanges changes={changes} />
        <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-14 text-center">
          <span className="lj-icon-circle size-14">
            <ShoppingCart aria-hidden="true" />
          </span>
          <h2 className="lj-h3">Seu carrinho está vazio</h2>
          <p className="lj-small lj-muted">Adicione produtos antes de finalizar a compra.</p>
          <Link href="/loja/produtos" className="lj-btn lj-btn--primary mt-2">
            Explorar produtos
          </Link>
        </div>
      </div>
    );
  }

  // Address remembered from the CEP lookup elsewhere fills only empty fields.
  const withSaved = (f: CheckoutForm): CheckoutForm => ({
    ...f,
    cep: f.cep || (saved ? formatCep(saved.cep) : ""),
    street: f.street || saved?.street || "",
    district: f.district || saved?.district || "",
    city: f.city || saved?.city || "",
    uf: f.uf || saved?.uf || "",
  });
  const chosen = materialized ? form : withSaved(form);
  // A remembered choice that isn't offered any more (crypto gateway turned
  // off since the draft was saved) falls back to Pix instead of a dead end.
  // Crypto has a minimum order (network fees): below it the option shows but can't be picked.
  const cryptoBelowMin = totals.total < CRYPTO_MIN_BRL;
  const selectable = (id: string) => id !== "crypto" || !cryptoBelowMin;
  const effective =
    offeredPayments().some((p) => p.id === chosen.payment) && selectable(chosen.payment) ? chosen : { ...chosen, payment: "pix" as const };

  const items = () => lines.map((l) => toItem(l.product, { quantity: l.qty }));

  function update(key: keyof CheckoutForm, value: string) {
    setForm((f) => ({ ...(materialized ? f : withSaved(f)), [key]: value }));
    setMaterialized(true);
    if (errors[key]) {
      const next = { ...effective, [key]: value };
      setErrors((e) => ({ ...e, [key]: fieldError(key, next) }));
    }
  }

  function onBlurValidate(key: keyof CheckoutForm) {
    const e = fieldError(key, effective);
    // Only surface an error once the field has content or was already flagged —
    // tabbing through an empty form shouldn't paint it red.
    if (e && (effective[key] || errors[key])) setErrors((prev) => ({ ...prev, [key]: e }));
  }

  async function onCepChange(raw: string) {
    const masked = maskCep(raw);
    update("cep", masked);
    const d = masked.replace(/\D/g, "");
    cepRequest.current = d;
    if (d.length !== 8) {
      setCepStatus({ state: "idle" });
      return;
    }
    setCepStatus({ state: "loading" });
    const result = await lookupCep(d);
    if (cepRequest.current !== d) return; // the shopper already changed the CEP
    setCepStatus(result);
    if (result.state === "valid") {
      const loc = result.location;
      saveDeliveryLocation(loc);
      // Fill what the service knows, but never overwrite what was typed.
      setForm((f) => ({
        ...f,
        cep: masked,
        street: f.street || loc.street || "",
        district: f.district || loc.district || "",
        city: loc.city || f.city,
        uf: loc.uf || f.uf,
      }));
      setErrors((e) => ({ ...e, cep: undefined, city: undefined, uf: undefined }));
    } else if (result.state === "not_found") {
      setErrors((e) => ({ ...e, cep: "Não encontramos esse CEP. Confira os números." }));
    }
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    const found = validateStep(step, effective);
    if (step === 1 && cepStatus.state === "not_found") found.cep = "Não encontramos esse CEP. Confira os números.";
    const invalid = (Object.keys(found) as (keyof CheckoutForm)[]).filter((k) => found[k]);
    setErrors(found);
    setSummary(invalid);
    if (invalid.length) {
      // Summary first (announced), then the first field, so both keyboard and
      // screen-reader users land on what needs fixing.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`#co-${invalid[0]}`)?.focus());
      return;
    }
    setForm(effective);
    if (step === 1) track({ name: "add_shipping_info", params: { ...ecommerce(items()), shipping_tier: "Receber em casa" } });
    if (step === 2) track({ name: "add_payment_info", params: { ...ecommerce(items()), payment_type: effective.payment } });
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function placeOrder() {
    setSubmitting(true);
    setSubmitError(null);
    let res: Response;
    try {
      const { hp, elapsedMs } = await antiBotFields();
      res = await fetch("/api/loja/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: effective.name, email: effective.email, cpf: effective.cpf, phone: effective.phone },
          address: {
            cep: effective.cep,
            street: effective.street,
            number: effective.number,
            complement: effective.complement,
            district: effective.district,
            city: effective.city,
            uf: effective.uf,
          },
          payment: { method: effective.payment, installments: 1 },
          items: lines.map((l) => ({ slug: l.product.slug, qty: l.qty })),
          expectedTotal: totals.total,
          hp,
          elapsedMs,
        }),
      });
    } catch {
      setSubmitting(false);
      setSubmitError("Não conseguimos enviar o pedido. Verifique sua conexão e tente de novo — seus dados continuam aqui.");
      return;
    }
    type OrderError = { error?: unknown; detail?: { fields?: unknown; totals?: { total?: unknown }; skus?: unknown } };
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (res.status === 201) {
      const ok = parseCreatedOrder(data);
      if (!ok) {
        // The order probably exists but the answer is unusable: never crash
        // with the button stuck on "Registrando…", and don't invite a
        // blind retry that could duplicate it.
        setSubmitting(false);
        setUnconfirmed(true);
        setSubmitError(
          `Recebemos uma resposta inesperada e não conseguimos confirmar o pedido. Antes de tentar de novo, fale com o atendimento (${STORE.supportHours.toLowerCase()}) para conferir se ele foi registrado.`,
        );
        return;
      }
      track({ name: "purchase", params: { ...ecommerce(items()), transaction_id: ok.number } });
      rememberOrder({ id: ok.id, number: ok.number, token: ok.token, createdAt: new Date().toISOString(), total: ok.total });
      rememberOrderAccess(ok.id, ok.token);
      clearCart();
      dropDraft();
      // The access token stays out of the URL (history, screenshots, prints,
      // Referer): the order page finds it in "Meus pedidos" / this tab.
      router.push(`/loja/pedido/${ok.id}?novo=1`);
      return;
    }
    setSubmitting(false);
    const err = (data && typeof data === "object" ? data : {}) as OrderError;
    const code = typeof err.error === "string" ? err.error : undefined;
    if (code === "invalid_fields") {
      const fields = sanitizeFieldErrors(err.detail?.fields, effective);
      const invalid = Object.keys(fields) as (keyof CheckoutForm)[];
      if (!invalid.length) {
        setSubmitError("Alguns dados não foram aceitos. Revise as etapas anteriores e tente de novo.");
        return;
      }
      setErrors(fields);
      setSummary(invalid);
      setStep(invalid.some((k) => ["name", "email", "cpf", "phone"].includes(k)) ? 0 : invalid.includes("installments") ? 2 : 1);
      return;
    }
    if (code === "price_changed") {
      // The catalog in this tab is older than the server's: resubmitting
      // would fail again. Reloading fetches current prices; the draft
      // (minus CPF) is kept in sessionStorage.
      setSubmitError(
        `Os preços da loja foram atualizados enquanto você comprava${typeof err.detail?.totals?.total === "number" && Number.isFinite(err.detail.totals.total) ? ` (novo total: ${formatBRL(err.detail.totals.total)})` : ""}. Recarregue a página para ver os valores atuais — seus dados continuam preenchidos.`,
      );
      setNeedsReload(true);
      return;
    }
    if (code === "out_of_stock" || code === "not_purchasable") {
      await refreshStock();
      const skus = Array.isArray(err.detail?.skus) ? (err.detail.skus as unknown[]).slice(0, 30) : [];
      const names = skus
        .map((sku) => lines.find((l) => l.product.sku === sku)?.product.name)
        .filter(Boolean)
        .join(", ");
      setSubmitError(
        code === "out_of_stock"
          ? `Não temos em estoque a quantidade pedida de: ${names || "um dos itens"}. Reduza a quantidade ou remova o item no carrinho.`
          : `${names || "Um dos itens"} não está mais disponível para compra online. Remova do carrinho para continuar.`,
      );
      return;
    }
    if (res.status === 429) {
      setSubmitError("Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo — seus dados continuam aqui.");
      return;
    }
    setSubmitError("Não foi possível registrar o pedido agora. Tente de novo em instantes — seus dados continuam aqui.");
  }

  const emailSuggestion = suggestEmail(effective.email);
  const paymentLabel = STORE.payment.find((p) => p.id === effective.payment)?.label ?? "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-5">
        <ol className="lj-steps" aria-label="Etapas do checkout">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className="lj-step"
              data-state={i < step ? "done" : i === step ? "current" : "todo"}
              aria-current={i === step ? "step" : undefined}
            >
              <span>
                <span className="lj-sr-only">
                  Etapa {i + 1} de {STEPS.length}:{" "}
                </span>
                {label}
              </span>
            </li>
          ))}
        </ol>

        <CartChanges changes={changes} />

        {/* Mobile: collapsible order summary above the form. */}
        <details className="lj-card lg:hidden">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 text-sm font-semibold text-[color:var(--lj-ink)]">
            <span>
              Ver resumo ({lines.length} {lines.length === 1 ? "produto" : "produtos"})
            </span>
            <span className="lj-price text-base">{formatBRL(totals.total)}</span>
          </summary>
          <div className="px-2 pb-2">
            <OrderSummary totals={totals} title={null} />
          </div>
        </details>

        <form ref={formRef} noValidate onSubmit={next} className="lj-card lj-card--pad flex flex-col gap-5">
          <h2 ref={headingRef} tabIndex={-1} className="lj-h3 outline-none">
            {step + 1}. {STEPS[step]}
          </h2>
          <HoneypotField inputRef={trapRef} />

          {summary.length > 0 && (
            <div className="lj-alert lj-alert--error" role="alert">
              <AlertCircle aria-hidden="true" />
              <div>
                <p className="font-bold">
                  {summary.length === 1 ? "Falta corrigir 1 campo:" : `Faltam corrigir ${summary.length} campos:`}
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {summary.map((k) => (
                    <li key={k}>
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => formRef.current?.querySelector<HTMLElement>(`#co-${k}`)?.focus()}
                      >
                        {FIELD_LABELS[k]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="name"
                autoComplete="name"
                autoCapitalize="words"
                maxLength={120}
                value={effective.name}
                onChange={(e) => update("name", e.target.value)}
                onBlur={() => onBlurValidate("name")}
                error={errors.name}
                className="sm:col-span-2"
              />
              <Field
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={160}
                value={effective.email}
                onChange={(e) => update("email", e.target.value.trim())}
                onBlur={() => onBlurValidate("email")}
                error={errors.email}
                hint={
                  emailSuggestion ? (
                    <span>
                      Você quis dizer{" "}
                      <button type="button" className="lj-link" onClick={() => update("email", emailSuggestion)}>
                        {emailSuggestion}
                      </button>
                      ?
                    </span>
                  ) : (
                    "Para o comprovante e o código de rastreio."
                  )
                }
                className="sm:col-span-2"
              />
              <Field
                id="cpf"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={effective.cpf}
                onChange={(e) => update("cpf", maskCpf(e.target.value))}
                onBlur={() => onBlurValidate("cpf")}
                error={errors.cpf}
                hint={
                  <>
                    Necessário para emitir a nota fiscal; guardado criptografado.{" "}
                    <Link href="/loja/privacidade" className="lj-link" target="_blank" rel="noopener noreferrer">
                      Como usamos seus dados<span className="lj-sr-only"> (abre em nova aba)</span>
                    </Link>
                  </>
                }
              />
              <Field
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(11) 90000-0000"
                value={effective.phone}
                onChange={(e) => update("phone", maskPhone(e.target.value))}
                onBlur={() => onBlurValidate("phone")}
                error={errors.phone}
                hint="Usado só para contato sobre a entrega."
              />
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="lj-label mb-1">Como você quer receber</legend>
                <FulfillmentOption shipping={totals.shipping} />
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-6">
                <Field
                  id="cep"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  value={effective.cep}
                  onChange={(e) => onCepChange(e.target.value)}
                  onBlur={() => onBlurValidate("cep")}
                  error={errors.cep}
                  className="sm:col-span-2"
                  hint={
                    cepStatus.state === "loading" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="lj-spinner size-3" aria-hidden="true" /> Buscando endereço…
                      </span>
                    ) : cepStatus.state === "valid" ? (
                      <span className="inline-flex items-center gap-1 text-[color:var(--lj-success)]">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" /> Endereço encontrado
                      </span>
                    ) : cepStatus.state === "error" ? (
                      "Não foi possível buscar o endereço agora. Preencha os campos abaixo."
                    ) : undefined
                  }
                />
                <Field
                  id="street"
                  autoComplete="address-line1"
                  maxLength={160}
                  value={effective.street}
                  onChange={(e) => update("street", e.target.value)}
                  onBlur={() => onBlurValidate("street")}
                  error={errors.street}
                  className="sm:col-span-4"
                />
                <Field
                  id="number"
                  autoComplete="off"
                  inputMode="text"
                  placeholder="Ex.: 120 ou S/N"
                  maxLength={10}
                  value={effective.number}
                  onChange={(e) => update("number", e.target.value)}
                  onBlur={() => onBlurValidate("number")}
                  error={errors.number}
                  className="sm:col-span-2"
                />
                <Field
                  id="complement"
                  optional
                  autoComplete="address-line2"
                  maxLength={80}
                  placeholder="Apto, bloco, referência"
                  value={effective.complement}
                  onChange={(e) => update("complement", e.target.value)}
                  className="sm:col-span-4"
                />
                <Field
                  id="district"
                  autoComplete="address-level3"
                  maxLength={80}
                  value={effective.district}
                  onChange={(e) => update("district", e.target.value)}
                  onBlur={() => onBlurValidate("district")}
                  error={errors.district}
                  className="sm:col-span-3"
                />
                <Field
                  id="city"
                  autoComplete="address-level2"
                  maxLength={80}
                  value={effective.city}
                  onChange={(e) => update("city", e.target.value)}
                  onBlur={() => onBlurValidate("city")}
                  error={errors.city}
                  className="sm:col-span-2"
                />
                <div className="lj-field sm:col-span-1">
                  <label htmlFor="co-uf" className="lj-label">
                    UF
                  </label>
                  <select
                    id="co-uf"
                    className="lj-select"
                    autoComplete="address-level1"
                    value={effective.uf}
                    onChange={(e) => update("uf", e.target.value)}
                    aria-invalid={errors.uf ? true : undefined}
                    aria-describedby={errors.uf ? "uf-error" : undefined}
                    required
                  >
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                  {errors.uf && (
                    <p id="uf-error" className="lj-field-error">
                      {errors.uf}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="lj-label">Como você prefere pagar?</legend>
              <p className="lj-alert lj-alert--info">
                <Info aria-hidden="true" />
                <span>
                  {effective.payment === "pix" && STORE.gateways.pix
                    ? "Pix direto no site: ao finalizar, você recebe o QR Code e o código copia e cola, e a confirmação do pagamento é automática."
                    : effective.payment === "crypto"
                      ? "Cripto direto no site: ao finalizar, você recebe o valor exato em USDT e o endereço na rede Tron (TRC20). A cotação fica travada por 10 minutos e a confirmação é automática."
                      : STORE.paymentNote}
                </span>
              </p>
              {offeredPayments().map((p) => (
                <label key={p.id} className={`lj-option${selectable(p.id) ? "" : " cursor-not-allowed opacity-60"}`}>
                  <input
                    type="radio"
                    name="payment"
                    value={p.id}
                    checked={effective.payment === p.id}
                    disabled={!selectable(p.id)}
                    onChange={() => update("payment", p.id)}
                  />
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-bold text-[color:var(--lj-ink)]">{p.label}</span>
                    <span className="lj-small lj-muted">
                      {selectable(p.id) ? p.detail : `Disponível para pedidos a partir de ${formatBRL(CRYPTO_MIN_BRL)}.`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <ReviewBlock title="Identificação" onEdit={() => setStep(0)}>
                {effective.name} · {effective.email}
                <br />
                {effective.phone}
              </ReviewBlock>
              <ReviewBlock title="Entrega" onEdit={() => setStep(1)}>
                Receber em casa · prazo médio de {STORE.delivery.window}
                <br />
                {effective.street}, {effective.number}
                {effective.complement ? ` — ${effective.complement}` : ""}
                <br />
                {effective.district} · {effective.city}/{effective.uf} · CEP {effective.cep}
              </ReviewBlock>
              <ReviewBlock title="Pagamento" onEdit={() => setStep(2)}>
                {paymentLabel}
              </ReviewBlock>
              <ul className="flex flex-col gap-3">
                {lines.map(({ product, qty }) => (
                  <li key={product.slug} className="flex items-center gap-3">
                    <span className="lj-media size-12 shrink-0 rounded-[var(--lj-r-sm)] p-1">
                      <ProductImage image={product.image} sizes="48px" decorative />
                    </span>
                    <span className="lj-small min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[color:var(--lj-ink)]">{product.name}</span>
                      <span className="lj-muted">
                        {qty} × {formatBRL(product.price)}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-[color:var(--lj-ink)]">{formatBRL(product.price * qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="lj-panel p-4">
                <p className="lj-label mb-3">O que acontece depois de confirmar</p>
                <HowItWorks compact method={effective.payment} />
              </div>
              {submitError && (
                <p className="lj-alert lj-alert--error" role="alert">
                  <AlertCircle aria-hidden="true" />
                  <span>
                    {submitError}{" "}
                    {needsReload && (
                      <button type="button" className="font-bold underline" onClick={() => window.location.reload()}>
                        Recarregar página
                      </button>
                    )}
                    {!needsReload && submitError.includes("carrinho") && (
                      <Link href="/loja/carrinho" className="font-bold underline">
                        Ir para o carrinho
                      </Link>
                    )}
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-[color:var(--lj-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            {step === 0 ? (
              <Link href="/loja/carrinho" className="lj-btn lj-btn--ghost">
                <ArrowLeft aria-hidden="true" /> Voltar ao carrinho
              </Link>
            ) : (
              <button
                type="button"
                className="lj-btn lj-btn--ghost"
                onClick={() => {
                  setSummary([]);
                  setStep((s) => s - 1);
                }}
              >
                <ArrowLeft aria-hidden="true" /> Voltar
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="submit" className="lj-btn lj-btn--primary lj-btn--lg">
                Continuar para {STEPS[step + 1].toLowerCase()} <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="lj-btn lj-btn--primary lj-btn--lg"
                disabled={submitting || needsReload || unconfirmed || changes.length > 0}
                aria-busy={submitting}
                onClick={placeOrder}
              >
                {submitting ? <span className="lj-spinner" aria-hidden="true" /> : <Lock aria-hidden="true" />}
                {submitting ? "Registrando pedido…" : "Confirmar pedido"}
              </button>
            )}
          </div>
          {step === STEPS.length - 1 && changes.length > 0 && (
            <p className="lj-small lj-muted">Confira as mudanças no carrinho acima (botão “Entendi”) antes de confirmar.</p>
          )}
        </form>
      </div>

      <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <OrderSummary totals={totals}>
          <p className="lj-tiny lj-muted inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" /> Seus dados são usados apenas para este pedido.
          </p>
        </OrderSummary>
      </div>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="lj-panel flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="lj-label mb-1">{title}</p>
        <p className="lj-small break-words text-[color:var(--lj-text)]">{children}</p>
      </div>
      <button type="button" className="lj-btn lj-btn--ghost lj-btn--sm shrink-0" onClick={onEdit} aria-label={`Editar ${title.toLowerCase()}`}>
        <Pencil aria-hidden="true" /> Editar
      </button>
    </div>
  );
}
