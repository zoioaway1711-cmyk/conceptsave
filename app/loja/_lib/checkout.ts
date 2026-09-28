import { levenshtein } from "./search";

/*
 * Pure checkout validation (no React) — unit-tested in checkout.test.ts.
 * Every message says exactly what to fix; none is a generic "inválido".
 */

export type CheckoutForm = {
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

export type CheckoutErrors = Partial<Record<keyof CheckoutForm, string>>;

export const EMPTY_CHECKOUT: CheckoutForm = {
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
};

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** Area codes in use in Brazil (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54,
  55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98,
  99,
]);

export const digits = (v: string) => v.replace(/\D/g, "");

export function maskCpf(v: string) {
  const d = digits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function maskPhone(v: string) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function validCpf(value: string) {
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

const COMMON_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br", "yahoo.com", "icloud.com", "live.com", "uol.com.br", "bol.com.br", "terra.com.br"];

/** "maria@gmial.com" → "maria@gmail.com"; null when nothing close enough. */
export function suggestEmail(email: string) {
  const [user, domain] = email.trim().toLowerCase().split("@");
  if (!user || !domain || COMMON_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of COMMON_DOMAINS) {
    const d = levenshtein(domain, candidate);
    if (d > 0 && d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best ? `${user}@${best}` : null;
}

export function fieldError(field: keyof CheckoutForm, f: CheckoutForm): string | undefined {
  switch (field) {
    case "name": {
      const parts = f.name.trim().split(/\s+/).filter(Boolean);
      if (!f.name.trim()) return "Informe seu nome completo.";
      if (parts.length < 2) return "Informe também o sobrenome.";
      return undefined;
    }
    case "email":
      if (!f.email.trim()) return "Informe seu e-mail.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return "E-mail incompleto. Use o formato nome@provedor.com.";
      return undefined;
    case "cpf": {
      const d = digits(f.cpf);
      if (!d) return "Informe o CPF.";
      if (d.length < 11) return `O CPF tem 11 números — faltam ${11 - d.length}.`;
      if (!validCpf(d)) return "Esse CPF não é válido. Confira os números.";
      return undefined;
    }
    case "phone": {
      const d = digits(f.phone);
      if (!d) return "Informe o celular com DDD.";
      if (d.length < 10) return "Número incompleto. Informe DDD + número.";
      if (!DDDS.has(Number(d.slice(0, 2)))) return `O DDD ${d.slice(0, 2)} não existe. Confira os dois primeiros números.`;
      if (d.length === 11 && d[2] !== "9") return "Celular com 9 dígitos deve começar com 9 depois do DDD.";
      return undefined;
    }
    case "cep":
      if (digits(f.cep).length !== 8) return "Digite os 8 números do CEP.";
      return undefined;
    case "street":
      return f.street.trim() ? undefined : "Informe a rua ou avenida.";
    case "number":
      if (!f.number.trim()) return "Informe o número. Se não houver, use S/N.";
      if (!/^(\d{1,6}[A-Za-z]?|s\/?n)$/i.test(f.number.trim())) return "Use apenas o número (ex.: 120 ou 120A) ou S/N.";
      return undefined;
    case "district":
      return f.district.trim() ? undefined : "Informe o bairro.";
    case "city":
      return f.city.trim() ? undefined : "Informe a cidade.";
    case "uf":
      return UFS.includes(f.uf) ? undefined : "Selecione o estado.";
    default:
      return undefined;
  }
}

export const STEP_FIELDS: (keyof CheckoutForm)[][] = [
  ["name", "email", "cpf", "phone"],
  ["cep", "street", "number", "district", "city", "uf"],
  [],
  [],
];

export function validateStep(step: number, f: CheckoutForm): CheckoutErrors {
  const errors: CheckoutErrors = {};
  for (const field of STEP_FIELDS[step] ?? []) {
    const e = fieldError(field, f);
    if (e) errors[field] = e;
  }
  return errors;
}

export const FIELD_LABELS: Record<keyof CheckoutForm, string> = {
  name: "Nome completo",
  email: "E-mail",
  cpf: "CPF",
  phone: "Celular",
  cep: "CEP",
  street: "Rua / avenida",
  number: "Número",
  complement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  uf: "UF",
  payment: "Forma de pagamento",
  installments: "Parcelas",
};

/* ---------- client-side hardening (pure, unit-tested) ---------- */

export const ORDER_ID_RE = /^ord_[0-9a-f-]{36}$/;
export const ORDER_TOKEN_RE = /^[0-9a-f]{32}$/;
export const ORDER_NUMBER_RE = /^[A-Z0-9-]{4,32}$/;

/** Idle time after which the checkout draft (name, e-mail, phone, address) is discarded. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

/** True when the shopper typed anything worth keeping (payment defaults don't count; CPF is never kept). */
export const hasPersonalData = (f: CheckoutForm) =>
  (Object.keys(f) as (keyof CheckoutForm)[]).some((k) => k !== "payment" && k !== "installments" && k !== "cpf" && f[k]);

/**
 * Validates a stored checkout draft. Returns null when missing, corrupted,
 * tampered or older than DRAFT_TTL_MS (drafts without `savedAt` predate
 * the expiry and count as expired). The CPF is always blank.
 */
export function parseDraft(raw: unknown, now: number): CheckoutForm | null {
  const r = raw as { form?: Record<string, unknown>; savedAt?: unknown } | null;
  if (!r || typeof r !== "object" || typeof r.savedAt !== "number") return null;
  const age = now - r.savedAt;
  if (!(age >= 0 && age < DRAFT_TTL_MS)) return null;
  const form = { ...EMPTY_CHECKOUT };
  for (const key of Object.keys(EMPTY_CHECKOUT) as (keyof CheckoutForm)[]) {
    const v = r.form?.[key];
    if (typeof v === "string" && v.length <= 160) (form[key] as string) = v;
  }
  if (!["pix", "cartao", "boleto"].includes(form.payment)) form.payment = "pix";
  if (form.uf && !UFS.includes(form.uf)) form.uf = "";
  if (!/^\d{1,2}$/.test(form.installments)) form.installments = "1";
  form.cpf = "";
  return form;
}

/** Server-reported field errors: known fields only, bounded text, never objects or unknown keys. */
export function sanitizeFieldErrors(raw: unknown, form: CheckoutForm): CheckoutErrors {
  const out: CheckoutErrors = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(FIELD_LABELS, key)) continue;
    const field = key as keyof CheckoutForm;
    out[field] =
      fieldError(field, form) ??
      (typeof value === "string" && value.length > 0 && value.length <= 200 ? value : `Confira o campo ${FIELD_LABELS[field]}.`);
  }
  return out;
}

export type CreatedOrder = { id: string; number: string; token: string; total: number };

/** A 201 is only trusted when it has the exact shape we navigate to and store. */
export function parseCreatedOrder(data: unknown): CreatedOrder | null {
  const d = data as { id?: unknown; number?: unknown; token?: unknown; totals?: { total?: unknown } } | null;
  if (typeof d?.id !== "string" || !ORDER_ID_RE.test(d.id)) return null;
  if (typeof d.token !== "string" || !ORDER_TOKEN_RE.test(d.token)) return null;
  if (typeof d.number !== "string" || !ORDER_NUMBER_RE.test(d.number)) return null;
  const total = d.totals?.total;
  return { id: d.id, number: d.number, token: d.token, total: typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : 0 };
}
