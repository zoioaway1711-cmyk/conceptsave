import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

const env: Record<string, unknown> = {};
vi.mock("cloudflare:workers", () => ({ env }));

const { POST } = await import("../app/api/telegram/webhook/route");

let db: ReturnType<typeof createFakeD1>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
  env.DB = db;
  env.TELEGRAM_CHAT_ID = "8976669233";
  env.TELEGRAM_WEBHOOK_SECRET = "s3cr3t";
  env.TELEGRAM_BOT_TOKEN = "123:ABC";
  fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function webhookRequest(body: unknown, headers: Record<string, string> = { "x-telegram-bot-api-secret-token": "s3cr3t" }) {
  return new Request("https://verificafarma.example/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/telegram/webhook", () => {
  it("rejects outright when the secret token header is missing or wrong — never even looks at the body", async () => {
    const response = await POST(webhookRequest({ message: { chat: { id: 8976669233 }, text: "/resumo" } }, {}));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("silently ignores (200 ok) a message from any chat id other than the configured one — someone else found the bot", async () => {
    const response = await POST(webhookRequest({ message: { chat: { id: 111111 }, text: "/resumo" } }));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores plain text that isn't a command, from the right chat", async () => {
    const response = await POST(webhookRequest({ message: { chat: { id: 8976669233 }, text: "oi" } }));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("executes a real command from the authorized chat and replies via Telegram", async () => {
    const response = await POST(webhookRequest({ message: { chat: { id: 8976669233 }, text: "/resumo" } }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text as string;
    expect(text).toContain("Resumo do painel");
  });

  it("a malformed body never throws — responds ok and sends nothing", async () => {
    const response = await POST(new Request("https://verificafarma.example/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cr3t" },
      body: "not json",
    }));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("503s cleanly if the Telegram secrets aren't configured at all", async () => {
    delete env.TELEGRAM_WEBHOOK_SECRET;
    const response = await POST(webhookRequest({ message: { chat: { id: 8976669233 }, text: "/resumo" } }));
    expect(response.status).toBe(503);
  });
});
