"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Coins, Copy, ExternalLink, FileText, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import type { OrderPaymentState, PaymentProvider, PublicPayment } from "@/lib/loja-payments";
import { STORE, formatBRL } from "../_lib/catalog";
import { notify } from "../_lib/feedback";

/*
 * "Pague com Pix" / "Pague em USDT" on the order page. The server owns
 * everything that matters (which charge is live, whether it was paid);
 * this component only shows what to pay and keeps asking the order
 * endpoint — which also nudges the provider when a webhook is late —
 * until the payment is settled.
 *
 * QR codes are drawn here (Pix: from the copy-and-paste EMV text; crypto:
 * from the wallet address): no image loaded from a third party, nothing
 * new in the CSP, and the QR can never disagree with the text next to it.
 */

export type PaymentState = OrderPaymentState;
type AutoState = Extract<PaymentState, { mode: "auto" }>;

const POLL_MS = 5000;

const START_ERRORS: Record<string, string> = {
  provider_unavailable: "O serviço de pagamento está instável agora. Tente de novo em alguns instantes.",
  provider_error: "Não conseguimos gerar o pagamento. Tente de novo em alguns instantes.",
  network: "Sem conexão para gerar o pagamento. Verifique a internet e tente de novo.",
  rate_limited: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
};

/** Errors after which the team takes over (no automatic payment for this order). */
const MANUAL_ERRORS = new Set(["not_supported", "not_configured", "amount_out_of_range", "order_not_payable"]);

const COPY: Record<PaymentProvider, { title: string; paidTitle: string; generating: string; again: string; expired: string }> = {
  pix: {
    title: "Pague com Pix",
    paidTitle: "Pagamento via Pix",
    generating: "Gerando o seu código Pix…",
    again: "Gerar novo código Pix",
    expired: "O código Pix anterior expirou. Se você já pagou, aguarde: a confirmação ainda chega e esta página se atualiza. Se não pagou, gere um novo código.",
  },
  crypto: {
    title: "Pague em USDT",
    paidTitle: "Pagamento em USDT",
    generating: "Calculando a cotação em USDT…",
    again: "Gerar nova cotação",
    expired:
      "A cotação expirou. Se você já enviou os USDT, aguarde: pagamentos feitos até 30 minutos depois do vencimento ainda são confirmados e esta página se atualiza. Se não enviou, gere uma nova cotação.",
  },
};

async function requestCharge(orderId: string, token: string): Promise<{ ok: true; state: PaymentState } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/loja/orders/${encodeURIComponent(orderId)}/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { payment?: PaymentState; error?: string };
    if (res.ok && data.payment) return { ok: true, state: data.payment };
    if (res.status === 429) return { ok: false, error: "rate_limited" };
    return { ok: false, error: typeof data.error === "string" ? data.error : "provider_error" };
  } catch {
    return { ok: false, error: "network" };
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function QrImage({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode")
      .then((QRCode) => QRCode.default.toDataURL(value, { margin: 1, width: 480, errorCorrectionLevel: "M" }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <span className="lj-media flex size-[220px] shrink-0 items-center justify-center rounded-[var(--lj-r-md)] bg-white p-2 sm:size-[240px]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL generated in the browser
        <img src={src} alt={label} width={240} height={240} className="size-full" />
      ) : (
        <span className="lj-skeleton size-full rounded-[var(--lj-r-sm)]" aria-label="Gerando QR Code" />
      )}
    </span>
  );
}

async function copy(text: string, title: string, description?: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify({ tone: "success", title, description });
  } catch {
    notify({ tone: "error", title: "Não foi possível copiar", description: "Selecione o texto e copie manualmente." });
  }
}

/** Counts down to `expiresAt` and calls `onExpired` once when it's reached. */
function Countdown({ expiresAt, label, onExpired }: { expiresAt: number | null; label: string; onExpired: () => void }) {
  const now = useNow(expiresAt !== null);
  const remaining = expiresAt ? expiresAt * 1000 - now : null;
  const fired = useRef(false);
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !fired.current) {
      fired.current = true;
      onExpired();
    }
  }, [remaining, onExpired]);
  if (remaining === null) return null;
  return (
    <span className="lj-small inline-flex items-center gap-1.5 font-semibold text-[color:var(--lj-ink)]" aria-live="off">
      <Clock className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> {label} {formatRemaining(remaining)}
    </span>
  );
}

function PendingPix({ payment, onExpired }: { payment: PublicPayment; onExpired: () => void }) {
  const pix = payment.pix;
  if (!pix) return null;
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="flex flex-col items-center gap-2">
        <QrImage value={pix.copyPaste} label="QR Code do Pix deste pedido" />
        <Countdown expiresAt={payment.expiresAt} label="Expira em" onExpired={onExpired} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <ol className="lj-small flex list-decimal flex-col gap-1 pl-5 text-[color:var(--lj-text)]">
          <li>Abra o app do seu banco e escolha pagar com Pix.</li>
          <li>Aponte a câmera para o QR Code ou use o Pix copia e cola.</li>
          <li>
            Confira o valor de <strong>{formatBRL(payment.amountCents / 100)}</strong> e confirme.
          </li>
        </ol>
        <label className="flex flex-col gap-1.5">
          <span className="lj-label">Pix copia e cola</span>
          <textarea
            readOnly
            rows={3}
            value={pix.copyPaste}
            onFocus={(e) => e.currentTarget.select()}
            className="lj-input h-auto resize-none break-all font-mono text-xs leading-relaxed"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="lj-btn lj-btn--primary"
            onClick={() => void copy(pix.copyPaste, "Código Pix copiado", "Cole no app do seu banco, na opção Pix copia e cola.")}
          >
            <Copy aria-hidden="true" /> Copiar código Pix
          </button>
          <a href={pix.payUrl} target="_blank" rel="noopener noreferrer" className="lj-btn lj-btn--secondary">
            <ExternalLink aria-hidden="true" /> Abrir página de pagamento<span className="lj-sr-only"> (abre em nova aba)</span>
          </a>
        </div>
        <p className="lj-alert lj-alert--info">
          <ShieldCheck aria-hidden="true" />
          <span>
            No app do banco, o recebedor aparece como <strong>{pix.receiver}</strong>, parceira de pagamentos da {STORE.name}. Esta página se
            atualiza sozinha assim que o pagamento é confirmado.
          </span>
        </p>
      </div>
    </div>
  );
}

function CopyRow({ label, value, copied, mono = true }: { label: string; value: string; copied: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="lj-label">{label}</span>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`lj-input min-w-0 flex-1 ${mono ? "font-mono text-sm" : ""}`}
          aria-label={label}
        />
        <button type="button" className="lj-btn lj-btn--secondary shrink-0" onClick={() => void copy(value, copied)}>
          <Copy aria-hidden="true" /> Copiar
        </button>
      </div>
    </div>
  );
}

function PendingCrypto({ payment, onExpired }: { payment: PublicPayment; onExpired: () => void }) {
  const c = payment.crypto;
  if (!c) return null;
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="flex flex-col items-center gap-2">
        <QrImage value={c.address} label="QR Code do endereço USDT (rede Tron) deste pedido" />
        <Countdown expiresAt={payment.expiresAt} label="Cotação válida por" onExpired={onExpired} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm text-[color:var(--lj-text)]">
          Envie <strong className="text-lg text-[color:var(--lj-ink)]">{c.amountUsdt} USDT</strong> pela rede <strong>{c.network}</strong>
          {c.priceBrl ? <span className="lj-muted"> · cotação 1 USDT = {formatBRL(c.priceBrl)}</span> : null}
        </p>
        <CopyRow label="Valor exato (USDT)" value={c.amountUsdt} copied="Valor em USDT copiado" />
        <CopyRow label="Endereço de destino (Tron · TRC20)" value={c.address} copied="Endereço copiado" />
        <p className="lj-alert lj-alert--warning">
          <AlertTriangle aria-hidden="true" />
          <span className="flex flex-col gap-1">
            <span>
              Envie <strong>exatamente {c.amountUsdt} USDT</strong>, com todas as casas decimais — é assim que identificamos o seu pagamento.
            </span>
            <span>A taxa da rede (em TRX) é paga à parte: não desconte do valor.</span>
            <span>
              Use somente a rede <strong>Tron (TRC20)</strong> e o token <strong>USDT</strong>. Envios por outra rede ou outro token são perdidos.
            </span>
          </span>
        </p>
        {c.contract && <p className="lj-tiny lj-muted break-all">Contrato do token USDT-TRC20: {c.contract}</p>}
        <p className="lj-tiny lj-muted">Esta página se atualiza sozinha assim que a transferência é confirmada na rede.</p>
      </div>
    </div>
  );
}

async function downloadReceipt(orderId: string, token: string) {
  try {
    const res = await fetch(`/api/loja/orders/${encodeURIComponent(orderId)}/receipt`, { headers: { "x-order-token": token }, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "comprovante-pagamento.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    notify({ tone: "error", title: "Comprovante indisponível", description: "Tente de novo em alguns instantes." });
  }
}

/** Receipt + explorer links for a paid charge (also used by the order's "Pagamento" card). */
export function PaymentReceipt({ payment, orderId, token, compact }: { payment: PublicPayment; orderId: string; token: string; compact?: boolean }) {
  const btn = `lj-btn ${compact ? "lj-btn--ghost" : "lj-btn--secondary"} lj-btn--sm lj-no-print`;
  return (
    <span className="flex flex-wrap gap-2">
      {payment.receiptUrl && (
        <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          <FileText aria-hidden="true" /> Baixar comprovante<span className="lj-sr-only"> (abre em nova aba)</span>
        </a>
      )}
      {payment.receiptDownload && (
        <button type="button" className={btn} onClick={() => void downloadReceipt(orderId, token)}>
          <FileText aria-hidden="true" /> Baixar comprovante
        </button>
      )}
      {payment.explorerUrl && (
        <a href={payment.explorerUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          <ExternalLink aria-hidden="true" /> Ver transação<span className="lj-sr-only"> (abre em nova aba)</span>
        </a>
      )}
    </span>
  );
}

/**
 * `state` comes from GET /api/loja/orders/:id; `onRefresh` refetches it
 * silently (or applies a state handed over directly).
 */
export function OnlinePayment({
  orderId,
  token,
  state,
  onRefresh,
}: {
  orderId: string;
  token: string;
  state: AutoState;
  onRefresh: (next?: PaymentState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const autoStarted = useRef(false);
  const current = state.current;
  const status = current?.status ?? null;
  const copyText = COPY[state.provider];

  async function start() {
    setBusy(true);
    setError(null);
    const r = await requestCharge(orderId, token);
    setBusy(false);
    if (r.ok) {
      onRefresh(r.state);
      return;
    }
    if (r.error === "in_progress") {
      // Another tab/click is generating it: just wait for it.
      window.setTimeout(() => onRefresh(), 2000);
      return;
    }
    if (MANUAL_ERRORS.has(r.error)) {
      setManual(true);
      onRefresh();
      return;
    }
    setError(START_ERRORS[r.error] ?? START_ERRORS.provider_error);
  }

  // First visit with no charge yet: generate it right away (the server
  // reuses a live one, so a reload never creates a second charge).
  useEffect(() => {
    if (autoStarted.current || current || !state.canCreate) return;
    autoStarted.current = true;
    const t = window.setTimeout(() => void start(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one automatic start per mount
  }, [current, state.canCreate]);

  // Keep asking while there's something to wait for; pause in background
  // tabs. Crypto `review` (underpaid) can still be completed and confirmed.
  const waiting = status === "pending" || status === "creating" || (!current && busy) || (state.provider === "crypto" && status === "review");
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") onRefresh();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [waiting, onRefresh]);

  if (manual) return null;
  const Icon = state.provider === "pix" ? QrCode : Coins;

  return (
    <section className="lj-card lj-card--pad flex flex-col gap-4 border-[color:var(--lj-primary)]" aria-labelledby="pagar-online" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pagar-online" className="lj-h3 inline-flex items-center gap-2">
          <Icon className="size-5 text-[color:var(--lj-primary)]" aria-hidden="true" /> {status === "paid" ? copyText.paidTitle : copyText.title}
        </h2>
        {current && <span className="text-lg font-extrabold text-[color:var(--lj-ink)]">{formatBRL(current.amountCents / 100)}</span>}
      </div>

      {current?.test && (
        <p className="lj-alert lj-alert--info">
          <AlertCircle aria-hidden="true" />
          <span>
            <strong>Pedido de teste:</strong> a cobrança deste pedido foi fixada em {formatBRL(current.amountCents / 100)}, independentemente do
            valor dos itens.
          </span>
        </p>
      )}

      <div aria-live="polite">
        {status === "pending" && current && state.provider === "pix" && <PendingPix payment={current} onExpired={() => onRefresh()} />}
        {status === "pending" && current && state.provider === "crypto" && <PendingCrypto payment={current} onExpired={() => onRefresh()} />}

        {(status === "creating" || (!current && (busy || state.canCreate) && !error)) && (
          <p className="lj-small inline-flex items-center gap-2 text-[color:var(--lj-text)]">
            <span className="lj-spinner" aria-hidden="true" /> {copyText.generating}
          </p>
        )}

        {status === "paid" && current && (
          <div className="lj-alert lj-alert--success">
            <CheckCircle2 aria-hidden="true" />
            <span className="flex flex-col gap-2">
              <strong>Pagamento confirmado!</strong>
              <span>Recebemos o seu pagamento. O pedido já segue para separação.</span>
              <PaymentReceipt payment={current} orderId={orderId} token={token} />
            </span>
          </div>
        )}

        {status === "review" && (
          <p className="lj-alert lj-alert--warning">
            <AlertCircle aria-hidden="true" />
            <span>
              {state.provider === "crypto"
                ? "Recebemos uma transferência com valor diferente do esperado. Não envie de novo: nossa equipe vai conferir e entrar em contato pelo e-mail ou celular informados."
                : "Recebemos um pagamento que precisa de uma conferência da nossa equipe. Não pague de novo: entraremos em contato pelo e-mail ou celular informados."}
            </span>
          </p>
        )}

        {(status === "expired" || status === "failed") && (
          <p className="lj-alert lj-alert--warning">
            <Clock aria-hidden="true" />
            <span>{status === "expired" ? copyText.expired : "Não foi possível gerar o pagamento anterior. Gere um novo para pagar."}</span>
          </p>
        )}

        {error && (
          <p className="lj-alert lj-alert--error" role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {state.canCreate && (status === "expired" || status === "failed" || (!current && error)) && (
        <button type="button" className="lj-btn lj-btn--primary self-start" onClick={() => void start()} disabled={busy}>
          {busy ? <span className="lj-spinner" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} {copyText.again}
        </button>
      )}
    </section>
  );
}
