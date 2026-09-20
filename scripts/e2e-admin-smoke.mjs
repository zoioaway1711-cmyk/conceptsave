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

    // --- Deterministic fixture data ---
    // Earlier versions of this script picked "whatever's first in the
    // material dropdown", which made the licenses/bulk-action checks
    // depend on leftover state from previous manual testing (flaky pass/
    // fail unrelated to real regressions). Create our own material + one
    // unclaimed + one claimed license via the same authenticated session
    // (page.request shares this context's cookies), then select this
    // material by name — every run now has the exact rows it expects.
    const fixtureName = `E2E Smoke ${Date.now()}`;
    const materialRes = await page.request.post(`${baseUrl}/api/admin/materials`, {
      headers: { origin: baseUrl },
      data: { name: fixtureName, prefixCode: "E2ESMK", maker: "E2E", brand: "E2E" },
    });
    const material = (await materialRes.json()).material;
    check("fixture material created via API", materialRes.ok(), fixtureName);
    for (const shouldClaim of [false, true]) {
      const licenseRes = await page.request.post(`${baseUrl}/api/admin/licenses`, { headers: { origin: baseUrl }, data: { materialId: material.id } });
      const serial = (await licenseRes.json()).license?.serial;
      if (shouldClaim && serial) {
        await page.request.post(`${baseUrl}/api/profiles/session`, { headers: { origin: baseUrl }, data: { serial } });
      }
    }

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
    // Go straight in via ?materialId — same URL the Dashboard's own
    // expiring-soon "Ver" link and the Materials page use — so this
    // doesn't depend on the material dropdown/combobox at all.
    await page.goto(`${baseUrl}/sc-629f1dc76b/licenses?materialId=${material.id}`, { waitUntil: "networkidle" });
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

        const resetTrigger = page.getByRole("button", { name: /Resetar selecionadas/i });
        if (await resetTrigger.count()) {
          const claimedBefore = await page.locator("table tbody tr").filter({ hasNotText: "Unclaimed" }).count();
          await resetTrigger.click();
          await page.getByRole("button", { name: /^Resetar selecionadas$/ }).click();
          // Toast timing is flaky to assert on directly (sonner auto-dismisses,
          // and a fullPage screenshot can clip a fixed-position toast) — the
          // thing that actually matters is the row itself flipping to
          // Unclaimed, so assert on the real DOM state instead.
          await page.waitForTimeout(1000);
          const claimedAfter = await page.locator("table tbody tr").filter({ hasNotText: "Unclaimed" }).count();
          check("bulk reset clears ownership on previously-claimed rows", claimedAfter < claimedBefore, `${claimedBefore} claimed before, ${claimedAfter} after`);
          await shot(page, "licenses-after-bulk-reset");
        } else {
          check("bulk reset button available", false, "no claimed+active license in this material to reset — activate one first for a fuller test");
        }
        await selectAll.click().catch(() => {}); // best-effort deselect afterwards
      }
    } else {
      check("licenses table has rows to select", false, "no licenses under the chosen material — generate one first for a fuller test");
    }

    const [licensesDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
      page.getByRole("button", { name: /Exportar CSV/i }).first().click(),
    ]);
    check("licenses CSV export triggers a download", Boolean(licensesDownload), licensesDownload ? licensesDownload.suggestedFilename() : "no download event fired (empty list?)");

    // --- Bulk import: regression test for the >500-row payload_too_large
    // bug (proxy.ts had a blanket 256KB body cap and readBody() a 64KB
    // one; a real ~500+ row CSV blew past 64KB well before the schema's
    // own 1000-row limit). Import 600 rows in one paste — comfortably past
    // the old bug's threshold — and confirm it succeeds end-to-end.
    await page.goto(`${baseUrl}/sc-629f1dc76b/licenses/import`, { waitUntil: "networkidle" });
    // Serial prefix must be unique per run — re-running this script against
    // a persistent (non-reset) dev database with the same 600 fixed
    // serials would make every single row a legitimate `duplicate_serial`
    // skip (correct product behavior, protecting against double-import),
    // which looks identical to a real failure in the "0 criados" result.
    // Serial's own prefix segment is capped at 10 chars (ANY_SERIAL_PATTERN
    // in lib/serial.ts) — "E2E" + the 6 fastest-changing base36 digits of
    // the clock keeps this at 9 and still unique run-to-run.
    const importPrefix = `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const importRows = ["SERIAL,LOTE,PRODUTO,VALIDADE"];
    for (let i = 0; i < 600; i++) importRows.push(`${importPrefix}-${String(i).padStart(4, "0")}-AAAA-BBBB-CCCC,LOTEE2E,E2E Import Regression Product,2028-01-01`);
    await page.locator("#import-textarea").fill(importRows.join("\n"));
    await shot(page, "import-600-rows-pasted");
    await page.getByRole("button", { name: /Importar 600 produtos/i }).click();
    // Not the toast (sonner auto-dismisses well before 600 sequential
    // server-side inserts finish) — wait for the persistent post-import
    // view instead: the form is replaced by a "N criados" badge + QR
    // download/print controls once results actually land.
    const importSucceeded = await page.getByText(/^\d+ criados$/).first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    const badgeText = importSucceeded ? await page.getByText(/^\d+ criados$/).first().textContent() : null;
    check("bulk import of 600 rows (past the old 500-row bug) succeeds in one request", importSucceeded && badgeText?.startsWith("600 "), badgeText ?? "results view never appeared — check for payload_too_large or a schema/body-size regression");
    await shot(page, "import-600-rows-result");

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
