"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { notify } from "../_lib/feedback";

/*
 * "Avalie sua compra" on a DELIVERED order's page. The order's access token
 * proves the purchase (POST /api/loja/orders/[id]/reviews); each product of
 * the order can be reviewed once and is published only after the team
 * approves it in the admin.
 */

type ReviewState = { canReview: boolean; reviewed: Record<string, "pending" | "approved" | "rejected">; suggestedAuthor: string };
type Item = { slug: string; name: string };

const STATUS_TEXT = {
  pending: "Avaliação enviada — aparece na loja depois da revisão da equipe.",
  approved: "Avaliação publicada. Obrigado!",
  rejected: "Avaliação recebida.",
} as const;

function StarPicker({ value, onChange, name }: { value: number; onChange: (v: number) => void; name: string }) {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="lj-sr-only">Nota</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="lj-hit cursor-pointer p-1">
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="lj-sr-only" />
          <Star
            className={`size-6 ${n <= value ? "fill-[color:var(--lj-star)] text-[color:var(--lj-star)]" : "text-[color:var(--lj-muted)]"}`}
            aria-hidden="true"
          />
          <span className="lj-sr-only">
            {n} {n === 1 ? "estrela" : "estrelas"}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function ReviewForm({ orderId, token, item, suggestedAuthor, onSent }: { orderId: string; token: string; item: Item; suggestedAuthor: string; onSent: () => void }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState(suggestedAuthor);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  async function send() {
    if (!rating) {
      setErrors({ rating: "Escolha uma nota de 1 a 5 estrelas" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/loja/orders/${encodeURIComponent(orderId)}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-order-token": token },
        body: JSON.stringify({ slug: item.slug, rating, text, author }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
      if (res.ok || data.error === "already_reviewed") {
        notify({ tone: "success", title: "Avaliação enviada", description: "Ela aparece na loja depois da revisão da equipe." });
        onSent();
      } else if (data.fields) {
        setErrors(data.fields);
      } else {
        notify({ tone: "error", title: "Não foi possível enviar a avaliação", description: "Tente de novo em instantes." });
      }
    } catch {
      notify({ tone: "error", title: "Sem conexão", description: "Tente de novo em instantes." });
    } finally {
      setSending(false);
    }
  }

  const id = `rev-${item.slug}`;
  return (
    <div className="flex flex-col gap-3">
      <StarPicker value={rating} onChange={(v) => { setRating(v); setErrors((e) => ({ ...e, rating: "" })); }} name={`${id}-rating`} />
      {errors.rating && <p className="lj-tiny text-[color:var(--lj-danger)]">{errors.rating}</p>}
      <label htmlFor={`${id}-text`} className="lj-small font-semibold text-[color:var(--lj-ink)]">
        Conte como foi sua experiência
      </label>
      <textarea
        id={`${id}-text`}
        className="lj-input min-h-24 py-2"
        maxLength={600}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Entrega, embalagem, atendimento…"
      />
      {errors.text && <p className="lj-tiny text-[color:var(--lj-danger)]">{errors.text}</p>}
      <label htmlFor={`${id}-author`} className="lj-small font-semibold text-[color:var(--lj-ink)]">
        Nome que aparece na avaliação
      </label>
      <input id={`${id}-author`} className="lj-input" maxLength={40} value={author} onChange={(e) => setAuthor(e.target.value)} />
      {errors.author && <p className="lj-tiny text-[color:var(--lj-danger)]">{errors.author}</p>}
      <p className="lj-tiny lj-muted">Também mostramos sua cidade. Não publicamos e-mail, telefone nem sobrenome completo.</p>
      <button type="button" className="lj-btn lj-btn--primary self-start" onClick={send} disabled={sending}>
        {sending ? "Enviando…" : "Enviar avaliação"}
      </button>
    </div>
  );
}

export function OrderReviews({ orderId, token, items }: { orderId: string; token: string; items: Item[] }) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/loja/orders/${encodeURIComponent(orderId)}/reviews`, { headers: { "x-order-token": token }, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ReviewState>) : null))
      .then((s) => alive && setState(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [orderId, token, version]);

  if (!state?.canReview) return null;
  const unique = items.filter((item, i) => items.findIndex((x) => x.slug === item.slug) === i);
  return (
    <section className="lj-card lj-card--pad" aria-labelledby="avaliar">
      <h2 id="avaliar" className="lj-h3 mb-1">
        Avalie sua compra
      </h2>
      <p className="lj-small lj-muted mb-4">Sua opinião ajuda outros clientes. Cada avaliação passa por revisão antes de aparecer na loja.</p>
      <ul className="flex flex-col divide-y divide-[color:var(--lj-line)]">
        {unique.map((item) => {
          const status = state.reviewed[item.slug];
          return (
            <li key={item.slug} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <p className="font-semibold text-[color:var(--lj-ink)]">{item.name}</p>
              {status ? (
                <p className="lj-small inline-flex items-center gap-2 text-[color:var(--lj-text)]">
                  <CheckCircle2 className="size-4 text-[color:var(--lj-primary)]" aria-hidden="true" /> {STATUS_TEXT[status]}
                </p>
              ) : (
                <ReviewForm orderId={orderId} token={token} item={item} suggestedAuthor={state.suggestedAuthor} onSent={() => setVersion((n) => n + 1)} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
