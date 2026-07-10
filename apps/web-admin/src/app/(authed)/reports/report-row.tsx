"use client";

import { useState, useTransition } from "react";
import { REPORT_REASON_OPTIONS, REPORT_RESOLUTION_ACTION_OPTIONS, type ReportReasonValue } from "@ashena/shared";
import type { ReportQueueEntryDto, ReportResolutionAction } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resolveReportAction } from "./actions";

const REASON_LABELS: Record<ReportReasonValue, string> = Object.fromEntries(
  REPORT_REASON_OPTIONS.map((o) => [o.value, o.labelFa]),
) as Record<ReportReasonValue, string>;

export function ReportRow({ entry }: { entry: ReportQueueEntryDto }) {
  const [action, setAction] = useState<ReportResolutionAction>("no_action");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const needsReason = action === "temporary_ban" || action === "permanent_ban";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{REASON_LABELS[entry.report.reason]}</p>
            <p className="text-xs text-muted-foreground">
              کاربر گزارش‌شده: <span className="font-mono">{entry.report.reportedUserId}</span>
            </p>
          </div>
          <Badge variant={entry.report.severity === "high" ? "destructive" : "outline"}>
            {entry.report.severity === "high" ? "اولویت بالا" : "عادی"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          گزارش‌های قبلی این کاربر: {entry.reportedUserHistory.pastReportCount} · بن‌های قبلی: {entry.reportedUserHistory.pastBanCount}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as ReportResolutionAction)}
            className="h-10 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {REPORT_RESOLUTION_ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.labelFa}
              </option>
            ))}
          </select>
          {needsReason ? (
            <Input
              placeholder="دلیل بن"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="max-w-xs"
            />
          ) : null}
          <Button
            size="sm"
            disabled={isPending || (needsReason && !reason.trim())}
            onClick={() =>
              startTransition(async () => {
                await resolveReportAction(entry.report.id, action, needsReason ? reason.trim() : undefined);
              })
            }
          >
            ثبت تصمیم
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
