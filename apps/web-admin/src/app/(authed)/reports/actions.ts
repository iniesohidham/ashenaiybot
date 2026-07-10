"use server";

import { revalidatePath } from "next/cache";
import { adminApi, type ReportResolutionAction } from "@/lib/admin-api";

/** US-7.2 — "resolving a report updates its status and logs the acting moderator" (the acting admin's id comes from the session server-side, inside resolveReport() on bot-api — never passed from the client). */
export async function resolveReportAction(id: string, action: ReportResolutionAction, banReason?: string): Promise<void> {
  await adminApi.reports.resolve(id, action, banReason);
  revalidatePath("/reports");
}

export async function resolveBanAppealAction(id: string, outcome: "upheld" | "reversed"): Promise<void> {
  await adminApi.banAppeals.resolve(id, outcome);
  revalidatePath("/reports");
}
