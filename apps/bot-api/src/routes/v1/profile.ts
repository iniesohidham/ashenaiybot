import type { FastifyInstance } from "fastify";
import { InputFile } from "grammy";
import type { User } from "@ashena/db";
import { updateAccountSchema, upsertProfileSchema } from "@ashena/shared";
import { createMiniAppAuthPreHandler } from "../../plugins/miniAppAuth.js";
import { findProfileByUserId, upsertProfile } from "../../modules/profiles/service.js";
import { deriveOnboardingStep, updateUser } from "../../modules/users/service.js";
import { getOrCreatePreference } from "../../modules/matching/service.js";
import { sendTelegramFile } from "../../lib/telegramFile.js";
import { sendApiError, zodErrorToFields } from "../../lib/apiError.js";
import type { RouteDeps } from "./deps.js";
import type { Env } from "../../env.js";

/**
 * The raw Prisma `User` row carries `telegramId` (a BigInt — Fastify's
 * default JSON serializer can't even stringify one, on top of it being
 * exactly the identity field CLAUDE.md's anonymity rule says must never
 * reach a client) — every response derived from a `User` goes through this,
 * never `return user`/`return updateUser(...)` directly.
 */
async function toMeResponse(user: Pick<User, "id" | "gender" | "birthDate" | "status">) {
  const profile = await findProfileByUserId(user.id);
  return { id: user.id, gender: user.gender, birthDate: user.birthDate, status: user.status, profile };
}

/**
 * EPIC 1's "thin CRUD" REST skeleton (US-1.5), extended by EPIC 6 (US-6.3)
 * with photo upload/serving. Onboarding rules themselves (age gate, etc.)
 * live in EPIC 2/6's bot/Mini App form logic, not here.
 */
export function registerProfileRoutes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">, deps: Pick<RouteDeps, "api">): void {
  const authenticate = createMiniAppAuthPreHandler(env.TELEGRAM_BOT_TOKEN);
  const { api } = deps;

  app.get("/api/v1/me", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    return toMeResponse(user);
  });

  app.put("/api/v1/me", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }

    const parsed = updateAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid account input.", zodErrorToFields(parsed.error));
    }

    // Same re-editable-post-onboarding capability as the bot's edit menu
    // (CB.editGender/CB.editBirthDate) — updateUser() is the single write
    // path both already share.
    const { gender, birthDate } = parsed.data;
    const updated = await updateUser(user.id, {
      ...(gender !== undefined ? { gender } : {}),
      ...(birthDate !== undefined ? { birthDate: new Date(birthDate) } : {}),
    });
    // Mirrors onboarding.ts's birth-date-completion step: the moment
    // required onboarding becomes "complete", lazily create the default
    // MatchPreference right here rather than waiting for some later call —
    // without this, a Mini-App-only onboarder stays invisible in everyone
    // else's candidate queue (queryCandidateIds requires the row to exist)
    // until they happen to hit GET/PUT /preferences themselves. Idempotent
    // (getOrCreatePreference no-ops if the row already exists), so it's
    // harmless to also call this on every subsequent post-onboarding edit.
    if (deriveOnboardingStep(updated) === "complete") {
      await getOrCreatePreference(updated);
    }
    return toMeResponse(updated);
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

  app.post("/api/v1/profile/photo", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    const upload = await request.file();
    if (!upload) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "No file uploaded.");
    }

    // No chat partner exists at profile-edit time to send this to (unlike
    // chat media uploads, routes/v1/chat.ts), so the bytes are round-tripped
    // through the uploader's own chat purely to mint a Telegram file_id —
    // Profile.photoUrl must stay a file_id, same convention as
    // Message.contentRef (see CLAUDE.md's data model notes).
    const buffer = await upload.toBuffer();
    const sent = await api.sendPhoto(user.telegramId.toString(), new InputFile(buffer, upload.filename));
    const fileId = sent.photo.at(-1)?.file_id;
    if (!fileId) {
      return sendApiError(reply, 502, "UPSTREAM_ERROR", "Failed to process photo.");
    }

    // Same single write path onboarding.ts's photo step already uses —
    // upsertProfile() stamps photoSubmittedAt and resets moderation status.
    return upsertProfile(user.id, { photoUrl: fileId, photoModerationStatus: "pending" });
  });

  app.get<{ Params: { userId: string } }>(
    "/api/v1/profile/:userId/photo",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      const targetId = request.params.userId;
      // Profile.userId is a FK to User, so a nonexistent user can never
      // have a Profile row — no separate findUserById existence check
      // needed, findProfileByUserId alone already covers it.
      const profile = await findProfileByUserId(targetId);
      if (!profile?.photoUrl) {
        return sendApiError(reply, 404, "PHOTO_NOT_FOUND", "No photo available.");
      }
      // Own photo is always viewable regardless of moderation status
      // (reviewing your own pending/rejected upload); anyone else's is only
      // served once approved — same visibility rule the bot's candidate
      // card already applies (only shows approved photos to candidates).
      if (targetId !== user.id && profile.photoModerationStatus !== "approved") {
        return sendApiError(reply, 404, "PHOTO_NOT_FOUND", "No photo available.");
      }
      return sendTelegramFile(reply, api, env.TELEGRAM_BOT_TOKEN, profile.photoUrl);
    },
  );
}
