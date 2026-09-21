import { sendTelegramAlert } from "./telegram";

/** Masks a serial for logs/UI: keeps only the last 4 digits, e.g. "****1234". */
export function maskSerial(serial: string) {
  if (serial.length <= 4) return "*".repeat(serial.length);
  return `${"*".repeat(serial.length - 4)}${serial.slice(-4)}`;
}

export type AuditEntry = {
  actor: string;
  action: string;
  resource?: string;
  resourceId?: string;
  result: "success" | "failure";
  ip?: string;
  metadata?: Record<string, unknown>;
  /**
   * Skip forwarding THIS ONE entry to Telegram — it's still written to the
   * Audit Log exactly as normal. Exists for high-volume loops (bulk
   * license import can write up to 1000 rows in a single request): firing
   * a Telegram message per row would both flood the chat and, more
   * concretely, add up to 1000 extra outbound fetches to one request,
   * risking Cloudflare Workers' per-request subrequest limit. Those call
   * sites pass `silent: true` on the per-row entries and rely on their own
   * final summary entry (not silent) to produce the one message that
   * actually matters: "N licenses imported."
   */
  silent?: boolean;
};

/** The three ALERT_* actions (lib/alerts.ts) already send their own, purpose-written Telegram message — forwarding them again here would double up. */
function isAlreadyAlerted(action: string): boolean {
  return action.startsWith("ALERT_");
}

const RESULT_ICON: Record<AuditEntry["result"], string> = { success: "✅", failure: "❌" };

function formatAuditTelegramMessage(entry: AuditEntry): string {
  const lines = [`${RESULT_ICON[entry.result]} VerificaFarma — ${entry.action}`, `Por: ${entry.actor}`];
  if (entry.resource) lines.push(`Recurso: ${entry.resource}${entry.resourceId ? ` #${entry.resourceId}` : ""}`);
  if (entry.ip) lines.push(`IP: ${entry.ip}`);
  return lines.join("\n");
}

/**
 * Best-effort audit trail write — never throws, so a logging failure
 * can't break the request it's describing. Every entry (except the
 * ALERT_* ones, and any explicitly marked `silent`) is also forwarded to
 * Telegram, so the Audit Log and the phone notification are always in
 * sync: nothing reaches Telegram that isn't also in the Audit Log, and
 * (per-entry `silent` aside) nothing lands in the Audit Log silently.
 */
export async function logAudit(db: D1Database, entry: AuditEntry) {
  try {
    await db.prepare(
      `INSERT INTO audit_logs (actor, action, resource, resource_id, result, ip, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(entry.actor, entry.action, entry.resource ?? "", entry.resourceId ?? "", entry.result, entry.ip ?? "", JSON.stringify(entry.metadata ?? {}), new Date().toISOString()).run();
  } catch {
    // Auditing must never block or fail the underlying request — and there's nothing real to forward if the write itself failed.
    return;
  }
  if (!entry.silent && !isAlreadyAlerted(entry.action)) {
    await sendTelegramAlert(formatAuditTelegramMessage(entry));
  }
}
