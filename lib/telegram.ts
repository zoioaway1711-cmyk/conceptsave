import { env } from "cloudflare:workers";

function runtime() {
  return env as unknown as { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string };
}

/**
 * Makes an untrusted value safe to interpolate into a plain-text alert.
 * Some alert fields come straight from attackers — e.g. the username typed
 * into a FAILED admin login lands in the audit entry's `actor`. Without
 * this, a "username" containing line breaks could append fake lines to
 * the message ("✅ SAVE LOGS — ADMIN_LOGIN … IP: <office IP>") and forge a
 * convincing notification on the owner's phone; bidi-override characters
 * could visually reorder text. Strips control, zero-width and bidi
 * characters, collapses whitespace and caps the length.
 */
export function sanitizeAlertText(value: unknown, maxLength = 80): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Best-effort push notification — never allowed to throw or slow down the
 * request that triggered it (same contract as lib/audit-log.ts's
 * logAudit, which is in fact one of this function's two callers). A
 * no-op, not an error, when the two TELEGRAM_* secrets haven't been
 * configured yet, so this is safe to call unconditionally from anywhere.
 *
 * Deliberately its own module rather than living in lib/alerts.ts: both
 * lib/audit-log.ts (forwards every audit entry) and lib/alerts.ts (the
 * three curated security alerts, which also call logAudit to write their
 * own Audit Log row) need this function, and audit-log.ts <-> alerts.ts
 * importing each other directly would be a circular dependency.
 */
export async function sendTelegramAlert(message: string): Promise<void> {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = runtime();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
      // Callers await this inside request handlers: a hung Telegram API must
      // never hold the response (e.g. a customer's order confirmation).
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Never let a Telegram outage affect the admin action that triggered this.
  }
}

/**
 * Best-effort bulk delete for the /limpar command. Telegram's own
 * limitations apply (max 100 ids per call, nothing older than 48h can be
 * deleted, service messages are skipped) — this never throws, it just
 * deletes what it can.
 */
export async function deleteTelegramMessages(chatId: string, messageIds: number[]): Promise<boolean> {
  const { TELEGRAM_BOT_TOKEN: token } = runtime();
  if (!token || messageIds.length === 0) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_ids: messageIds }),
    });
    const data = (await response.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}
