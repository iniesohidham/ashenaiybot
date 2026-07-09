import type { Api } from "grammy";
import type { FastifyReply } from "fastify";

/**
 * EPIC 6 — the Mini App runs in a plain browser webview, so it can't render
 * a Telegram `file_id` directly the way grammY's `ctx.replyWithPhoto` can (a
 * `<img src>` needs an actual URL). Resolves the file_id via the Bot API's
 * getFile, fetches the bytes server-side, and streams them back — never
 * exposing TELEGRAM_BOT_TOKEN to the client (a redirect to Telegram's file
 * CDN would leak it in the URL).
 */
export async function sendTelegramFile(
  reply: FastifyReply,
  api: Api,
  botToken: string,
  fileId: string,
): Promise<FastifyReply> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    return reply.code(404).send();
  }
  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return reply.code(502).send();
  }
  reply.header("content-type", upstream.headers.get("content-type") ?? "application/octet-stream");
  reply.header("cache-control", "private, max-age=3600");
  return reply.send(Buffer.from(await upstream.arrayBuffer()));
}
