import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = { SESSION_SECRET: "s".repeat(32) };
vi.mock("cloudflare:workers", () => ({ env }));

const { handleTelegramCommand } = await import("../lib/telegram-commands");
const { createAdminCookie } = await import("../lib/admin-auth");
const { blockIp } = await import("../lib/ip-blocks");

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
