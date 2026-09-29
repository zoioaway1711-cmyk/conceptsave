#!/usr/bin/env node
/*
 * One-time setup of the store's crypto-checkout account (USDT/Tron).
 *
 *   node scripts/crypto-signup.mjs            → creates the account and saves the secrets
 *   node scripts/crypto-signup.mjs --dry-run  → only shows what it would do
 *
 * What it does, in order:
 *  1. Refuses if the Worker already has CRYPTO_API_KEY (no second account by accident).
 *  2. Generates a strong random webhook secret.
 *  3. POST /api/crypto/signup with the store name + webhook URL + secret.
 *     (The webhook URL/secret can ONLY be set here — there's no self-edit.)
 *  4. Writes a backup of the credentials OUTSIDE the repo (chmod 600) —
 *     the API key is shown only once by the provider and can't be recovered.
 *  5. Stores CRYPTO_API_KEY and CRYPTO_WEBHOOK_SECRET as Worker secrets
 *     via `wrangler secret put` (value piped through stdin, never printed).
 *
 * Nothing secret is printed to the terminal or written into the repository.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://crypto.sidebridgeswap.com";
const WORKER = process.env.WORKER_NAME ?? "site-creator-vinext-starter";
const STORE_NAME = process.env.STORE_NAME ?? "Save Concept";
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "https://saveconcept.com.br/api/loja/webhooks/crypto";
const BACKUP_DIR = process.env.BACKUP_DIR ?? join(homedir(), "Documents", "API");
const BACKUP_FILE = join(BACKUP_DIR, "crypto-checkout-credenciais.txt");
const dryRun = process.argv.includes("--dry-run");

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

function wrangler(args, input) {
  return spawnSync("npx", ["wrangler", ...args], { input, encoding: "utf8", stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"] });
}

console.log(`Conta crypto-checkout para "${STORE_NAME}"`);
console.log(`  webhook: ${WEBHOOK_URL}`);
console.log(`  Worker:  ${WORKER}`);
console.log(`  backup:  ${BACKUP_FILE}\n`);

// 1. Already configured?
const list = wrangler(["secret", "list", "--name", WORKER, "--format", "json"]);
if (list.status !== 0) fail(`Não consegui listar os secrets do Worker (faça login com "npx wrangler login").\n${list.stderr.slice(0, 400)}`);
if (/"CRYPTO_API_KEY"/.test(list.stdout)) fail("O Worker já tem CRYPTO_API_KEY. Nada foi feito (evita criar uma segunda conta).");
if (existsSync(BACKUP_FILE)) fail(`Já existe ${BACKUP_FILE}. Se a conta já foi criada, use essas credenciais; nada foi feito.`);

if (dryRun) {
  console.log("--dry-run: tudo pronto. Rode sem --dry-run para criar a conta de verdade.");
  process.exit(0);
}

// 2–3. Signup
const webhookSecret = randomBytes(32).toString("hex");
const res = await fetch(`${API}/api/crypto/signup`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: STORE_NAME, webhook_url: WEBHOOK_URL, webhook_secret: webhookSecret }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || typeof data.api_key !== "string" || !data.api_key.startsWith("ck_")) {
  fail(`Signup recusado (HTTP ${res.status}): ${typeof data.error === "string" ? data.error : "resposta inesperada"}`);
}

// 4. Backup first — the key can never be retrieved again.
mkdirSync(BACKUP_DIR, { recursive: true });
writeFileSync(
  BACKUP_FILE,
  [
    `crypto-checkout — credenciais da loja (criadas em ${new Date().toISOString()})`,
    `NÃO compartilhe. Guarde num gerenciador de senhas e apague este arquivo.`,
    ``,
    `merchant_id=${data.merchant_id}`,
    `name=${data.name ?? STORE_NAME}`,
    `CRYPTO_API_KEY=${data.api_key}`,
    `CRYPTO_WEBHOOK_SECRET=${webhookSecret}`,
    `webhook_url=${WEBHOOK_URL}`,
    ``,
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(BACKUP_FILE, 0o600);
console.log(`✔ Conta criada (merchant_id ${data.merchant_id}). Backup salvo em ${BACKUP_FILE}`);

// 5. Worker secrets (value via stdin, never echoed).
for (const [name, value] of [
  ["CRYPTO_API_KEY", data.api_key],
  ["CRYPTO_WEBHOOK_SECRET", webhookSecret],
]) {
  const r = wrangler(["secret", "put", name, "--name", WORKER], value);
  if (r.status !== 0) fail(`Falhou ao salvar ${name} no Worker. As credenciais estão no backup (${BACKUP_FILE}); rode "npx wrangler secret put ${name} --name ${WORKER}" e cole o valor de lá.`);
  console.log(`✔ Secret ${name} salvo no Worker`);
}
console.log("\nPronto. A opção Cripto aparece no checkout depois do próximo deploy.");
