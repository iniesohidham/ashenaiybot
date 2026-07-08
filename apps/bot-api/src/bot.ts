import { Bot } from "grammy";
import { Redis } from "ioredis";
import type { BotContext } from "./bot/context.js";
import { identityMiddleware } from "./bot/identityMiddleware.js";
import { createInMemoryAwaitingInputStore } from "./bot/awaitingInput.js";
import { registerOnboardingHandlers } from "./bot/onboarding.js";
import { registerMatchingHandlers } from "./bot/matching.js";

/**
 * identityMiddleware (US-1.4) resolves/creates the internal User record for
 * every update. registerOnboardingHandlers (EPIC 2) wires the full
 * age-gate/gender/birth-date/bio/interests/photo onboarding and edit-profile
 * flow; registerMatchingHandlers (EPIC 3) wires the swipe/queue/match flow on
 * top of it — registered second so its handlers pick up the callback/text
 * data onboarding's handlers pass through via next() (see matching.ts).
 */
export function buildBot(token: string, miniAppUrl: string, redisUrl: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);
  bot.use(identityMiddleware);

  const awaitingInput = createInMemoryAwaitingInputStore();
  const redis = new Redis(redisUrl);

  registerOnboardingHandlers(bot, { awaitingInput, miniAppUrl });
  registerMatchingHandlers(bot, { awaitingInput, redis });

  // grammY's default error handler stops the bot and rethrows, which would
  // otherwise crash the whole process (this bot and the REST API share one
  // process — see index.ts) on any single update that throws, e.g. a
  // Telegram API error. Log and keep polling instead.
  bot.catch((err) => {
    console.error("[bot] unhandled error while processing update", err.ctx.update.update_id, err.error);
  });

  return bot;
}
