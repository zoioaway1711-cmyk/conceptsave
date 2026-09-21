import { findActiveSessionIdBySuffix, listAdminSessions, revokeAdminSession } from "./admin-auth";
import { blockIp, listBlockedIps, unblockIp } from "./ip-blocks";
import { logAudit, maskSerial, productNameFromMetadata } from "./audit-log";
import { deleteTelegramMessages } from "./telegram";
import { effectiveStatus, getLicense } from "./licenses";
import { getMaterial, listMaterials } from "./materials";
import { getProfile } from "./customer-profile";

export type TelegramCommandContext = { chatId: string; messageId: number };

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
  "/bloquear <ip> — bloqueia um IP manualmente",
  "/desbloquear <ip> — remove um bloqueio de IP",
  "/resumo — números gerais do painel",
  "/limpar [quantidade] — apaga as últimas mensagens deste chat (padrão 50, máx 200)",
  "/produto <nome ou prefixo> — dados de um produto e contagem de licenças",
  "/licenca <id> — status de uma licença (use o número que aparece nos logs)",
  "/cliente <id ou final do id> — perfil resumido de um cliente",
  "/expirando [dias] — licenças ativas expirando em breve (padrão 30 dias)",
  "/ultimos [quantidade] — últimas entradas do Audit Log (padrão 10, máx 30)",
  "/saude — testa se o banco de dados do site está respondendo",
  "/materiais — lista os produtos cadastrados com a contagem de licenças",
  "/bloquearcliente <id ou final do id> — bloqueia um cliente",
  "/desbloquearcliente <id ou final do id> — libera um cliente",
  "/ajuda — esta mensagem",
].join("\n");

const DEFAULT_CLEAR_COUNT = 50;
const MAX_CLEAR_COUNT = 200;
const TELEGRAM_BATCH_LIMIT = 100;
const DEFAULT_EXPIRING_DAYS = 30;
const MAX_EXPIRING_LIST = 15;
const DEFAULT_RECENT_COUNT = 10;
const MAX_RECENT_COUNT = 30;
const MAX_PROFILE_MATCHES = 5;

function shortId(id: string): string {
  return id.slice(-8);
}

const STATUS_LABEL: Record<ReturnType<typeof effectiveStatus>, string> = {
  active: "ativa",
  expired: "expirada",
  revoked: "revogada",
};

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

async function findMaterialMatches(db: D1Database, term: string): Promise<{ id: number; name: string; prefixCode: string }[]> {
  const like = `%${term}%`;
  const { results } = await db.prepare(
    "SELECT id, name, prefix_code AS prefixCode FROM materials WHERE archived=0 AND (name LIKE ? OR prefix_code LIKE ?) ORDER BY created_at DESC LIMIT 10",
  ).bind(like, like.toUpperCase()).all<{ id: number; name: string; prefixCode: string }>();
  return results;
}

async function handleProduct(db: D1Database, term: string | undefined): Promise<string> {
  if (!term) return "Uso: /produto <nome ou prefixo>";
  const matches = await findMaterialMatches(db, term);
  if (matches.length === 0) return `Nenhum produto encontrado para "${term}".`;
  const exactPrefix = matches.find((m) => m.prefixCode === term.toUpperCase());
  if (matches.length > 1 && !exactPrefix) {
    const lines = matches.map((m) => `• ${m.name} (${m.prefixCode})`);
    return [`${matches.length} produtos encontrados para "${term}" — refine pelo prefixo exato:`, ...lines].join("\n");
  }
  const material = exactPrefix ?? matches[0];
  const now = new Date().toISOString();
  const counts = await db.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN owner_profile_id IS NOT NULL THEN 1 ELSE 0 END) AS activated, SUM(CASE WHEN status='revoked' THEN 1 ELSE 0 END) AS revoked FROM licenses WHERE material_id=?",
  ).bind(now, material.id).first<{ total: number; active: number; activated: number; revoked: number }>();
  return [
    `📦 ${material.name} (${material.prefixCode})`,
    `Licenças totais: ${counts?.total ?? 0}`,
    `Ativas: ${counts?.active ?? 0}`,
    `Já ativadas por clientes: ${counts?.activated ?? 0}`,
    `Revogadas: ${counts?.revoked ?? 0}`,
  ].join("\n");
}

async function handleLicense(db: D1Database, idArg: string | undefined): Promise<string> {
  if (!idArg) return "Uso: /licenca <id> — o número que aparece nos logs (ex: licenses #142).";
  const id = parseInt(idArg.replace("#", ""), 10);
  if (!Number.isFinite(id) || id <= 0) return "Uso: /licenca <id> — precisa ser o número da licença.";
  const license = await getLicense(db, id);
  if (!license) return `Não encontrei nenhuma licença com o id ${id}.`;
  const material = await getMaterial(db, license.materialId);
  const status = STATUS_LABEL[effectiveStatus(license)];
  const lines = [
    `🔑 Licença #${license.id} — ${license.displayPrefix}-••••-••••-••••-${license.displaySuffix}`,
    `Produto: ${material?.name ?? `material #${license.materialId}`}`,
    `Status: ${status}`,
    `Criada em: ${new Date(license.createdAt).toLocaleString("pt-BR")}`,
    license.activatedAt ? `Ativada em: ${new Date(license.activatedAt).toLocaleString("pt-BR")}` : "Ainda não ativada por nenhum cliente.",
  ];
  if (license.lot) lines.push(`Lote: ${license.lot}`);
  if (license.expiresAt) lines.push(`Expira em: ${new Date(license.expiresAt).toLocaleString("pt-BR")}`);
  return lines.join("\n");
}

async function findProfileIdsBySuffix(db: D1Database, suffix: string): Promise<string[]> {
  const { results } = await db.prepare(
    "SELECT id FROM customer_profiles WHERE id LIKE '%' || ? ORDER BY last_active DESC LIMIT ?",
  ).bind(suffix, MAX_PROFILE_MATCHES).all<{ id: string }>();
  return results.map((r) => r.id);
}

/** Shared by /cliente, /bloquearcliente and /desbloquearcliente — all three take the same "full id or just the end of it" argument. Returns null (with its own explanatory reply) when the argument doesn't resolve to exactly one profile. */
async function resolveOneProfileId(db: D1Database, arg: string | undefined, usage: string): Promise<{ id: string } | { error: string }> {
  if (!arg) return { error: usage };
  const matches = await findProfileIdsBySuffix(db, arg);
  if (matches.length === 0) return { error: `Nenhum cliente encontrado terminando em "${arg}".` };
  if (matches.length > 1) {
    const lines = matches.map((id) => `• ...${shortId(id)}`);
    return { error: [`${matches.length} clientes encontrados terminando em "${arg}" — use um trecho maior do id:`, ...lines].join("\n") };
  }
  return { id: matches[0] };
}

async function handleCustomer(db: D1Database, arg: string | undefined): Promise<string> {
  const resolved = await resolveOneProfileId(db, arg, "Uso: /cliente <id ou final do id>");
  if ("error" in resolved) return resolved.error;
  const rawProfile = await getProfile(resolved.id);
  if (!rawProfile) return `Não encontrei o cliente ...${shortId(resolved.id)}.`;
  // getProfile()'s inferred return type loses the plain DB columns (points,
  // level, levelName, firstSeen) under its Record<string, unknown> spread —
  // same shape gap noted in app/api/verifications/route.ts. A local cast is
  // the minimal-blast-radius fix; changing getProfile()'s shared return
  // type would ripple across its many other call sites.
  const profile = rawProfile as unknown as { points: number; level: number; levelName: string; firstSeen: string; blocked: boolean };
  const activeLicenses = await db.prepare(
    "SELECT COUNT(*) AS n FROM licenses WHERE owner_profile_id=? AND status='active'",
  ).bind(resolved.id).first<{ n: number }>();
  return [
    `👤 Cliente ...${shortId(resolved.id)}`,
    `Pontos: ${profile.points} | Nível: ${profile.levelName} (${profile.level})`,
    `Licenças ativas: ${activeLicenses?.n ?? 0}`,
    `Bloqueado: ${profile.blocked ? "sim" : "não"}`,
    `Primeiro acesso: ${new Date(profile.firstSeen).toLocaleString("pt-BR")}`,
  ].join("\n");
}

async function setCustomerBlocked(db: D1Database, arg: string | undefined, blocked: boolean): Promise<string> {
  const usage = `Uso: /${blocked ? "bloquearcliente" : "desbloquearcliente"} <id ou final do id>`;
  const resolved = await resolveOneProfileId(db, arg, usage);
  if ("error" in resolved) return resolved.error;
  const result = await db.prepare("UPDATE customer_profiles SET blocked=?, last_active=? WHERE id=?").bind(blocked ? 1 : 0, new Date().toISOString(), resolved.id).run();
  if (result.meta.changes === 0) return `Não encontrei o cliente ...${shortId(resolved.id)}.`;
  await logAudit(db, { actor: "telegram-bot", action: blocked ? "ADMIN_PROFILE_BLOCKED" : "ADMIN_PROFILE_UNBLOCKED", resource: "customer_profiles", resourceId: maskSerial(resolved.id), result: "success", metadata: { via: "telegram" }, silent: true });
  return `Cliente ...${shortId(resolved.id)} ${blocked ? "bloqueado" : "desbloqueado"}.`;
}

async function handleExpiring(db: D1Database, arg: string | undefined): Promise<string> {
  let days = arg ? parseInt(arg, 10) : DEFAULT_EXPIRING_DAYS;
  if (!Number.isFinite(days) || days <= 0) days = DEFAULT_EXPIRING_DAYS;
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const { results } = await db.prepare(
    `SELECT l.id, l.display_prefix AS displayPrefix, l.display_suffix AS displaySuffix, l.expires_at AS expiresAt, m.name AS materialName
     FROM licenses l JOIN materials m ON m.id = l.material_id
     WHERE l.status='active' AND l.expires_at IS NOT NULL AND l.expires_at BETWEEN ? AND ?
     ORDER BY l.expires_at ASC LIMIT ${MAX_EXPIRING_LIST}`,
  ).bind(now.toISOString(), until.toISOString()).all<{ id: number; displayPrefix: string; displaySuffix: string; expiresAt: string; materialName: string }>();
  if (results.length === 0) return `Nenhuma licença expirando nos próximos ${days} dia(s).`;
  const lines = results.map((r) => `• #${r.id} ${r.displayPrefix}-••••-${r.displaySuffix} — ${r.materialName} — expira em ${new Date(r.expiresAt).toLocaleDateString("pt-BR")}`);
  return [`${results.length} licença(s) expirando nos próximos ${days} dia(s):`, ...lines].join("\n");
}

async function handleRecent(db: D1Database, arg: string | undefined): Promise<string> {
  let count = arg ? parseInt(arg, 10) : DEFAULT_RECENT_COUNT;
  if (!Number.isFinite(count) || count <= 0) count = DEFAULT_RECENT_COUNT;
  count = Math.min(count, MAX_RECENT_COUNT);
  const { results } = await db.prepare(
    "SELECT actor, action, resource, resource_id AS resourceId, result, metadata_json AS metadataJson, created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT ?",
  ).bind(count).all<{ actor: string; action: string; resource: string; resourceId: string; result: "success" | "failure"; metadataJson: string; createdAt: string }>();
  if (results.length === 0) return "Nenhuma entrada no Audit Log ainda.";
  const lines = results.map((r) => {
    const icon = r.result === "success" ? "✅" : "❌";
    const resource = r.resource ? ` (${r.resource}${r.resourceId ? ` #${r.resourceId}` : ""})` : "";
    const product = productNameFromMetadata(JSON.parse(r.metadataJson || "{}"));
    const when = new Date(r.createdAt).toLocaleString("pt-BR");
    return `${icon} ${r.action}${resource}${product ? ` — ${product}` : ""} — ${r.actor} — ${when}`;
  });
  return [`Últimas ${results.length} entrada(s) do Audit Log:`, ...lines].join("\n");
}

async function handleHealth(db: D1Database): Promise<string> {
  try {
    await db.prepare("SELECT 1").first();
    return "✅ Site no ar — banco de dados respondendo normalmente.";
  } catch {
    return "❌ O banco de dados não respondeu — o site pode estar com problemas.";
  }
}

async function formatMaterialsList(db: D1Database): Promise<string> {
  const [materials, counts] = await Promise.all([
    listMaterials(db),
    db.prepare("SELECT material_id AS materialId, COUNT(*) AS n FROM licenses GROUP BY material_id").all<{ materialId: number; n: number }>(),
  ]);
  if (materials.length === 0) return "Nenhum produto cadastrado ainda.";
  const countByMaterial = new Map(counts.results.map((c) => [c.materialId, c.n]));
  const lines = materials.slice(0, 30).map((m) => `• ${m.name} (${m.prefixCode}) — ${countByMaterial.get(m.id) ?? 0} licença(s)${m.archived ? " [arquivado]" : ""}`);
  const suffix = materials.length > 30 ? [`… e mais ${materials.length - 30} produto(s).`] : [];
  return [`${materials.length} produto(s) cadastrado(s):`, ...lines, ...suffix].join("\n");
}

/**
 * Telegram has no "clear chat" API — the closest real primitive is
 * deleting messages by id. Since ids are sequential per chat, we just
 * walk backwards from this /limpar message's own id and delete that
 * range in batches of up to 100. Anything older than 48h, or already
 * gone, is silently skipped by Telegram — this is a best-effort tidy-up,
 * not a guarantee.
 */
async function handleClear(ctx: TelegramCommandContext | undefined, arg: string | undefined): Promise<string> {
  if (!ctx) return "Não consigo limpar o chat sem saber qual conversa é — tente de novo direto no Telegram.";

  let count = arg ? parseInt(arg, 10) : DEFAULT_CLEAR_COUNT;
  if (!Number.isFinite(count) || count <= 0) count = DEFAULT_CLEAR_COUNT;
  count = Math.min(count, MAX_CLEAR_COUNT);

  const ids: number[] = [];
  for (let id = ctx.messageId; id > ctx.messageId - count && id > 0; id--) ids.push(id);

  for (let i = 0; i < ids.length; i += TELEGRAM_BATCH_LIMIT) {
    await deleteTelegramMessages(ctx.chatId, ids.slice(i, i + TELEGRAM_BATCH_LIMIT));
  }

  return `🧹 Limpeza feita: até ${ids.length} mensagens recentes removidas deste chat (mensagens com mais de 48h não podem ser apagadas — limitação do próprio Telegram).`;
}

export async function handleTelegramCommand(db: D1Database, text: string, ctx?: TelegramCommandContext): Promise<string> {
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
    case "/limpar":
    case "/clear":
      return handleClear(ctx, args[0]);
    case "/produto":
    case "/product":
      return handleProduct(db, args.join(" "));
    case "/licenca":
    case "/license":
      return handleLicense(db, args[0]);
    case "/cliente":
    case "/customer":
      return handleCustomer(db, args[0]);
    case "/expirando":
    case "/expiring":
      return handleExpiring(db, args[0]);
    case "/ultimos":
    case "/recent":
      return handleRecent(db, args[0]);
    case "/saude":
    case "/health":
      return handleHealth(db);
    case "/materiais":
    case "/materials":
      return formatMaterialsList(db);
    case "/bloquearcliente":
      return setCustomerBlocked(db, args[0], true);
    case "/desbloquearcliente":
      return setCustomerBlocked(db, args[0], false);
    default:
      return `Comando não reconhecido: ${commandRaw}\n\n${HELP_TEXT}`;
  }
}
