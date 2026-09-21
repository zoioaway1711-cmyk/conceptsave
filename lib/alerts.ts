import { env } from "cloudflare:workers";
import { logAudit } from "./audit-log";
import { enforceRateLimits } from "./rate-limit";

function runtime() {
  return env as unknown as { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string };
}

/**
 * Best-effort push notification for events an admin should know about
 * without having the Live Intelligence feed open — never allowed to throw
 * or slow down the request that triggered it (same contract as
 * lib/audit-log.ts's logAudit). A no-op, not an error, when the two
 * TELEGRAM_* secrets haven't been configured yet, so this is safe to call
 * unconditionally from anywhere without an adminConfigured()-style guard
 * at every call site.
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
  await sendTelegramAlert(`🚨 VerificaFarma: múltiplas tentativas de login admin bloqueadas (IP ${ip}). Se não foi você, considere revisar as sessões ativas.`);
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
  await sendTelegramAlert(`⚠️ VerificaFarma: login do admin "${username}" de um endereço IP novo (${ip}${device ? `, ${device}` : ""}). Se não foi você, revogue essa sessão em Admins → Sessions.`);
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
  await sendTelegramAlert(`⚠️ VerificaFarma: admin "${adminUsername}" revogou ${count} licenças em poucos minutos. Confirme se é uma ação esperada (ex: substituição em massa) em Audit Log.`);
}
