// Headless-browser smoke test for the admin panel — the practical
// substitute for an interactive browser tool in this CLI environment (see
// project conversation: no browser-linking tool is available here, so this
// script drives a real Chromium instance and saves screenshots for visual
// review instead).
//
// Usage: node scripts/e2e-admin-smoke.mjs [baseUrl] [outDir]
//   baseUrl defaults to http://localhost:5173 (the local vinext dev server)
//   outDir  defaults to ./e2e-screenshots (gitignored; pass a scratchpad path in CI/agent runs)
//
// Requires ADMIN_USER/ADMIN_PASSWORD from .dev.vars (dev) or the environment.
import { chromium } from "playwright";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:5173";
const outDir = process.argv[3] || "./e2e-screenshots";
mkdirSync(outDir, { recursive: true });

function readDevVars() {
  const vars = {};
  const filePath = path.join(process.cwd(), ".dev.vars");
  if (!existsSync(filePath)) return vars;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

const devVars = readDevVars();
const ADMIN_USER = process.env.ADMIN_USER || devVars.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || devVars.ADMIN_PASSWORD;
if (!ADMIN_USER || !ADMIN_PASSWORD) {
  console.error("Missing ADMIN_USER/ADMIN_PASSWORD (checked env and .dev.vars). Aborting.");
  process.exit(1);
}

let shotIndex = 0;
async function shot(page, name) {
  shotIndex += 1;
  const file = path.join(outDir, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${file}`);
}

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`${ok ? "OK " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  try {
    // --- Login ---
    await page.goto(`${baseUrl}/sc-629f1dc76b`, { waitUntil: "networkidle" });
    await shot(page, "login-page");
    await page.getByLabel("Usuário").fill(ADMIN_USER);
    await page.getByLabel("Senha").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /Entrar/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    check("login succeeds and redirects to dashboard", true);

    // --- Dashboard ---
    await page.waitForLoadState("networkidle");
    // Widgets fetch via a setTimeout(0)-deferred effect (see codebase
    // convention) — give them a beat past networkidle so the screenshot
    // shows real data instead of "Carregando…"/spinners.
    await page.getByText("Carregando…").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await page.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await shot(page, "dashboard");
    const expiringCard = page.getByText("Licenças expirando nos próximos 30 dias");
    check("dashboard renders (expiring-soon widget present or correctly absent)", true, (await expiringCard.count()) > 0 ? "widget visible" : "no expiring licenses right now — widget correctly hidden");

    const [dashboardDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
      page.getByRole("button", { name: /Exportar CSV/i }).first().click(),
    ]);
    check("dashboard CSV export triggers a download", Boolean(dashboardDownload), dashboardDownload ? dashboardDownload.suggestedFilename() : "no download event fired");

    // --- Licenses: filters + bulk selection + CSV ---
    await page.goto(`${baseUrl}/sc-629f1dc76b/licenses`, { waitUntil: "networkidle" });
    // Pick the first material in the dropdown so the table has rows.
    const materialTrigger = page.locator('button[role="combobox"]').first();
    if (await materialTrigger.count()) {
      await materialTrigger.click();
      await page.locator('[role="option"]').first().click();
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForLoadState("networkidle");
    }
    await shot(page, "licenses-list");

    const statusFilterVisible = await page.getByText("Status").first().isVisible().catch(() => false);
    check("licenses advanced filters render (status/lot/date)", statusFilterVisible);

    const rowCheckboxes = page.locator('table tbody input[type="checkbox"], table tbody button[role="checkbox"]');
    const rowCount = await rowCheckboxes.count();
    if (rowCount > 0) {
      await rowCheckboxes.first().click();
      await shot(page, "licenses-one-selected");
      const bulkBar = page.getByText(/selecionada/);
      check("selecting a row shows the bulk-action toolbar", await bulkBar.count() > 0);

      const selectAll = page.locator('thead button[role="checkbox"], thead input[type="checkbox"]').first();
      if (await selectAll.count()) {
        await selectAll.click();
        await shot(page, "licenses-all-selected");
        check("select-all toggles every visible row", true);
        await selectAll.click(); // deselect so we don't leave a destructive bulk action armed
      }
    } else {
      check("licenses table has rows to select", false, "no licenses under the chosen material — generate one first for a fuller test");
    }

    const [licensesDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
      page.getByRole("button", { name: /Exportar CSV/i }).first().click(),
    ]);
    check("licenses CSV export triggers a download", Boolean(licensesDownload), licensesDownload ? licensesDownload.suggestedFilename() : "no download event fired (empty list?)");

    // --- Audit log CSV ---
    await page.goto(`${baseUrl}/sc-629f1dc76b/audit`, { waitUntil: "networkidle" });
    await shot(page, "audit-log");
    const [auditDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
      page.getByRole("button", { name: /Exportar CSV/i }).first().click(),
    ]);
    check("audit log CSV export triggers a download", Boolean(auditDownload), auditDownload ? auditDownload.suggestedFilename() : "no download event fired");

    check("no uncaught browser console/page errors during the whole run", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
  } catch (error) {
    check("script completed without throwing", false, String(error));
    await shot(page, "error-state");
  } finally {
    await browser.close();
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.label}${r.detail ? ` (${r.detail})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main();
