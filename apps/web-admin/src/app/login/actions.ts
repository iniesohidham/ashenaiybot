"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { BASE_PATH } from "@/lib/base-path";

/**
 * US-7.1 — the officially-documented App Router pattern for a Credentials
 * form: signIn() throws internally to perform its redirect on success, so
 * only AuthError (bad credentials / bot-api rejected the login) is caught
 * here — anything else (the redirect signal) must propagate untouched.
 *
 * redirectTo must be BASE_PATH-prefixed explicitly, not a plain "/" — an
 * adversarial review traced through next-auth/@auth/core's own source and
 * found that its default redirect callback resolves a relative redirectTo
 * as `new URL(request).origin + redirectTo`, i.e. protocol+host only, with
 * NO awareness of Next's separate `basePath` config. A plain "/" therefore
 * lands the browser on `http://host/`, which nginx routes to a *different
 * app* (apps/web-miniapp) — not `http://host/admin`, this app's own root.
 */
export async function loginAction(_prevState: string | undefined, formData: FormData): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: BASE_PATH,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return "نام کاربری یا رمز عبور اشتباهه.";
    }
    throw err;
  }
}
