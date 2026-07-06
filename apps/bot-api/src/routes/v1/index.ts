import type { FastifyInstance } from "fastify";
import { upsertProfileSchema } from "@ashena/shared";
import { createMiniAppAuthPreHandler } from "../../plugins/miniAppAuth.js";
import { findProfileByUserId, upsertProfile } from "../../modules/profiles/service.js";
import { sendApiError, zodErrorToFields } from "../../lib/apiError.js";
import type { Env } from "../../env.js";

/**
 * EPIC 1's "thin CRUD" REST skeleton (US-1.5): versioned routes, Zod
 * validation with field-level errors, and one consistent error shape.
 * Onboarding rules themselves (age gate, etc.) land in EPIC 2/6.
 */
export function registerV1Routes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">): void {
  const authenticate = createMiniAppAuthPreHandler(env.TELEGRAM_BOT_TOKEN);

  app.get("/api/v1/me", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    const profile = await findProfileByUserId(user.id);
    return {
      id: user.id,
      gender: user.gender,
      birthDate: user.birthDate,
      status: user.status,
      profile,
    };
  });

  app.put("/api/v1/profile", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }

    const parsed = upsertProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Invalid profile input.",
        zodErrorToFields(parsed.error),
      );
    }

    return upsertProfile(user.id, parsed.data);
  });
}
