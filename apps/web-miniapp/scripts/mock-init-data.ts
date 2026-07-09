// Dev-only helper: signs a fake Telegram Mini App initData string with the
// real TELEGRAM_BOT_TOKEN from the repo root .env, using the exact
// algorithm apps/bot-api/src/lib/telegramInitData.ts validates against —
// there's no real Telegram client in this sandbox, so this is how the new
// REST routes/screens get manually exercised locally. Never used in
// production; this script is not part of any build output.
//
// Usage: npx tsx apps/web-miniapp/scripts/mock-init-data.ts [telegramId]

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvValue(key: string): string {
  const envPath = resolve(import.meta.dirname, "../../../.env");
  const contents = readFileSync(envPath, "utf-8");
  const match = contents.split("\n").find((line) => line.startsWith(`${key}=`));
  if (!match) {
    throw new Error(`${key} not found in ${envPath}`);
  }
  return match.slice(key.length + 1).trim();
}

function buildDataCheckString(params: URLSearchParams): string {
  const entries: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    entries.push(`${key}=${value}`);
  }
  entries.sort();
  return entries.join("\n");
}

const botToken = loadEnvValue("TELEGRAM_BOT_TOKEN");
const telegramId = Number(process.argv[2] ?? "111111111");

const user = {
  id: telegramId,
  first_name: "Test",
  last_name: "User",
  username: `test_user_${telegramId}`,
  language_code: "fa",
};

const params = new URLSearchParams();
params.set("user", JSON.stringify(user));
params.set("auth_date", String(Math.floor(Date.now() / 1000)));
params.set("query_id", "AAmock");

const dataCheckString = buildDataCheckString(params);
const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
params.set("hash", hash);

console.log(params.toString());
