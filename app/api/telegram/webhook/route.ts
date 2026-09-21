import { env } from "cloudflare:workers";
import { handleTelegramCommand } from "@/lib/telegram-commands";
import { sendTelegramAlert } from "@/lib/telegram";

function runtime() {
  return env as unknown as { DB: D1Database; TELEGRAM_CHAT_ID?: string; TELEGRAM_WEBHOOK_SECRET?: string };
}

/**
 * Telegram calls this directly from the public internet — there's no
 * cookie, no Origin header to check, none of this app's usual auth. Two
 * independent checks stand in for that:
 *
 * 1. `X-Telegram-Bot-Api-Secret-Token` — a random value only Telegram and
 *    this server know, set once via setWebhook's `secret_token` param.
 *    Rejects anyone POSTing here who isn't actually Telegram's servers.
 * 2. `message.chat.id` must match the one configured TELEGRAM_CHAT_ID.
 *    Telegram bots are discoverable by username — anyone can find this
 *    bot and message it — so passing check 1 (proving the request really
 *    came from Telegram) still isn't enough; the message itself has to
 *    have come from the owner's own chat, not a stranger's.
 *
 * Every other case (wrong chat, non-command text, unrecognized command)
 * returns 200 "ok" rather than an error — Telegram disables a webhook
 * that keeps failing, and "someone else messaged the bot" is an expected,
 * not exceptional, event.
 */
export async function POST(request: Request) {
  const { DB, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET } = runtime();
  if (!TELEGRAM_CHAT_ID || !TELEGRAM_WEBHOOK_SECRET) return new Response("not configured", { status: 503 });

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== TELEGRAM_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });

  const update = await request.json().catch(() => null) as { message?: { chat?: { id?: number | string }; text?: string } } | null;
  const message = update?.message;
  const chatId = message?.chat?.id?.toString();
  const text = message?.text?.trim();
  if (!chatId || chatId !== TELEGRAM_CHAT_ID || !text?.startsWith("/")) {
    return new Response("ok");
  }

  const reply = await handleTelegramCommand(DB, text);
  await sendTelegramAlert(reply);
  return new Response("ok");
}
