"use server";

import { revalidatePath } from "next/cache";
import { adminApi, type ReportSeverity } from "@/lib/admin-api";

/** US-7.5 — admin-only banned-word/pattern list CRUD (bot-api's requireAdminRole is the authoritative gate). */
export async function createPatternAction(pattern: string, severity: ReportSeverity): Promise<void> {
  await adminApi.patterns.create({ pattern, severity });
  revalidatePath("/patterns");
}

export async function updatePatternAction(id: string, pattern: string, severity: ReportSeverity): Promise<void> {
  await adminApi.patterns.update(id, { pattern, severity });
  revalidatePath("/patterns");
}

export async function deletePatternAction(id: string): Promise<void> {
  await adminApi.patterns.remove(id);
  revalidatePath("/patterns");
}
