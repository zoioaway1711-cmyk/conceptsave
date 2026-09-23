"use client";

import { useId, useState } from "react";
import { CheckCircle2, MapPin, Snowflake, Truck } from "lucide-react";
import { STORE, type Product } from "../_lib/catalog";
import { formatCep, saveCep, useCep } from "../_lib/store";

export function maskCep(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/*
 * CEP capture. There is no shipping-quote API behind the store yet, so the
 * only honest answer is the store's published average window — the CEP is
 * remembered so checkout can prefill it, and the UI never shows a made-up
 * per-region price or date.
 */
export function CepForm({ autoFocus, onSaved }: { autoFocus?: boolean; onSaved?: () => void }) {
  const id = useId();
  const saved = useCep();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const showForm = editing || !saved;

  if (!showForm) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-start gap-2 text-sm text-[color:var(--lj-ink)]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--lj-success)]" aria-hidden="true" />
          <span>
            Entrega para <strong>{formatCep(saved)}</strong>: prazo médio de <strong>{STORE.delivery.window}</strong>.
          </span>
        </p>
        <button type="button" className="lj-link self-start text-sm" onClick={() => setEditing(true)}>
          Alterar CEP
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const digits = value.replace(/\D/g, "");
        if (digits.length !== 8) {
          setError("Digite os 8 números do CEP.");
          return;
        }
        setError("");
        saveCep(digits);
        setEditing(false);
        onSaved?.();
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor={id} className="lj-label">
        Calcule o prazo de entrega
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="lj-input"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          autoFocus={autoFocus}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setValue(maskCep(e.target.value));
            if (error) setError("");
          }}
        />
        <button type="submit" className="lj-btn lj-btn--secondary shrink-0">
          OK
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="lj-field-error" role="alert">
          {error}
        </p>
      ) : (
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
          className="lj-link lj-tiny self-start"
        >
          Não sei meu CEP
        </a>
      )}
    </form>
  );
}

/** Commercial delivery facts for a product (PDP) — never product claims. */
export function DeliveryInfo({ product }: { product: Product }) {
  return (
    <ul className="flex flex-col gap-3 text-sm">
      <li className="flex gap-3">
        <Truck className="mt-0.5 size-5 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" />
        <span>
          <strong className="text-[color:var(--lj-ink)]">
            {product.freeShipping ? "Frete grátis" : "Frete informado na confirmação do pedido"}
          </strong>
          <span className="lj-muted block">{STORE.delivery.detail}</span>
        </span>
      </li>
      {product.coldChain && (
        <li className="flex gap-3">
          <Snowflake className="mt-0.5 size-5 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" />
          <span>
            <strong className="text-[color:var(--lj-ink)]">Envio refrigerado</strong>
            <span className="lj-muted block">Caixa térmica com gelo reciclável, dimensionada para o trajeto até a sua região.</span>
          </span>
        </li>
      )}
      <li className="flex gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" />
        <span>
          <strong className="text-[color:var(--lj-ink)]">Enviado do nosso estoque em {STORE.city}</strong>
          <span className="lj-muted block">Com nota fiscal na caixa e por e-mail.</span>
        </span>
      </li>
    </ul>
  );
}
