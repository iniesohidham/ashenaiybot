import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidInitDataError, validateInitData } from "./telegramInitData.js";

const BOT_TOKEN = "123456:ABC-TEST-TOKEN";

/**
 * Builds a real, correctly-signed initData string using the same official
 * algorithm, computed independently here (not by calling the code under
 * test) so the tests actually exercise validateInitData's acceptance logic.
 */
function signInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("validateInitData", () => {
  it("accepts a correctly-signed payload and parses the user", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 42, first_name: "Test", username: "testuser" });
    const initDataRaw = signInitData({ auth_date: authDate, user });

    const result = validateInitData(initDataRaw, BOT_TOKEN);

    expect(result.user).toEqual({
      id: 42,
      firstName: "Test",
      lastName: undefined,
      username: "testuser",
      languageCode: undefined,
    });
  });

  it("rejects a payload signed with the wrong bot token", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const initDataRaw = signInitData({ auth_date: authDate }, "wrong-token");

    expect(() => validateInitData(initDataRaw, BOT_TOKEN)).toThrow(InvalidInitDataError);
  });

  it("rejects a payload whose fields were tampered with after signing", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const initDataRaw = signInitData({ auth_date: authDate, user: JSON.stringify({ id: 1 }) });
    const tampered = initDataRaw.replace(
      encodeURIComponent(JSON.stringify({ id: 1 })),
      encodeURIComponent(JSON.stringify({ id: 999 })),
    );

    expect(() => validateInitData(tampered, BOT_TOKEN)).toThrow(InvalidInitDataError);
  });

  it("rejects a payload with no hash field", () => {
    expect(() => validateInitData("auth_date=123", BOT_TOKEN)).toThrow(InvalidInitDataError);
  });

  it("rejects an expired auth_date", () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 7200);
    const initDataRaw = signInitData({ auth_date: authDate });

    expect(() => validateInitData(initDataRaw, BOT_TOKEN, { maxAgeSeconds: 3600 })).toThrow(
      InvalidInitDataError,
    );
  });
});
