import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { registerProfileRoutes } from "./profile.js";
import { registerPreferenceRoutes } from "./preferences.js";
import { registerMatchingRoutes } from "./matching.js";
import { registerChatRoutes } from "./chat.js";
import { registerBlockRoutes } from "./blocks.js";
import { registerAccountRoutes } from "./account.js";
import type { RouteDeps } from "./deps.js";
import type { Env } from "../../env.js";

/**
 * EPIC 1's "thin CRUD" REST skeleton (US-1.5): versioned routes, Zod
 * validation with field-level errors, and one consistent error shape.
 * EPIC 6 (US-6.1..6.6) is what actually fills this surface out — every
 * handler below is a thin wrapper over the same modules/*\/service.ts
 * functions the bot already calls, split into one file per concern for
 * readability now that it's no longer just profile CRUD.
 */
export function registerV1Routes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">, deps: RouteDeps): void {
  app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  registerProfileRoutes(app, env, deps);
  registerPreferenceRoutes(app, env);
  registerMatchingRoutes(app, env, deps);
  registerChatRoutes(app, env, deps);
  registerBlockRoutes(app, env);
  registerAccountRoutes(app, env, deps);
}
