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
};

/** Best-effort audit trail write — never throws, so a logging failure can't break the request it's describing. */
export async function logAudit(db: D1Database, entry: AuditEntry) {
  try {
    await db.prepare(
      `INSERT INTO audit_logs (actor, action, resource, resource_id, result, ip, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(entry.actor, entry.action, entry.resource ?? "", entry.resourceId ?? "", entry.result, entry.ip ?? "", JSON.stringify(entry.metadata ?? {}), new Date().toISOString()).run();
  } catch {
    // Auditing must never block or fail the underlying request.
  }
}
