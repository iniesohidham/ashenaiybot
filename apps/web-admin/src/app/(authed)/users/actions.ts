"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminApi, type BanType } from "@/lib/admin-api";

/** US-7.4 — both roles can issue a ban directly from the user detail view, reusing EPIC 5's ban service (via bot-api's own route). */
export async function banUserAction(userId: string, type: BanType, reason: string, expiresInDays?: number): Promise<void> {
  await adminApi.users.ban(userId, { type, reason, expiresInDays });
  revalidatePath(`/users/${userId}`);
}

/** admin-only (enforced authoritatively by bot-api's requireAdminRole — this action just proxies). */
export async function reverseBanAction(userId: string): Promise<void> {
  await adminApi.users.reverseBan(userId);
  revalidatePath(`/users/${userId}`);
}

/** admin-only. Navigates back to the search screen since the detail page it was called from no longer resolves to anything meaningful. */
export async function deleteUserAction(userId: string): Promise<void> {
  await adminApi.users.remove(userId);
  redirect("/users");
}
