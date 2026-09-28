import { sanitizeAlertText, sendTelegramAlert } from "./telegram";

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

/**
 * Pulls a human-readable product name out of metadata when the entry has
 * one — e.g. { name: "LIPOLESS 2.5MG" } on MATERIAL_CREATED/UPDATED, or
 * { material: "LIPOLESS 2.5MG" } on LICENSE_CREATED. Without this, the
 * Telegram message only ever showed "materials #7" / "licenses #142" —
 * a number that means nothing without opening the admin panel.
 */
export function productNameFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  const candidate = metadata?.material ?? metadata?.name;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

/**
 * Every customer_profiles-resource entry already carries the profile id as
 * `resourceId` — but pre-masked by the caller (e.g. `maskSerial(id)` ->
 * "****7890") before it ever reaches logAudit, on purpose: the raw id is
 * never written to the Audit Log or forwarded anywhere (see
 * app/api/admin/profiles/route.ts's comment on why). Stripping the leading
 * asterisks just turns that same masked value into a clean, labeled line
 * with the exact suffix /cliente already knows how to look up — no new
 * data is exposed that wasn't already sitting in the "Recurso" line.
 */
function customerIdFromEntry(entry: AuditEntry): string | null {
  if (entry.resource !== "customer_profiles" || !entry.resourceId) return null;
  const suffix = entry.resourceId.replace(/^\*+/, "");
  return suffix || null;
}

function formatAuditTelegramMessage(entry: AuditEntry): string {
  // Every interpolated field goes through sanitizeAlertText: `actor` in
  // particular is attacker-typed on failed admin logins, and a raw newline
  // there could forge extra lines of this message.
  const clean = sanitizeAlertText;
  const lines = [`${RESULT_ICON[entry.result]} SAVE LOGS — ${clean(entry.action, 60)}`, `Por: ${clean(entry.actor, 60)}`];
  if (entry.resource) lines.push(`Recurso: ${clean(entry.resource, 60)}${entry.resourceId ? ` #${clean(entry.resourceId, 80)}` : ""}`);
  const customerId = customerIdFromEntry(entry);
  if (customerId) lines.push(`Cliente: ...${clean(customerId, 40)} (use /cliente ${clean(customerId, 40)})`);
  const productName = productNameFromMetadata(entry.metadata);
  if (productName) lines.push(`Produto: ${clean(productName, 120)}`);
  if (entry.ip) lines.push(`IP: ${clean(entry.ip, 64)}`);
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
