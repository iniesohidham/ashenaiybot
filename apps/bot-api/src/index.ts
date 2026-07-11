import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";
import { buildBot } from "./bot.js";
import { createLogger } from "./lib/logger.js";

const env = loadEnv();
// One process, two logical services (see server.ts/bot.ts) — each gets its
// own `service` field via a dedicated logger rather than sharing "bot-api"
// for both, so a log line's origin is unambiguous (US-8.1).
const apiLogger = createLogger("bot-api");
const botLogger = createLogger("bot");

const app = buildServer(env, apiLogger);
const bot = buildBot(env.TELEGRAM_BOT_TOKEN, env.MINIAPP_PUBLIC_URL, env.REDIS_URL, botLogger);

await app.listen({ host: "0.0.0.0", port: env.PORT });
await bot.start();
