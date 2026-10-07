#!/usr/bin/env node
// Checks whether the VerificaFarma / Save Concept site is up, layer by layer.
// Read-only: only GET requests, no credentials.
//
//   node .claude/skills/verificar-site/check-site.mjs            one round
//   node .claude/skills/verificar-site/check-site.mjs --watch 300   every 300 s (Ctrl+C to stop)
//   node .claude/skills/verificar-site/check-site.mjs --json     machine-readable
//
// Exit code: 0 = everything critical up, 1 = something critical down.

const MAIN = "https://saveconcept.com.br";
const WORKER = "https://site-creator-vinext-starter.zoioaway1711.workers.dev";
const ALT = "https://saveconcept.online";

// critical: counts for the exit code. layer: what a failure points at.
const CHECKS = [
  { name: "Worker direto (origem)", url: `${WORKER}/api/health`, expect: (r, b) => r.status === 200 && b.includes('"ok":true'), critical: true, layer: "worker" },
  { name: "Banco D1 via domínio", url: `${MAIN}/api/health`, expect: (r, b) => r.status === 200 && b.includes('"ok":true'), critical: true, layer: "domain" },
  { name: "Portal de seriais", url: `${MAIN}/index.html`, expect: (r, b) => r.status === 200 && b.includes("login-gate"), critical: true, layer: "domain" },
  { name: "Loja", url: `${MAIN}/loja`, expect: (r, b) => r.status === 200 && b.includes("/loja/produto/"), critical: true, layer: "domain" },
  { name: "Contato (WhatsApp)", url: `${MAIN}/api/contato`, expect: (r, b) => r.status === 200 && b.includes("wa.me"), critical: false, layer: "domain" },
  { name: "Domínio antigo saveconcept.online", url: `${ALT}/api/health`, expect: (r, b) => r.status === 200 && b.includes('"ok":true'), critical: false, layer: "alt" },
];

const TIMEOUT_MS = 15000;

async function probe(check) {
  // One retry after 3 s: a single blip (cold start, CPU limit 503) is not an outage.
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const url = `${check.url}${check.url.includes("?") ? "&" : "?"}_check=${started}`;
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "cache-control": "no-cache" } });
      const body = await response.text();
      last = { ok: check.expect(response, body), status: response.status, ms: Date.now() - started, error: "" };
    } catch (error) {
      last = { ok: false, status: 0, ms: Date.now() - started, error: error.cause?.code || error.name || String(error) };
    }
    if (last.ok) break;
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return { ...check, ...last };
}

function diagnose(results) {
  const down = (layer) => results.some((r) => r.layer === layer && r.critical && !r.ok);
  if (down("worker")) return "O Worker na Cloudflare não responde: o problema é na origem (deploy, limite de CPU, D1 ou subdomínio workers.dev desativado), não no domínio.";
  if (down("domain")) return "O Worker está no ar, mas saveconcept.com.br falha: o problema está entre o domínio e o Worker (DNS na KingHost, proxy da Vercel ou PROXY_TRUST_SECRET).";
  const alt = results.find((r) => r.layer === "alt");
  if (alt && !alt.ok) return "Site principal no ar. Só saveconcept.online falha (nameservers do registrador fora da Cloudflare desde 2026-10-05).";
  return "Tudo no ar.";
}

async function round(json) {
  const results = await Promise.all(CHECKS.map(probe));
  const up = results.every((r) => !r.critical || r.ok);
  const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (json) {
    console.log(JSON.stringify({ when, up, diagnosis: diagnose(results), results: results.map(({ expect, ...r }) => r) }));
  } else {
    console.log(`\n${up ? "✅ NO AR" : "❌ FORA DO AR"} · ${when}`);
    for (const r of results) {
      const mark = r.ok ? "✅" : r.critical ? "❌" : "⚠️ ";
      const detail = r.error ? `erro ${r.error}` : `HTTP ${r.status}`;
      console.log(`${mark} ${r.name.padEnd(34)} ${detail.padEnd(14)} ${String(r.ms).padStart(5)} ms  ${r.url}`);
    }
    console.log(`→ ${diagnose(results)}`);
  }
  return up;
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const watchAt = args.indexOf("--watch");
if (watchAt === -1) {
  process.exitCode = (await round(json)) ? 0 : 1;
} else {
  const seconds = Math.max(30, Number(args[watchAt + 1]) || 300);
  for (;;) {
    await round(json);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
