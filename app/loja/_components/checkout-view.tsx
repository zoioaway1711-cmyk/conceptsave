"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Info, Lock, Pencil, ShoppingCart } from "lucide-react";
import { STORE, formatBRL } from "../_lib/catalog";
import { formatCep, useCep } from "../_lib/store";
import { OrderSummary, useCartSummary, useHydrated } from "./cart-view";
import { maskCep } from "./delivery";
import { ProductImage } from "./ui";

/*
 * Checkout UI, ready for a payment/order backend that doesn't exist yet.
 *
 * Only what an order legally/operationally needs is asked: name + CPF (for
 * the nota fiscal every order ships with), e-mail (receipt + tracking),
 * phone (carrier contact) and the delivery address. Card data is never
 * collected here — that belongs to the payment provider's hosted form once
 * one is integrated. Nothing typed here is stored or sent anywhere: the
 * final button stays disabled and says so, instead of pretending an order
 * was placed.
 */

const STEPS = ["Identificação", "Entrega", "Pagamento", "Revisão"] as const;

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

type Form = {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  payment: "pix" | "cartao" | "boleto";
  installments: string;
};

type Errors = Partial<Record<keyof Form, string>>;

const digits = (v: string) => v.replace(/\D/g, "");

function maskCpf(v: string) {
  const d = digits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function maskPhone(v: string) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validCpf(value: string) {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return (r === 10 ? 0 : r) === Number(d[len]);
  };
  return check(9) && check(10);
}

function validate(step: number, f: Form): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Informe um e-mail válido.";
    if (!validCpf(f.cpf)) e.cpf = "CPF inválido. Confira os números.";
    if (digits(f.phone).length < 10) e.phone = "Informe o celular com DDD.";
  }
  if (step === 1) {
    if (digits(f.cep).length !== 8) e.cep = "Digite os 8 números do CEP.";
    if (!f.street.trim()) e.street = "Informe a rua ou avenida.";
    if (!f.number.trim()) e.number = "Informe o número (ou “S/N”).";
    if (!f.district.trim()) e.district = "Informe o bairro.";
    if (!f.city.trim()) e.city = "Informe a cidade.";
    if (!f.uf) e.uf = "Selecione o estado.";
  }
  return e;
}

function Field({
  id,
  label,
  error,
  hint,
  optional,
  className = "",
  ...input
}: {
  id: keyof Form;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`lj-field ${className}`}>
      <label htmlFor={`co-${id}`} className="lj-label">
        {label} {optional && <small>(opcional)</small>}
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
      {hint && !error && (
        <p id={`${id}-hint`} className="lj-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="lj-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckoutView() {
  const hydrated = useHydrated();
  const { lines, subtotal } = useCartSummary();
  const savedCep = useCep();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [form, setForm] = useState<Form>({
    name: "",
    email: "",
    cpf: "",
    phone: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    uf: "",
    payment: "pix",
    installments: "1",
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  if (!hydrated) {
    return <div className="lj-skeleton h-96 rounded-[var(--lj-r-lg)]" aria-busy="true" aria-label="Carregando checkout" />;
  }

  if (lines.length === 0) {
    return (
      <div className="lj-card lj-card--pad flex flex-col items-center gap-3 py-14 text-center">
        <span className="lj-icon-circle size-14">
          <ShoppingCart aria-hidden="true" />
        </span>
        <h2 className="lj-h3">Seu carrinho está vazio</h2>
        <p className="lj-small lj-muted">Adicione produtos antes de finalizar a compra.</p>
        <Link href="/loja/produtos" className="lj-btn lj-btn--primary mt-2">
          Ver produtos
        </Link>
      </div>
    );
  }

  // Prefill the CEP remembered from the header/PDP the first time it's seen.
  const cepValue = form.cep || (savedCep ? formatCep(savedCep) : "");

  const set =
    (key: keyof Form, mask?: (v: string) => string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = mask ? mask(e.target.value) : e.target.value;
      setForm((f) => ({ ...f, [key]: value }));
      if (errors[key]) setErrors((err) => ({ ...err, [key]: undefined }));
    };

  function next(e: React.FormEvent) {
    e.preventDefault();
    const current = { ...form, cep: cepValue };
    const found = validate(step, current);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#co-${firstInvalid}`)?.focus();
      return;
    }
    setForm(current);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  const paymentLabel = STORE.payment.find((p) => p.id === form.payment)?.label ?? "";

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
                <span className="lj-sr-only">Etapa {i + 1} de {STEPS.length}: </span>
                {label}
              </span>
            </li>
          ))}
        </ol>

        {/* Mobile: collapsible order summary above the form. */}
        <details className="lj-card lg:hidden">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 text-sm font-semibold text-[color:var(--lj-ink)]">
            <span>Ver resumo ({lines.length} {lines.length === 1 ? "produto" : "produtos"})</span>
            <span className="lj-price text-base">{formatBRL(subtotal)}</span>
          </summary>
          <div className="px-2 pb-2">
            <OrderSummary compact />
          </div>
        </details>

        <form ref={formRef} noValidate onSubmit={next} className="lj-card lj-card--pad flex flex-col gap-5">
          <h2 ref={headingRef} tabIndex={-1} className="lj-h3 outline-none">
            {step + 1}. {STEPS[step]}
          </h2>

          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Nome completo" autoComplete="name" value={form.name} onChange={set("name")} error={errors.name} className="sm:col-span-2" />
              <Field id="email" label="E-mail" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} error={errors.email} hint="Para o comprovante e o código de rastreio." className="sm:col-span-2" />
              <Field id="cpf" label="CPF" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={form.cpf} onChange={set("cpf", maskCpf)} error={errors.cpf} hint="Necessário para emitir a nota fiscal." />
              <Field id="phone" label="Celular" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 90000-0000" value={form.phone} onChange={set("phone", maskPhone)} error={errors.phone} hint="Usado só para contato sobre a entrega." />
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-6">
              <Field id="cep" label="CEP" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={cepValue} onChange={set("cep", maskCep)} error={errors.cep} className="sm:col-span-2" />
              <Field id="street" label="Rua / avenida" autoComplete="address-line1" value={form.street} onChange={set("street")} error={errors.street} className="sm:col-span-4" />
              <Field id="number" label="Número" inputMode="numeric" autoComplete="address-line2" value={form.number} onChange={set("number")} error={errors.number} className="sm:col-span-2" />
              <Field id="complement" label="Complemento" optional autoComplete="address-line3" value={form.complement} onChange={set("complement")} className="sm:col-span-4" />
              <Field id="district" label="Bairro" value={form.district} onChange={set("district")} error={errors.district} className="sm:col-span-3" />
              <Field id="city" label="Cidade" autoComplete="address-level2" value={form.city} onChange={set("city")} error={errors.city} className="sm:col-span-2" />
              <div className="lj-field sm:col-span-1">
                <label htmlFor="co-uf" className="lj-label">
                  UF
                </label>
                <select
                  id="co-uf"
                  className="lj-select"
                  autoComplete="address-level1"
                  value={form.uf}
                  onChange={set("uf")}
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
              <p className="lj-alert lj-alert--info sm:col-span-6">
                <Info aria-hidden="true" />
                Prazo médio de {STORE.delivery.window}. Itens refrigerados seguem em caixa térmica.
              </p>
            </div>
          )}

          {step === 2 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="lj-sr-only">Forma de pagamento</legend>
              {STORE.payment.map((p) => (
                <label key={p.id} className="lj-option">
                  <input
                    type="radio"
                    name="payment"
                    value={p.id}
                    checked={form.payment === p.id}
                    onChange={() => setForm((f) => ({ ...f, payment: p.id }))}
                  />
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-bold text-[color:var(--lj-ink)]">{p.label}</span>
                    <span className="lj-small lj-muted">{p.detail}</span>
                    {p.id === "cartao" && form.payment === "cartao" && (
                      <span className="mt-2 flex flex-col gap-1.5">
                        <span className="lj-label">Parcelas</span>
                        <select
                          aria-label="Número de parcelas"
                          className="lj-select"
                          value={form.installments}
                          onChange={set("installments")}
                        >
                          {Array.from({ length: STORE.maxInstallments }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}x de {formatBRL(subtotal / n)} sem juros
                            </option>
                          ))}
                        </select>
                        <span className="lj-tiny lj-muted">
                          Os dados do cartão são pedidos somente no ambiente do provedor de pagamento.
                        </span>
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <ReviewBlock title="Identificação" onEdit={() => setStep(0)}>
                {form.name} · {form.email}
                <br />
                CPF {form.cpf} · {form.phone}
              </ReviewBlock>
              <ReviewBlock title="Entrega" onEdit={() => setStep(1)}>
                {form.street}, {form.number}
                {form.complement ? ` — ${form.complement}` : ""}
                <br />
                {form.district} · {form.city}/{form.uf} · CEP {form.cep}
              </ReviewBlock>
              <ReviewBlock title="Pagamento" onEdit={() => setStep(2)}>
                {paymentLabel}
                {form.payment === "cartao" &&
                  ` · ${form.installments}x de ${formatBRL(subtotal / Number(form.installments))} sem juros`}
              </ReviewBlock>
              <ul className="flex flex-col gap-3">
                {lines.map(({ product, qty }) => (
                  <li key={product.slug} className="flex items-center gap-3">
                    <span className="lj-media size-12 shrink-0 rounded-[var(--lj-r-sm)] p-1">
                      <ProductImage image={product.image} sizes="48px" />
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
              <p className="lj-alert lj-alert--warning" role="note">
                <Info aria-hidden="true" />
                <span>
                  O pagamento online ainda está em configuração, então não é possível concluir o pedido por aqui. Nenhum valor
                  foi cobrado e nenhum dado deste formulário foi enviado ou salvo.
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-[color:var(--lj-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            {step === 0 ? (
              <Link href="/loja/carrinho" className="lj-btn lj-btn--ghost">
                <ArrowLeft aria-hidden="true" /> Voltar ao carrinho
              </Link>
            ) : (
              <button type="button" className="lj-btn lj-btn--ghost" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft aria-hidden="true" /> Voltar
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="submit" className="lj-btn lj-btn--primary lj-btn--lg">
                Continuar para {STEPS[step + 1].toLowerCase()} <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="lj-btn lj-btn--primary lj-btn--lg" disabled aria-describedby="co-disabled-reason">
                <Lock aria-hidden="true" /> Confirmar pedido
              </button>
            )}
          </div>
          {step === STEPS.length - 1 && (
            <p id="co-disabled-reason" className="lj-sr-only">
              Indisponível: o pagamento online ainda está em configuração.
            </p>
          )}
        </form>
      </div>

      <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <OrderSummary>
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
