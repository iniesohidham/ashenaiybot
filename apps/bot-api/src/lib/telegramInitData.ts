import { createHmac, timingSafeEqual } from "node:crypto";

export class InvalidInitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInitDataError";
  }
}

export interface ValidatedInitDataUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}

export interface ValidatedInitData {
  authDate: Date;
  user?: ValidatedInitDataUser;
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

function parseTelegramUser(userJson: string): ValidatedInitDataUser {
  const parsed = JSON.parse(userJson) as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  return {
    id: parsed.id,
    firstName: parsed.first_name,
    lastName: parsed.last_name,
    username: parsed.username,
    languageCode: parsed.language_code,
  };
}

/**
 * Validates Telegram Mini App initData per the official algorithm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *   secret_key   = HMAC_SHA256(data=bot_token, key="WebAppData")
 *   expected_hash = HMAC_SHA256(data=data_check_string, key=secret_key)
 * Throws InvalidInitDataError on a missing/bad signature or an expired
 * auth_date — never trust a request this rejects (US-1.4).
 */
export function validateInitData(
  initDataRaw: string,
  botToken: string,
  options: { maxAgeSeconds?: number } = {},
): ValidatedInitData {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) {
    throw new InvalidInitDataError("initData is missing the hash field");
  }

  const dataCheckString = buildDataCheckString(params);
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");
  if (hashBuffer.length !== computedBuffer.length || !timingSafeEqual(hashBuffer, computedBuffer)) {
    throw new InvalidInitDataError("initData signature does not match");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    throw new InvalidInitDataError("initData is missing the auth_date field");
  }
  const authDate = new Date(Number(authDateRaw) * 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? 3600;
  if (Date.now() - authDate.getTime() > maxAgeSeconds * 1000) {
    throw new InvalidInitDataError("initData has expired");
  }

  const userRaw = params.get("user");
  return {
    authDate,
    user: userRaw ? parseTelegramUser(userRaw) : undefined,
  };
}
