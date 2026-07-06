import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";
import { buildBot } from "./bot.js";

const env = loadEnv();

const app = buildServer(env);
const bot = buildBot(env.TELEGRAM_BOT_TOKEN);

await app.listen({ host: "0.0.0.0", port: env.PORT });
await bot.start();
