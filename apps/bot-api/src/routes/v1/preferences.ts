import type { FastifyInstance } from "fastify";
import { upsertPreferenceSchema } from "@ashena/shared";
import { createMiniAppAuthPreHandler } from "../../plugins/miniAppAuth.js";
import { getOrCreatePreference, upsertPreference } from "../../modules/matching/service.js";
import { sendApiError, zodErrorToFields } from "../../lib/apiError.js";
import { deriveOnboardingStep } from "../../modules/users/service.js";
import type { Env } from "../../env.js";

/** EPIC 6 (US-6.6) — wraps the same getOrCreatePreference/upsertPreference the bot's settings menu already uses (bot/matching.ts), so both surfaces read/write one MatchPreference row per user. */
export function registerPreferenceRoutes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">): void {
  const authenticate = createMiniAppAuthPreHandler(env.TELEGRAM_BOT_TOKEN);

  app.get("/api/v1/preferences", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    // Same guard as bot/matching.ts's settings menu, only reachable once
    // required onboarding is complete (mainMenuKeyboard -> menuSettings).
    if (deriveOnboardingStep(user) !== "complete") {
      return sendApiError(reply, 403, "ONBOARDING_INCOMPLETE", "Complete your profile before setting preferences.");
    }
    return getOrCreatePreference(user);
  });

  app.put("/api/v1/preferences", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    if (deriveOnboardingStep(user) !== "complete") {
      return sendApiError(reply, 403, "ONBOARDING_INCOMPLETE", "Complete your profile before setting preferences.");
    }
    const parsed = upsertPreferenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid preference input.", zodErrorToFields(parsed.error));
    }
    return upsertPreference(user.id, parsed.data);
  });
}
