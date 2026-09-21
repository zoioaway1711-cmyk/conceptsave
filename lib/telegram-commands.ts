import { findActiveSessionIdBySuffix, listAdminSessions, revokeAdminSession } from "./admin-auth";
import { blockIp, listBlockedIps, unblockIp } from "./ip-blocks";
import { logAudit } from "./audit-log";

/**
 * Everything reachable here is deliberately low-risk: view/revoke a
 * session, view/manage IP blocks, a read-only summary. Creating an admin
 * or granting a permission is NEVER exposed through this surface — that
 * still requires a password and an authenticated panel session, on
 * purpose (see the conversation that scoped this: a Telegram chat has
 * none of the protections a real login does — no PBKDF2, no dedicated
 * rate limit — so it must never be able to grant access, only take it
 * away in an emergency).
 */

const HELP_TEXT = [
  "Comandos disponíveis:",
  "/sessoes — lista sessões admin ativas",
  "/revogar <id> — encerra uma sessão (use o id curto de /sessoes)",
  "/ips — lista IPs bloqueados",
  "/desbloquear <ip> — remove um bloqueio de IP",
  "/resumo — números gerais do painel",
  "/ajuda — esta mensagem",
].join("\n");

function shortId(id: string): string {
  return id.slice(-8);
}

async function formatSessions(db: D1Database): Promise<string> {
  const sessions = (await listAdminSessions(db)).filter((s) => !s.revokedAt && new Date(s.expiresAt) > new Date());
  if (sessions.length === 0) return "Nenhuma sessão admin ativa no momento.";
  const lines = sessions.slice(0, 15).map((s) => `• ${s.adminUsername} — ${s.device || "dispositivo desconhecido"} (${s.ip || "IP —"}) — id ${shortId(s.id)}`);
  return [`${sessions.length} sessão(ões) ativa(s):`, ...lines].join("\n");
}

async function handleRevoke(db: D1Database, suffix: string | undefined): Promise<string> {
  if (!suffix) return "Uso: /revogar <id> — pegue o id em /sessoes.";
  const sessionId = await findActiveSessionIdBySuffix(db, suffix);
  if (!sessionId) return `Não encontrei uma sessão ativa terminando em "${suffix}" (ou o id é ambíguo — confira em /sessoes).`;
  // canManageAll: true — the Telegram owner is, by definition, the one
  // person this bot trusts completely (see the module-level comment); this
  // mirrors what an admin.admins.manage admin can already do on the site.
  const revoked = await revokeAdminSession(db, sessionId, { id: "telegram-bot", canManageAll: true });
  if (!revoked) return "Essa sessão já não estava mais ativa.";
  await logAudit(db, { actor: "telegram-bot", action: "ADMIN_SESSION_REVOKED", resource: "admin_sessions", resourceId: sessionId, result: "success", metadata: { via: "telegram" }, silent: true });
  return `Sessão ${shortId(sessionId)} encerrada.`;
}

async function formatBlockedIps(db: D1Database): Promise<string> {
  const blocked = await listBlockedIps(db);
  if (blocked.length === 0) return "Nenhum IP bloqueado no momento.";
  const lines = blocked.map((b) => `• ${b.ip} — ${b.reason || "sem motivo registrado"} (por ${b.blockedBy}${b.expiresAt ? `, até ${new Date(b.expiresAt).toLocaleString("pt-BR")}` : ", indefinido"})`);
  return [`${blocked.length} IP(s) bloqueado(s):`, ...lines].join("\n");
}

async function handleUnblock(db: D1Database, ip: string | undefined): Promise<string> {
  if (!ip) return "Uso: /desbloquear <ip>";
  const removed = await unblockIp(db, ip);
  if (!removed) return `${ip} não estava bloqueado.`;
  await logAudit(db, { actor: "telegram-bot", action: "IP_UNBLOCKED", resourceId: ip, result: "success", ip, metadata: { via: "telegram" }, silent: true });
  return `${ip} desbloqueado.`;
}

async function handleBlock(db: D1Database, ip: string | undefined): Promise<string> {
  if (!ip) return "Uso: /bloquear <ip>";
  await blockIp(db, ip, { reason: "manual (telegram)", blockedBy: "telegram-bot" });
  await logAudit(db, { actor: "telegram-bot", action: "IP_BLOCKED", resourceId: ip, result: "success", ip, metadata: { via: "telegram" }, silent: true });
  return `${ip} bloqueado indefinidamente. Use /desbloquear ${ip} para reverter.`;
}

async function formatSummary(db: D1Database): Promise<string> {
  const now = new Date().toISOString();
  const [profiles, licenses, sessions, blockedIps] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN blocked THEN 1 ELSE 0 END) AS blocked FROM customer_profiles").first<{ total: number; blocked: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE status='active' AND owner_profile_id IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)").bind(now).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM admin_sessions WHERE revoked_at IS NULL AND expires_at > ?").bind(now).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM blocked_ips WHERE expires_at IS NULL OR expires_at > ?").bind(now).first<{ n: number }>(),
  ]);
  return [
    "📊 Resumo do painel:",
    `Clientes: ${profiles?.total ?? 0} (${profiles?.blocked ?? 0} bloqueados)`,
    `Licenças ativas: ${licenses?.n ?? 0}`,
    `Sessões admin ativas: ${sessions?.n ?? 0}`,
    `IPs bloqueados: ${blockedIps?.n ?? 0}`,
  ].join("\n");
}

export async function handleTelegramCommand(db: D1Database, text: string): Promise<string> {
  const [commandRaw, ...args] = text.trim().split(/\s+/);
  const command = commandRaw.toLowerCase().split("@")[0]; // strip a possible @botname suffix Telegram groups append
  switch (command) {
    case "/ajuda":
    case "/help":
    case "/start":
      return HELP_TEXT;
    case "/sessoes":
    case "/sessions":
      return formatSessions(db);
    case "/revogar":
    case "/revoke":
      return handleRevoke(db, args[0]);
    case "/ips":
      return formatBlockedIps(db);
    case "/desbloquear":
    case "/unblock":
      return handleUnblock(db, args[0]);
    case "/bloquear":
    case "/block":
      return handleBlock(db, args[0]);
    case "/resumo":
    case "/status":
      return formatSummary(db);
    default:
      return `Comando não reconhecido: ${commandRaw}\n\n${HELP_TEXT}`;
  }
}
