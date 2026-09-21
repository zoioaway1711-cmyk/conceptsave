import { env } from "cloudflare:workers";

function runtime() {
  return env as unknown as { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string };
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
    });
  } catch {
    // Never let a Telegram outage affect the admin action that triggered this.
  }
}
