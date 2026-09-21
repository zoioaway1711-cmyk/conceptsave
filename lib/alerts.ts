import { logAudit } from "./audit-log";
import { enforceRateLimits } from "./rate-limit";
import { sendTelegramAlert } from "./telegram";

export { sendTelegramAlert };

/**
 * Fires at most once per 15 minutes per IP, regardless of how many times
 * the underlying admin-login rate limit itself keeps tripping while an
 * attacker keeps hammering it — the security-relevant fact ("someone is
 * brute-forcing admin login from this IP") is worth one push, not one per
 * blocked request.
 */
export async function maybeAlertAdminLoginRateLimited(db: D1Database, ip: string): Promise<void> {
  const throttle = await enforceRateLimits(db, "alert_admin_login_rate_limited", ip, [{ limit: 1, windowSeconds: 900 }]);
  if (!throttle.allowed) return;
  // The Audit Log entry fires together with (not instead of) the Telegram
  // push, and — unlike the ADMIN_LOGIN_RATE_LIMITED row logged for every
  // single blocked attempt (see the login route) — this one specifically
  // marks the moment an alert was actually sent, so "did we get notified
  // about this attack" is answerable from the Audit Log alone even
  // without Telegram configured or reachable.
  await logAudit(db, { actor: "security-alert", action: "ALERT_ADMIN_LOGIN_RATE_LIMITED", result: "failure", ip, metadata: { channel: "telegram" } });
  await sendTelegramAlert(`🚨 SAVE LOGS: múltiplas tentativas de login admin bloqueadas (IP ${ip}). Se não foi você, considere revisar as sessões ativas.`);
}

/**
 * "Login fora do padrão": this admin has logged in before, but never once
 * from this IP. Silent for a brand-new admin's very first-ever login
 * (comparisonCount === 0) — everything is "new" at that point, so it
 * wouldn't be a meaningful signal, only noise on every account creation.
 */
export async function maybeAlertUnrecognizedAdminLogin(db: D1Database, adminId: string, username: string, ip: string, device: string, priorSessionCount: number): Promise<void> {
  if (priorSessionCount === 0 || !ip) return;
  const seenBefore = await db.prepare("SELECT 1 FROM admin_sessions WHERE admin_id=? AND ip=? LIMIT 1").bind(adminId, ip).first();
  if (seenBefore) return;
  await logAudit(db, { actor: username, action: "ALERT_ADMIN_LOGIN_NEW_IP", result: "failure", ip, metadata: { device, channel: "telegram" } });
  await sendTelegramAlert(`⚠️ SAVE LOGS: login do admin "${username}" de um endereço IP novo (${ip}${device ? `, ${device}` : ""}). Se não foi você, revogue essa sessão em Admins → Sessions.`);
}

/**
 * "Licenças revogadas em sequência": fires exactly once, at the moment the
 * count crosses the threshold within the window — not on every revoke
 * after that, and not on every revoke before it either. `count` is the
 * caller's own post-increment tally for this admin in the current window
 * (see the rate_limits-based counter in the license route), so this
 * function itself does no extra DB read.
 */
export async function maybeAlertLicenseRevokeBurst(db: D1Database, adminUsername: string, ip: string, count: number, threshold: number): Promise<void> {
  if (count !== threshold) return;
  await logAudit(db, { actor: adminUsername, action: "ALERT_LICENSE_REVOKE_BURST", result: "failure", ip, metadata: { count, channel: "telegram" } });
  await sendTelegramAlert(`⚠️ SAVE LOGS: admin "${adminUsername}" revogou ${count} licenças em poucos minutos. Confirme se é uma ação esperada (ex: substituição em massa) em Audit Log.`);
}

/**
 * Customer activity notifications — a different category from the three
 * security alerts above (those are throttled/threshold-gated because
 * they're about detecting abuse; these are one-per-real-event on purpose,
 * since a real product activation is exactly the business event the
 * whole app exists to produce, not noise to suppress). Both branch off
 * the same underlying fact (a license just got claimed) but are worded
 * differently depending on whether the claim also minted a brand-new
 * profile (this customer's first-ever access) or added to an existing
 * one (a returning customer verifying another product).
 */
/** Last 8 chars of the profile id — enough to plug into /cliente on Telegram or search the admin panel, without pasting the full internal id into chat. */
function shortProfileId(id: string): string {
  return id.slice(-8);
}

export async function notifyNewCustomerFirstAccess(db: D1Database, params: { profileId: string; materialName: string; activeLicenseCount: number; firstSeen: string; ip: string }): Promise<void> {
  // silent: true — logAudit() itself now forwards every non-ALERT_ entry to
  // Telegram automatically (see lib/audit-log.ts), so without this flag
  // the custom message right below would go out TWICE: once here, once
  // generic. This entry still writes to the Audit Log exactly as normal.
  await logAudit(db, { actor: "customer-activity", action: "CUSTOMER_FIRST_ACCESS", resource: "customer_profiles", result: "success", ip: params.ip, metadata: { profileId: params.profileId, material: params.materialName, activeLicenses: params.activeLicenseCount, firstSeen: params.firstSeen }, silent: true });
  await sendTelegramAlert(`🆕 SAVE LOGS: novo cliente (ID ...${shortProfileId(params.profileId)}) ativou "${params.materialName}" pela primeira vez (primeiro acesso em ${new Date(params.firstSeen).toLocaleString("pt-BR")}). Licenças ativas dele agora: ${params.activeLicenseCount}. Use /cliente ${shortProfileId(params.profileId)} para localizar.`);
}

export async function notifyReturningCustomerActivation(db: D1Database, params: { profileId: string; materialName: string; activeLicenseCount: number; firstSeen: string; ip: string }): Promise<void> {
  // silent: true — same reasoning as notifyNewCustomerFirstAccess above.
  await logAudit(db, { actor: "customer-activity", action: "CUSTOMER_LICENSE_ACTIVATED", resource: "customer_profiles", result: "success", ip: params.ip, metadata: { profileId: params.profileId, material: params.materialName, activeLicenses: params.activeLicenseCount, firstSeen: params.firstSeen }, silent: true });
  await sendTelegramAlert(`✅ SAVE LOGS: cliente (ID ...${shortProfileId(params.profileId)}, cliente desde ${new Date(params.firstSeen).toLocaleDateString("pt-BR")}) ativou mais um produto: "${params.materialName}". Licenças ativas dele agora: ${params.activeLicenseCount}. Use /cliente ${shortProfileId(params.profileId)} para localizar.`);
}

/**
 * Escalation beyond the throttled rate-limit ping above: fires once, at
 * the exact moment lib/ip-blocks.ts:blockIp() is called for this IP — by
 * the time a second request from the same IP would reach this code path,
 * isIpBlocked() already short-circuits it earlier in the route, so there's
 * no separate throttle needed here the way maybeAlertAdminLoginRateLimited
 * needs one.
 */
export async function notifyIpAutoBlocked(db: D1Database, ip: string, attemptCount: number): Promise<void> {
  await logAudit(db, { actor: "security-alert", action: "ALERT_IP_AUTO_BLOCKED", result: "failure", ip, metadata: { attemptCount, durationHours: 24 } });
  await sendTelegramAlert(`🚫 SAVE LOGS: IP ${ip} foi BLOQUEADO automaticamente por 24h após ${attemptCount} tentativas de login admin em 15 minutos. Desbloqueie em Admins → Blocked IPs (ou mande /desbloquear ${ip} aqui no Telegram) se foi engano.`);
}
