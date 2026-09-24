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
