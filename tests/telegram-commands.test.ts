import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { handleTelegramCommand } = await import("../lib/telegram-commands");
const { createAdminCookie } = await import("../lib/admin-auth");
const { blockIp } = await import("../lib/ip-blocks");
const { seedMaterial, seedLicense, upsertProfile } = await import("./helpers/seed");

let db: ReturnType<typeof createFakeD1>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  env.TELEGRAM_BOT_TOKEN = "123:ABC";
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleTelegramCommand — /ajuda", () => {
  it("lists the available commands for /ajuda, /help and /start", async () => {
    for (const cmd of ["/ajuda", "/help", "/start"]) {
      const reply = await handleTelegramCommand(db as never, cmd);
      expect(reply).toContain("/sessoes");
      expect(reply).toContain("/revogar");
    }
  });

  it("mentions every real command — catches a command added to the switch but forgotten in the text", async () => {
    const reply = await handleTelegramCommand(db as never, "/ajuda");
    const everyCommand = [
      "/sessoes", "/revogar", "/ips", "/bloquear", "/desbloquear", "/resumo", "/limpar",
      "/produto", "/licenca", "/cliente", "/expirando", "/ultimos", "/saude", "/materiais",
      "/bloquearcliente", "/desbloquearcliente", "/ajuda",
    ];
    for (const command of everyCommand) {
      // Word-boundary-ish check so "/bloquear" doesn't false-positive-match
      // inside "/bloquearcliente" and mask a missing line for the shorter one.
      expect(reply, `esperava encontrar "${command}" no texto de ajuda`).toMatch(new RegExp(`(^|\\n)${command.replace("/", "\\/")}[ \\[<—]`));
    }
  });

  it("an unrecognized command says so and still shows help", async () => {
    const reply = await handleTelegramCommand(db as never, "/blablabla");
    expect(reply).toContain("não reconhecido");
    expect(reply).toContain("/sessoes");
  });

  it("strips a trailing @botname (how Telegram formats commands in group chats)", async () => {
    const reply = await handleTelegramCommand(db as never, "/ajuda@meu_bot");
    expect(reply).toContain("/sessoes");
  });
});

describe("handleTelegramCommand — /sessoes and /revogar", () => {
  it("reports no active sessions when there are none", async () => {
    expect(await handleTelegramCommand(db as never, "/sessoes")).toContain("Nenhuma sessão");
  });

  it("lists an active session with admin/device/ip, and /revogar with its short id ends it", async () => {
    db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, permissions_json, created_at) VALUES ('adm_1', 'owner', 'x', '[]', '2026-01-01T00:00:00.000Z')").run();
    const cookie = await createAdminCookie("adm_1", { ip: "1.2.3.4", device: "macOS / Chrome" });
    const sessionId = (db.raw.prepare("SELECT id FROM admin_sessions").get() as { id: string }).id;

    const list = await handleTelegramCommand(db as never, "/sessoes");
    expect(list).toContain("owner");
    expect(list).toContain("macOS / Chrome");
    expect(list).toContain(sessionId.slice(-8));

    const revoke = await handleTelegramCommand(db as never, `/revogar ${sessionId.slice(-8)}`);
    expect(revoke).toContain("encerrada");

    // Actually revoked, not just a nice-sounding reply.
    const row = db.raw.prepare("SELECT revoked_at AS revokedAt FROM admin_sessions WHERE id=?").get(sessionId) as { revokedAt: string | null };
    expect(row.revokedAt).not.toBeNull();
    void cookie; // only needed to trigger session creation
  });

  it("/revogar without an id asks for one instead of crashing", async () => {
    expect(await handleTelegramCommand(db as never, "/revogar")).toContain("Uso:");
  });

  it("/revogar with an id matching nothing says so", async () => {
    expect(await handleTelegramCommand(db as never, "/revogar zzzzzzzz")).toContain("Não encontrei");
  });
});

describe("handleTelegramCommand — /ips, /bloquear, /desbloquear", () => {
  it("reports no blocked IPs when there are none", async () => {
    expect(await handleTelegramCommand(db as never, "/ips")).toContain("Nenhum IP bloqueado");
  });

  it("/bloquear blocks an IP indefinitely, /ips shows it, /desbloquear removes it", async () => {
    const blockReply = await handleTelegramCommand(db as never, "/bloquear 5.6.7.8");
    expect(blockReply).toContain("bloqueado");

    const list = await handleTelegramCommand(db as never, "/ips");
    expect(list).toContain("5.6.7.8");
    expect(list).toContain("telegram-bot");

    const unblockReply = await handleTelegramCommand(db as never, "/desbloquear 5.6.7.8");
    expect(unblockReply).toContain("desbloqueado");
    expect(await handleTelegramCommand(db as never, "/ips")).toContain("Nenhum IP bloqueado");
  });

  it("/desbloquear on an IP that isn't blocked says so instead of pretending it worked", async () => {
    expect(await handleTelegramCommand(db as never, "/desbloquear 9.9.9.9")).toContain("não estava bloqueado");
  });

  it("shows an auto-block (from the login route) the same way as a manual one", async () => {
    await blockIp(db as never, "10.0.0.1", { reason: "sustained_admin_login_abuse", blockedBy: "auto", durationHours: 24 });
    const list = await handleTelegramCommand(db as never, "/ips");
    expect(list).toContain("10.0.0.1");
    expect(list).toContain("auto");
  });
});

describe("handleTelegramCommand — /resumo", () => {
  it("reports real zeros on an empty database rather than erroring", async () => {
    const reply = await handleTelegramCommand(db as never, "/resumo");
    expect(reply).toContain("Clientes: 0");
    expect(reply).toContain("Licenças ativas: 0");
  });

  it("counts customers, blocked customers and active licenses correctly", async () => {
    db.raw.prepare("INSERT INTO customer_profiles (id, first_seen, last_active, blocked) VALUES ('cus_1', '2026-01-01', '2026-01-01', 0)").run();
    db.raw.prepare("INSERT INTO customer_profiles (id, first_seen, last_active, blocked) VALUES ('cus_2', '2026-01-01', '2026-01-01', 1)").run();
    const reply = await handleTelegramCommand(db as never, "/resumo");
    expect(reply).toContain("Clientes: 2 (1 bloqueados)");
  });
});

describe("handleTelegramCommand — /limpar", () => {
  it("without chat context, explains it can't clear instead of crashing", async () => {
    const reply = await handleTelegramCommand(db as never, "/limpar");
    expect(reply).toContain("Não consigo limpar");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes the default 50-message range ending at this message's id, in one batch call", async () => {
    const reply = await handleTelegramCommand(db as never, "/limpar", { chatId: "999", messageId: 500 });
    expect(reply).toContain("50 mensagens");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { chat_id: string; message_ids: number[] };
    expect(body.chat_id).toBe("999");
    expect(body.message_ids).toHaveLength(50);
    expect(body.message_ids[0]).toBe(500);
    expect(body.message_ids[49]).toBe(451);
  });

  it("honors a custom count, capped at 200, splitting into batches of 100", async () => {
    const reply = await handleTelegramCommand(db as never, "/limpar 250", { chatId: "999", messageId: 1000 });
    expect(reply).toContain("200 mensagens");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBatch = JSON.parse(fetchMock.mock.calls[0][1].body).message_ids as number[];
    const secondBatch = JSON.parse(fetchMock.mock.calls[1][1].body).message_ids as number[];
    expect(firstBatch).toHaveLength(100);
    expect(secondBatch).toHaveLength(100);
  });

  it("never deletes message id 0 or below, even near the start of the chat", async () => {
    const reply = await handleTelegramCommand(db as never, "/limpar", { chatId: "999", messageId: 5 });
    expect(reply).toContain("5 mensagens");
    const ids = JSON.parse(fetchMock.mock.calls[0][1].body).message_ids as number[];
    expect(ids).toEqual([5, 4, 3, 2, 1]);
  });

  it("ignores a garbage argument and falls back to the default count", async () => {
    const reply = await handleTelegramCommand(db as never, "/limpar abc", { chatId: "999", messageId: 500 });
    expect(reply).toContain("50 mensagens");
  });
});

describe("handleTelegramCommand — /produto", () => {
  it("without an argument, explains usage", async () => {
    expect(await handleTelegramCommand(db as never, "/produto")).toContain("Uso:");
  });

  it("no match says so", async () => {
    expect(await handleTelegramCommand(db as never, "/produto inexistente")).toContain("Nenhum produto");
  });

  it("a single name match reports counts", async () => {
    const materialId = seedMaterial(db, { prefixCode: "LIPO", name: "LIPOLESS 2.5MG" });
    await seedLicense(db, materialId, { serial: "LIPO-AAAA-BBBB-CCCC-1111", status: "active" });
    await seedLicense(db, materialId, { serial: "LIPO-AAAA-BBBB-CCCC-2222", status: "active", ownerProfileId: "cus_owner" });
    await seedLicense(db, materialId, { serial: "LIPO-AAAA-BBBB-CCCC-3333", status: "revoked" });
    const reply = await handleTelegramCommand(db as never, "/produto lipoless");
    expect(reply).toContain("LIPOLESS 2.5MG (LIPO)");
    expect(reply).toContain("Licenças totais: 3");
    expect(reply).toContain("Já ativadas por clientes: 1");
    expect(reply).toContain("Revogadas: 1");
  });

  it("multiple name matches without an exact prefix ask to refine", async () => {
    seedMaterial(db, { prefixCode: "AAA1", name: "Produto Alfa 1" });
    seedMaterial(db, { prefixCode: "AAA2", name: "Produto Alfa 2" });
    const reply = await handleTelegramCommand(db as never, "/produto alfa");
    expect(reply).toContain("2 produtos encontrados");
  });

  it("an exact prefix match resolves even with other name matches around", async () => {
    seedMaterial(db, { prefixCode: "BETA", name: "Beta Um" });
    seedMaterial(db, { prefixCode: "BETB", name: "Beta Dois" });
    const reply = await handleTelegramCommand(db as never, "/produto BETA");
    expect(reply).toContain("Beta Um (BETA)");
  });
});

describe("handleTelegramCommand — /licenca", () => {
  it("without an id, explains usage", async () => {
    expect(await handleTelegramCommand(db as never, "/licenca")).toContain("Uso:");
  });

  it("an id that doesn't exist says so", async () => {
    expect(await handleTelegramCommand(db as never, "/licenca 999999")).toContain("Não encontrei");
  });

  it("reports the product, masked serial, status and dates for an unactivated license", async () => {
    const materialId = seedMaterial(db, { prefixCode: "CURA", name: "Curso A" });
    const licenseId = await seedLicense(db, materialId, { serial: "CURA-AAAA-BBBB-CCCC-9999" });
    const reply = await handleTelegramCommand(db as never, `/licenca ${licenseId}`);
    expect(reply).toContain(`Licença #${licenseId}`);
    expect(reply).toContain("CURA-••••-••••-••••-9999");
    expect(reply).toContain("Curso A");
    expect(reply).toContain("Status: ativa");
    expect(reply).toContain("não ativada");
  });

  it("reports a revoked license's status correctly, and accepts a leading #", async () => {
    const materialId = seedMaterial(db, { prefixCode: "REVK", name: "Revoke Material" });
    const licenseId = await seedLicense(db, materialId, { serial: "REVK-AAAA-BBBB-CCCC-8888", status: "revoked", activatedAt: "2026-01-02T00:00:00.000Z" });
    const reply = await handleTelegramCommand(db as never, `/licenca #${licenseId}`);
    expect(reply).toContain("Status: revogada");
    expect(reply).toContain("Ativada em:");
  });
});

describe("handleTelegramCommand — /cliente", () => {
  it("without an argument, explains usage", async () => {
    expect(await handleTelegramCommand(db as never, "/cliente")).toContain("Uso:");
  });

  it("no match says so", async () => {
    expect(await handleTelegramCommand(db as never, "/cliente zzzznotfound")).toContain("Nenhum cliente");
  });

  it("resolves by the end of the id and reports points/level/licenses/blocked", async () => {
    upsertProfile(db, "cus_abc123def456");
    db.raw.prepare("UPDATE customer_profiles SET points=150, level=3, level_name='Prata' WHERE id=?").run("cus_abc123def456");
    const materialId = seedMaterial(db, { prefixCode: "CURA", name: "Curso A" });
    await seedLicense(db, materialId, { serial: "CURA-AAAA-BBBB-CCCC-7777", ownerProfileId: "cus_abc123def456" });
    const reply = await handleTelegramCommand(db as never, "/cliente def456");
    expect(reply).toContain("Pontos: 150 | Nível: Prata (3)");
    expect(reply).toContain("Licenças ativas: 1");
    expect(reply).toContain("Bloqueado: não");
  });

  it("an ambiguous suffix lists the matches instead of guessing", async () => {
    upsertProfile(db, "cus_aaaa0001");
    upsertProfile(db, "cus_bbbb0001");
    const reply = await handleTelegramCommand(db as never, "/cliente 0001");
    expect(reply).toContain("2 clientes encontrados");
  });
});

describe("handleTelegramCommand — /bloquearcliente and /desbloquearcliente", () => {
  it("without an argument, explains usage", async () => {
    expect(await handleTelegramCommand(db as never, "/bloquearcliente")).toContain("Uso:");
  });

  it("blocks and then unblocks a resolved customer", async () => {
    upsertProfile(db, "cus_blockme");
    const blockReply = await handleTelegramCommand(db as never, "/bloquearcliente blockme");
    expect(blockReply).toContain("bloqueado");
    expect((db.raw.prepare("SELECT blocked FROM customer_profiles WHERE id=?").get("cus_blockme") as { blocked: number }).blocked).toBe(1);

    const unblockReply = await handleTelegramCommand(db as never, "/desbloquearcliente blockme");
    expect(unblockReply).toContain("desbloqueado");
    expect((db.raw.prepare("SELECT blocked FROM customer_profiles WHERE id=?").get("cus_blockme") as { blocked: number }).blocked).toBe(0);
  });

  it("a customer that doesn't exist says so instead of pretending it worked", async () => {
    expect(await handleTelegramCommand(db as never, "/bloquearcliente naoexiste")).toContain("Nenhum cliente");
  });
});

describe("handleTelegramCommand — /expirando", () => {
  it("reports none when nothing is expiring", async () => {
    expect(await handleTelegramCommand(db as never, "/expirando")).toContain("Nenhuma licença expirando");
  });

  it("lists active licenses expiring within the window, ignoring ones further out or already revoked", async () => {
    const materialId = seedMaterial(db, { prefixCode: "EXPR", name: "Expira Já" });
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const far = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await seedLicense(db, materialId, { serial: "EXPR-AAAA-BBBB-CCCC-1111", status: "active", expiresAt: soon });
    await seedLicense(db, materialId, { serial: "EXPR-AAAA-BBBB-CCCC-2222", status: "active", expiresAt: far });
    await seedLicense(db, materialId, { serial: "EXPR-AAAA-BBBB-CCCC-3333", status: "revoked", expiresAt: soon });
    const reply = await handleTelegramCommand(db as never, "/expirando 30");
    expect(reply).toContain("1 licença(s) expirando");
    expect(reply).toContain("Expira Já");
    expect(reply).toContain("1111");
    expect(reply).not.toContain("2222");
    expect(reply).not.toContain("3333");
  });
});

describe("handleTelegramCommand — /ultimos", () => {
  it("reports nothing when the audit log is empty", async () => {
    expect(await handleTelegramCommand(db as never, "/ultimos")).toContain("Nenhuma entrada");
  });

  it("lists recent entries newest first, with the product name when metadata has one", async () => {
    db.raw.prepare("INSERT INTO audit_logs (actor, action, resource, resource_id, result, metadata_json, created_at) VALUES ('owner','MATERIAL_CREATED','materials','7','success', ?, '2026-01-01T00:00:00.000Z')").run(JSON.stringify({ name: "LIPOLESS 2.5MG" }));
    db.raw.prepare("INSERT INTO audit_logs (actor, action, resource, resource_id, result, metadata_json, created_at) VALUES ('owner','LICENSE_REVOKED','licenses','9','failure', '{}', '2026-01-02T00:00:00.000Z')").run();
    const reply = await handleTelegramCommand(db as never, "/ultimos 5");
    const lines = reply.split("\n");
    expect(lines[1]).toContain("LICENSE_REVOKED"); // newest first
    expect(reply).toContain("LIPOLESS 2.5MG");
  });

  it("caps the count at 30 even if a larger number is requested", async () => {
    for (let i = 0; i < 35; i++) {
      db.raw.prepare("INSERT INTO audit_logs (actor, action, result, metadata_json, created_at) VALUES ('owner','X','success','{}', '2026-01-01T00:00:00.000Z')").run();
    }
    const reply = await handleTelegramCommand(db as never, "/ultimos 999");
    expect(reply).toContain("Últimas 30 entrada(s)");
  });
});

describe("handleTelegramCommand — /saude", () => {
  it("reports healthy when the database responds", async () => {
    expect(await handleTelegramCommand(db as never, "/saude")).toContain("✅");
  });
});

describe("handleTelegramCommand — /materiais", () => {
  it("reports none when nothing is registered", async () => {
    expect(await handleTelegramCommand(db as never, "/materiais")).toContain("Nenhum produto");
  });

  it("lists materials with their license counts", async () => {
    const materialId = seedMaterial(db, { prefixCode: "CURA", name: "Curso A" });
    await seedLicense(db, materialId, { serial: "CURA-AAAA-BBBB-CCCC-1111" });
    await seedLicense(db, materialId, { serial: "CURA-AAAA-BBBB-CCCC-2222" });
    seedMaterial(db, { prefixCode: "SEMU", name: "Sem Uso" });
    const reply = await handleTelegramCommand(db as never, "/materiais");
    expect(reply).toContain("Curso A (CURA) — 2 licença(s)");
    expect(reply).toContain("Sem Uso (SEMU) — 0 licença(s)");
  });
});
