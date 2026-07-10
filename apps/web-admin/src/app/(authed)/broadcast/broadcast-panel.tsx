"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BROADCAST_MESSAGE_MAX_LENGTH } from "@ashena/shared";
import type { BroadcastDto } from "@/lib/admin-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { listBroadcastsAction, sendBroadcastAction } from "./actions";

const POLL_INTERVAL_MS = 5_000;
const STATUS_LABELS: Record<BroadcastDto["status"], string> = { pending: "در صف", sending: "در حال ارسال", completed: "تکمیل‌شده" };

function fmt(date: string): string {
  return new Date(date).toLocaleString("en-US");
}

interface BroadcastPanelProps {
  initialAudienceCount: number;
  initialBroadcasts: BroadcastDto[];
}

/** US-7.7 — broadcast tool: preview + explicit confirmation before sending, then live delivery-count polling (the worker sends one message at a time, rate-limited, so a broadcast to a large audience takes a while to actually finish). */
export function BroadcastPanel({ initialAudienceCount, initialBroadcasts }: BroadcastPanelProps) {
  const [message, setMessage] = useState("");
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts);
  const [isPending, startTransition] = useTransition();

  const hasInFlight = broadcasts.some((b) => b.status !== "completed");

  // Bumped on every send so a poll response fetched *before* the new
  // broadcast existed server-side can't land afterward and wholesale-
  // overwrite `broadcasts` (a plain list GET, not incremental), dropping
  // the just-created broadcast from view — an adversarial review caught
  // this as a worse variant of the same race photo-queue.tsx has: unlike
  // there, this one can be permanent rather than self-correcting, since if
  // every OTHER broadcast in that stale response is already "completed",
  // `hasInFlight` recomputes to false and the poll stops entirely.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!hasInFlight) return;
    const interval = setInterval(() => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const result = await listBroadcastsAction();
        if (requestId === requestIdRef.current) setBroadcasts(result);
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasInFlight]);

  async function handleSend(): Promise<void> {
    requestIdRef.current++;
    const created = await sendBroadcastAction(message.trim());
    setBroadcasts((prev) => [created, ...prev]);
    setMessage("");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <CardTitle>پیام همگانی جدید</CardTitle>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={BROADCAST_MESSAGE_MAX_LENGTH}
            placeholder="متن پیامی که برای همه کاربران فعال ارسال می‌شه..."
            className="min-h-32"
          />
          <p className="text-xs text-muted-foreground">
            {message.length}/{BROADCAST_MESSAGE_MAX_LENGTH} · گیرندگان فعلی: {initialAudienceCount.toLocaleString("en-US")} کاربر فعال
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!message.trim()} className="w-fit">
                پیش‌نمایش و ارسال
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>این پیام برای {initialAudienceCount.toLocaleString("en-US")} کاربر ارسال بشه؟</AlertDialogTitle>
                <AlertDialogDescription className="whitespace-pre-wrap text-foreground">{message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction disabled={isPending} onClick={() => startTransition(handleSend)}>
                  تأیید ارسال
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <CardTitle>تاریخچه پیام‌های همگانی</CardTitle>
          {broadcasts.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز پیام همگانی‌ای ارسال نشده.</p>
          ) : (
            broadcasts.map((b) => (
              <div key={b.id} className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0">
                <p className="text-sm">{b.message}</p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABELS[b.status]} · موفق: {b.successCount} · ناموفق: {b.failureCount} / {b.totalTargeted} · {fmt(b.createdAt)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
