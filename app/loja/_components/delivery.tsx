"use client";

import { useId, useState } from "react";
import { AlertCircle, CheckCircle2, Home, MapPin, Snowflake, Truck } from "lucide-react";
import { useCepLookup, maskCep } from "../_lib/cep";
import { STORE, type Product } from "../_lib/catalog";
import type { ShippingState } from "../_lib/pricing";
import { formatCep, useDeliveryLocation } from "../_lib/store";

export { maskCep };

export function describeLocation(location: { cep: string; city?: string; uf?: string }) {
  return location.city && location.uf ? `${location.city}/${location.uf} · ${formatCep(location.cep)}` : formatCep(location.cep);
}

/*
 * CEP lookup. The CEP is validated against the real address service
 * (/api/loja/cep → ViaCEP) and remembered, so no other screen asks for it
 * again. There is no shipping-quote API behind the store, so the only
 * delivery time shown is the store's published average window — never a
 * made-up per-region price or date.
 */
export function CepLookup({ autoFocus, onSaved, compact }: { autoFocus?: boolean; onSaved?: () => void; compact?: boolean }) {
  const id = useId();
  const saved = useDeliveryLocation();
  const { status, run, reset } = useCepLookup();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const loading = status.state === "loading";

  if (saved && !editing) {
    return (
      <div className="flex flex-col gap-2" role="status">
        <p className="flex items-start gap-2 text-sm text-[color:var(--lj-ink)]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--lj-success)]" aria-hidden="true" />
          <span>
            Entrega para <strong>{describeLocation(saved)}</strong>
            {!compact && (
              <>
                : prazo médio de <strong>{STORE.delivery.window}</strong>.
              </>
            )}
          </span>
        </p>
        {!saved.city && (
          <p className="lj-tiny lj-muted">Não conseguimos confirmar a cidade agora; o endereço completo é pedido no checkout.</p>
        )}
        <button
          type="button"
          className="lj-link lj-hit self-start text-sm"
          onClick={() => {
            setValue("");
            reset();
            setEditing(true);
          }}
        >
          Alterar CEP
        </button>
      </div>
    );
  }

  const message =
    status.state === "invalid"
      ? "Digite os 8 números do CEP."
      : status.state === "not_found"
        ? "Não encontramos esse CEP. Confira os números."
        : status.state === "error"
          ? "Não foi possível consultar o CEP agora. Tente novamente em instantes."
          : "";

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (loading) return;
        const result = await run(value);
        if (result.state === "valid") {
          setEditing(false);
          onSaved?.();
        }
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
          maxLength={9}
          value={value}
          // readOnly (not disabled) while looking up: a disabled field drops
          // keyboard focus, sending screen-reader users back to the page top.
          readOnly={loading}
          aria-busy={loading || undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-msg` : undefined}
          onChange={(e) => {
            setValue(maskCep(e.target.value));
            if (message) reset();
          }}
        />
        <button type="submit" className="lj-btn lj-btn--secondary w-[76px] shrink-0" aria-disabled={loading || undefined} aria-busy={loading}>
          {loading ? (
            <>
              <span className="lj-spinner" aria-hidden="true" />
              <span className="lj-sr-only">Consultando CEP</span>
            </>
          ) : (
            "OK"
          )}
        </button>
      </div>
      {message ? (
        <p id={`${id}-msg`} className="lj-field-error inline-flex items-start gap-1.5" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" /> {message}
        </p>
      ) : (
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
          className="lj-link lj-hit lj-tiny self-start"
        >
          Não sei meu CEP<span className="lj-sr-only"> (site dos Correios, abre em nova aba)</span>
        </a>
      )}
      {saved && (
        <button type="button" className="lj-link lj-hit lj-tiny self-start" onClick={() => setEditing(false)}>
          Manter {formatCep(saved.cep)}
        </button>
      )}
    </form>
  );
}

/**
 * The delivery modality, spelled out before checkout. Home delivery is the
 * only fulfillment the store offers today (no pickup units exist), so it's
 * shown as the fixed option with its real window and cost state.
 */
export function FulfillmentOption({ shipping }: { shipping: ShippingState }) {
  const location = useDeliveryLocation();
  return (
    <div className="lj-option cursor-default" aria-label="Modalidade de entrega">
      <Home className="mt-0.5 size-5 shrink-0 text-[color:var(--lj-primary)]" aria-hidden="true" />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-[color:var(--lj-ink)]">Receber em casa</span>
          <span
            className={`text-sm font-bold ${shipping.kind === "free" ? "text-[color:var(--lj-success)]" : "text-[color:var(--lj-ink)]"}`}
          >
            {shipping.kind === "free" ? "Grátis" : shipping.kind === "quoted" ? "" : "Frete a confirmar"}
          </span>
        </span>
        <span className="lj-small lj-muted">
          Prazo médio de {STORE.delivery.window}
          {location ? ` para ${describeLocation(location)}` : ""}. Enviado de {STORE.city}.
        </span>
      </span>
    </div>
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
