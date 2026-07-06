import { Bot } from "grammy";
import { APP_NAME } from "@ashena/shared";
import type { BotContext } from "./bot/context.js";
import { identityMiddleware } from "./bot/identityMiddleware.js";

/**
 * `/start` reply is still EPIC 0 "hello world" only — real onboarding
 * replaces this handler in EPIC 2. identityMiddleware (US-1.4) is real:
 * every update now resolves/creates the internal User record.
 */
export function buildBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);
  bot.use(identityMiddleware);

  bot.command("start", async (ctx) => {
    await ctx.reply(`${APP_NAME} is alive. Onboarding lands in EPIC 2.`);
  });

  return bot;
}
