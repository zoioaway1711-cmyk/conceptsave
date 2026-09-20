// Terminal dashboard for the VerificaFarma admin API — logs in with the
// same admin_users credentials as /admin, then polls the same endpoints
// the web Live Intelligence page uses (live/summary, live/events,
// live/sessions) or, with --audit, the audit log — and redraws the
// terminal. Zero extra dependencies: only Node built-ins + global fetch.
//
// Credentials are never hardcoded here (see AGENTS.md) — set VF_ADMIN_USER/
// VF_ADMIN_PASSWORD in your own shell environment, or leave them unset and
// this prompts interactively (password input is hidden).
//
// Usage:
//   node scripts/admin-cli.mjs            live dashboard (default)
//   node scripts/admin-cli.mjs --audit     tail the audit log instead
//   npm run admin:live / npm run admin:audit

import readline from "node:readline";

const BASE_URL = (process.env.VF_BASE_URL || "https://www.saveconcept.online").replace(/\/$/, "");
const MODE = process.argv.includes("--audit") ? "audit" : "live";
// Unlike the web UI's staggered polling (summary/events/sessions each on
// their own cadence), this refreshes everything together on one interval —
// simpler, and a terminal redraw is cheap enough that it doesn't matter.
const EVENTS_INTERVAL_MS = 4000;
const AUDIT_INTERVAL_MS = 5000;
const MAX_ROWS = 25;

const SEVERITY_COLOR = { info: "\x1b[37m", warning: "\x1b[33m", critical: "\x1b[31m" };
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";

function readLine(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(promptText, (answer) => { rl.close(); resolve(answer); }));
}

// No hidden-input primitive in core readline — mutes local echo ourselves,
// character by character, only while stdin is a real TTY (a piped/CI stdin
// falls back to a plain visible prompt instead of hanging on raw mode).
function readHidden(promptText) {
  if (!process.stdin.isTTY) return readLine(promptText);
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    let input = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === "") {
        process.stdout.write("\n");
        process.exit(130);
      } else if (char === "" || char === "\b") {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

let cookie = null;

async function login() {
  const user = process.env.VF_ADMIN_USER || (await readLine("Usuário admin: "));
  const password = process.env.VF_ADMIN_PASSWORD || (await readHidden("Senha: "));
  const response = await fetch(`${BASE_URL}/api/admin/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ user, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Login falhou (${response.status}): ${body.error || "erro desconhecido"}`);
  }
  const setCookie = response.headers.get("set-cookie");
  const match = setCookie?.match(/vf_admin=[^;]+/);
  if (!match) throw new Error("Login OK mas nenhum cookie de sessão veio na resposta.");
  cookie = match[0];
  const who = await response.json();
  console.log(`${GREEN}Login ok${RESET} — ${who.username} (${who.permissions.length} permissões)\n`);
}

// Re-logs in once on a 401 (session expired) and retries the same call —
// callers never see the expiry, matching the web UI polling loops.
async function apiGet(path) {
  const doFetch = () => fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  let response = await doFetch();
  if (response.status === 401) {
    await login();
    response = await doFetch();
  }
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
}

function formatLocation(event) {
  return [event.city, event.region, event.country].map((part) => (part || "").trim()).filter(Boolean).join(", ");
}

function formatDate(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleTimeString(); } catch { return value; }
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

async function liveTick(state) {
  const [summary, eventsResult, sessions] = await Promise.all([
    apiGet("/api/admin/live/summary"),
    apiGet(`/api/admin/live/events?filter=ALL&${state.cursor ? `since=${state.cursor}` : "window=30m"}`),
    apiGet("/api/admin/live/sessions"),
  ]);
  if (eventsResult.cursor) state.cursor = eventsResult.cursor;
  if (eventsResult.events?.length) state.events = [...eventsResult.events].reverse().concat(state.events).slice(0, MAX_ROWS);

  clearScreen();
  console.log(`${BOLD}${CYAN}VERIFICAFARMA — LIVE INTELLIGENCE${RESET}  ${DIM}(${BASE_URL}, atualiza a cada ${EVENTS_INTERVAL_MS / 1000}s, Ctrl+C sai)${RESET}\n`);
  console.log(
    `Online: ${GREEN}${summary.onlineUsers}${RESET}  Idle: ${summary.idleUsers}  ` +
    `Ativações/5min: ${summary.activationsLast5Min}  Inválidas/5min: ${summary.invalidAttemptsLast5Min}  ` +
    `Eventos de segurança/5min: ${summary.securityEventsLast5Min}\n`,
  );

  console.log(`${BOLD}SESSÕES ATIVAS (${sessions.sessions?.length ?? 0})${RESET}`);
  for (const session of (sessions.sessions ?? []).slice(0, 8)) {
    console.log(`  ${session.presence === "online" ? GREEN + "●" + RESET : DIM + "○" + RESET} ${session.profileId}  ${DIM}${session.levelName} · ${session.points}pts${RESET}`);
  }

  console.log(`\n${BOLD}EVENTOS${RESET}`);
  if (!state.events.length) console.log(`  ${DIM}Nenhum evento ainda.${RESET}`);
  for (const event of state.events.slice(0, MAX_ROWS)) {
    const color = SEVERITY_COLOR[event.severity] || SEVERITY_COLOR.info;
    const loc = formatLocation(event);
    const parts = [
      event.actorProfileId ? event.actorProfileId : null,
      event.ip || null,
      loc || null,
      event.device || null,
      event.reason || null,
    ].filter(Boolean).join("  ·  ");
    console.log(`  ${DIM}${formatDate(event.createdAt)}${RESET}  ${color}${event.type}${RESET}  ${DIM}${parts}${RESET}`);
  }
}

async function auditTick(state) {
  const result = await apiGet("/api/admin/audit-logs");
  state.records = result.records ?? [];
  clearScreen();
  console.log(`${BOLD}${CYAN}VERIFICAFARMA — AUDIT LOG${RESET}  ${DIM}(${BASE_URL}, atualiza a cada ${AUDIT_INTERVAL_MS / 1000}s, Ctrl+C sai)${RESET}\n`);
  for (const record of state.records.slice(0, MAX_ROWS)) {
    const resultColor = record.result === "success" ? GREEN : "\x1b[31m";
    console.log(
      `  ${DIM}${formatDate(record.createdAt)}${RESET}  ${resultColor}${record.result.padEnd(7)}${RESET}  ` +
      `${BOLD}${record.action}${RESET}  ${DIM}actor=${record.actor} ip=${record.ip || "—"}${record.resource ? ` ${record.resource}${record.resourceId ? "#" + record.resourceId : ""}` : ""}${RESET}`,
    );
  }
}

async function loop(tick, intervalMs, state) {
  for (;;) {
    try {
      await tick(state);
    } catch (error) {
      console.error(`\n${DIM}erro ao atualizar: ${error instanceof Error ? error.message : error}${RESET}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

process.on("SIGINT", () => {
  process.stdout.write("\n");
  process.exit(0);
});

await login();
if (MODE === "audit") {
  await loop(auditTick, AUDIT_INTERVAL_MS, { records: [] });
} else {
  await loop(liveTick, EVENTS_INTERVAL_MS, { cursor: 0, events: [] });
}
