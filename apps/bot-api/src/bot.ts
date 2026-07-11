import { Bot } from "grammy";
import { Redis } from "ioredis";
import type { BotContext } from "./bot/context.js";
import { createIdentityMiddleware } from "./bot/identityMiddleware.js";
import { createInMemoryAwaitingInputStore } from "./bot/awaitingInput.js";
import { registerOnboardingHandlers } from "./bot/onboarding.js";
import { registerMatchingHandlers } from "./bot/matching.js";
import { registerChatHandlers } from "./bot/chat.js";
import type { Logger } from "./lib/logger.js";

/**
 * identityMiddleware (US-1.4) resolves/creates the internal User record for
 * every update (and enforces bans + the ban-appeal flow, EPIC 5 US-5.4/5.5 —
 * it now needs the same awaitingInput store as onboarding.ts/matching.ts, so
 * that's built before it rather than after). registerChatHandlers (EPIC 4) is
 * registered FIRST — deliberately, not incidentally: it claims an update only
 * when the sender has an active chat session (or the update is one of its
 * own self-contained callback prefixes), deferring everything else via
 * next() to the ORIGINAL onboarding/matching chain below, unmodified from
 * EPIC 2/3. This ordering is what stops a stale onboarding awaitingInput
 * state (e.g. an abandoned profile-bio-edit) from ever having a chance to
 * hijack a message meant for the user's هم‌صحبت — see bot/chat.ts's own doc
 * comment for the full reasoning. registerOnboardingHandlers (EPIC 2) wires
 * the full age-gate/gender/birth-date/bio/interests/photo onboarding and
 * edit-profile flow; registerMatchingHandlers (EPIC 3) wires the swipe/
 * queue/match flow on top of it, registered after onboarding so its handlers
 * pick up the callback/text data onboarding passes through via next().
 */
export function buildBot(token: string, miniAppUrl: string, redisUrl: string, logger: Logger): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  const awaitingInput = createInMemoryAwaitingInputStore();
  const redis = new Redis(redisUrl);

  bot.use(createIdentityMiddleware({ awaitingInput }));

  registerChatHandlers(bot, { redis });
  registerOnboardingHandlers(bot, { awaitingInput, miniAppUrl });
  registerMatchingHandlers(bot, { awaitingInput, redis });

  // grammY's default error handler stops the bot and rethrows, which would
  // otherwise crash the whole process (this bot and the REST API share one
  // process — see index.ts) on any single update that throws, e.g. a
  // Telegram API error. Log and keep polling instead.
  bot.catch((err) => {
    logger.error(
      { event: "bot_unhandled_error", updateId: err.ctx.update.update_id, err: err.error },
      "unhandled error while processing update",
    );
  });

  return bot;
}
