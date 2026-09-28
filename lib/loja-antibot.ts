import { z } from "zod";
import { logAudit } from "./audit-log";
import { clientIp } from "./rate-limit";

/*
 * Cheap, invisible anti-bot checks for the public store forms (checkout
 * and e-mail opt-in). No CAPTCHA, no third-party script, no CPU cost:
 *
 * - `hp` (honeypot): a text field the browser form hides from people
 *   (off-screen, aria-hidden, tabindex=-1, autocomplete=off). Humans leave
 *   it empty; form-filling bots fill every input they see.
 * - `elapsedMs`: milliseconds between the form first being shown and the
 *   submit. A real person needs seconds to fill an address or type an
 *   e-mail; a script posting the moment the page loads does not.
 *
 * Both fields are OPTIONAL: pages cached before this shipped (and any old
 * client) don't send them and must keep working — absent means "allowed".
 * A rejection answers exactly like any malformed body (400 invalid_body):
 * nothing is stored, no Telegram alert is sent, and a single silent audit
 * row (LOJA_BOT_REJECTED) records it for the team. These fields are never
 * persisted: callers strip them before touching the database.
 */

export const ELAPSED_MAX_MS = 86_400_000;

export const antiBotShape = {
  hp: z.string().max(200).optional(),
  // Capped at 24 h by CLAMPING, not rejecting: a real shopper who left the
  // tab open for two days must never be refused for it.
  elapsedMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).transform((v) => Math.min(v, ELAPSED_MAX_MS)).optional(),
};

export type AntiBotFields = { hp?: string; elapsedMs?: number };

/** Minimum plausible fill time (ms): checkout has ~10 fields, the opt-in one. */
export const MIN_FILL_MS = { order: 2500, subscribe: 1200 } as const;

export function botRejectionReason(fields: AntiBotFields, minMs: number): "honeypot" | "too_fast" | null {
  if (typeof fields.hp === "string" && fields.hp.length > 0) return "honeypot";
  if (typeof fields.elapsedMs === "number" && fields.elapsedMs < minMs) return "too_fast";
  return null;
}

/** Removes the anti-bot fields so they can never reach storage. */
export function withoutAntiBotFields<T extends AntiBotFields>(body: T): Omit<T, "hp" | "elapsedMs"> {
  const { hp: _hp, elapsedMs: _elapsed, ...rest } = body;
  void _hp;
  void _elapsed;
  return rest;
}

/** Silent audit row (never forwarded to Telegram) + the same 400 a malformed body gets. */
export async function rejectBot(db: D1Database, request: Request, form: "order" | "subscribe", reason: "honeypot" | "too_fast", fields: AntiBotFields) {
  await logAudit(db, {
    actor: "loja-antibot",
    action: "LOJA_BOT_REJECTED",
    resource: form === "order" ? "loja_orders" : "loja_subscribers",
    result: "failure",
    ip: clientIp(request),
    // Never the honeypot's content (attacker-chosen text) — only its size.
    metadata: { form, reason, ...(typeof fields.elapsedMs === "number" ? { elapsedMs: fields.elapsedMs } : {}), hpLength: fields.hp?.length ?? 0 },
    silent: true,
  });
  return Response.json({ error: "invalid_body" }, { status: 400 });
}
