"use server";

import { revalidatePath } from "next/cache";
import { adminApi, type BroadcastDto } from "@/lib/admin-api";

/** US-7.7 — broadcast tool, admin-only (bot-api's requireAdminRole is the authoritative gate). */
export async function sendBroadcastAction(message: string): Promise<BroadcastDto> {
  const broadcast = await adminApi.broadcast.send(message);
  revalidatePath("/broadcast");
  return broadcast;
}

export async function listBroadcastsAction(): Promise<BroadcastDto[]> {
  return adminApi.broadcast.list();
}
