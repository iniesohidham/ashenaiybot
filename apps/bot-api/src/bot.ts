import { Bot } from "grammy";
import type { BotContext } from "./bot/context.js";
import { identityMiddleware } from "./bot/identityMiddleware.js";
import { createInMemoryAwaitingInputStore } from "./bot/awaitingInput.js";
import { registerOnboardingHandlers } from "./bot/onboarding.js";

/**
 * identityMiddleware (US-1.4) resolves/creates the internal User record for
 * every update. registerOnboardingHandlers (EPIC 2) wires the full
 * age-gate/gender/birth-date/bio/interests/photo onboarding and edit-profile
 * flow on top of it.
 */
export function buildBot(token: string, miniAppUrl: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);
  bot.use(identityMiddleware);

  registerOnboardingHandlers(bot, {
    awaitingInput: createInMemoryAwaitingInputStore(),
    miniAppUrl,
  });

  // grammY's default error handler stops the bot and rethrows, which would
  // otherwise crash the whole process (this bot and the REST API share one
  // process — see index.ts) on any single update that throws, e.g. a
  // Telegram API error. Log and keep polling instead.
  bot.catch((err) => {
    console.error("[bot] unhandled error while processing update", err.ctx.update.update_id, err.error);
  });

  return bot;
}
