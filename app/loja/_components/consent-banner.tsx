"use client";

import { useSyncExternalStore } from "react";
import { BarChart3 } from "lucide-react";
import { setConsent, useConsent } from "../_lib/analytics";

/*
 * LGPD opt-in for the store's first-party, anonymous analytics. Nothing is
 * collected until "Aceitar"; "Recusar" is one click and equally prominent
 * (no dark pattern). The choice can be changed any time from the footer.
 */

const reopenListeners = new Set<() => void>();
let reopened = false;
export function openPrivacyPreferences() {
  reopened = true;
  reopenListeners.forEach((l) => l());
}

export function ConsentBanner() {
  const consent = useConsent();
  const forced = useSyncExternalStore(
    (l) => {
      reopenListeners.add(l);
      return () => reopenListeners.delete(l);
    },
    () => reopened,
    () => false,
  );
  if (consent === "unknown" || (consent !== null && !forced)) return null;

  const choose = (v: "granted" | "denied") => {
    reopened = false;
    setConsent(v);
    reopenListeners.forEach((l) => l());
  };

  return (
    <section className="lj-consent" role="region" aria-label="Preferências de privacidade">
      <div className="flex items-start gap-3">
        <span className="lj-icon-circle hidden sm:inline-flex">
          <BarChart3 aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[color:var(--lj-ink)]">Podemos medir como a loja é usada?</p>
          <p className="lj-tiny lj-muted mt-1">
            Só dados anônimos de navegação (produtos vistos, buscas, etapas da compra), guardados nos nossos próprios servidores. Nunca
            nome, e-mail, CPF, telefone ou endereço. Você pode mudar isso quando quiser no rodapé.
            {consent && <> Escolha atual: {consent === "granted" ? "aceito" : "recusado"}.</>}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
        <button type="button" className="lj-btn lj-btn--secondary lj-btn--sm" onClick={() => choose("denied")}>
          Recusar
        </button>
        <button type="button" className="lj-btn lj-btn--primary lj-btn--sm" onClick={() => choose("granted")}>
          Aceitar
        </button>
      </div>
    </section>
  );
}

export function PrivacyPreferencesButton() {
  return (
    <button type="button" className="lj-small lj-muted py-1 text-left hover:text-[color:var(--lj-primary)]" onClick={openPrivacyPreferences}>
      Preferências de privacidade
    </button>
  );
}
