"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import type { PendingPhotoDto } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BASE_PATH } from "@/lib/base-path";
import { approvePhotoAction, getPendingPhotosAction, rejectPhotoAction } from "./actions";

const POLL_INTERVAL_MS = 10_000;

/** US-7.3 — "queue updates in near-real-time as new photos arrive (polling is acceptable)": refetches on an interval, client-side, so a moderator watching this screen sees new submissions without manually reloading. */
export function PhotoQueue({ initialPhotos }: { initialPhotos: PendingPhotoDto[] }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Bumped on every approve/reject so an in-flight poll response fetched
  // *before* that mutation committed can't land afterward and overwrite the
  // optimistic local removal — an adversarial review caught this race
  // (approve a photo right as a poll tick is in flight → the stale response
  // puts the just-approved photo back in the grid until the next tick).
  const requestIdRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const result = await getPendingPhotosAction();
        if (requestId === requestIdRef.current) setPhotos(result);
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function handleApprove(userId: string): Promise<void> {
    requestIdRef.current++;
    setPendingUserId(userId);
    setError(null);
    try {
      await approvePhotoAction(userId);
      setPhotos((prev) => prev.filter((p) => p.userId !== userId));
    } catch {
      // Same-codebase-wide "log and retry" isn't available client-side here
      // — surfacing the failure and re-enabling the buttons (via `finally`
      // below) is what matters: an adversarial review found the previous
      // version had no try/catch at all, so a rejected action left this
      // photo's buttons permanently disabled with zero feedback.
      setError("عملیات ناموفق بود. دوباره تلاش کن.");
    } finally {
      setPendingUserId(null);
    }
  }

  async function handleReject(userId: string): Promise<void> {
    requestIdRef.current++;
    setPendingUserId(userId);
    setError(null);
    try {
      await rejectPhotoAction(userId);
      setPhotos((prev) => prev.filter((p) => p.userId !== userId));
    } catch {
      setError("عملیات ناموفق بود. دوباره تلاش کن.");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">عکسی در انتظار بررسی نیست.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <Card key={photo.userId} className="overflow-hidden">
              {/* Plain <img>, not next/image: this is proxied, auth-gated bytes, not an optimizable static asset. */}
              <img
                src={`${BASE_PATH}/api/photos/${photo.userId}`}
                alt="عکس در انتظار بررسی"
                className="aspect-square w-full object-cover"
              />
              <CardContent className="flex items-center justify-between gap-2 p-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingUserId === photo.userId}
                  onClick={() => handleReject(photo.userId)}
                  className="flex-1 text-destructive"
                >
                  <X className="h-4 w-4" />
                  رد
                </Button>
                <Button
                  size="sm"
                  disabled={pendingUserId === photo.userId}
                  onClick={() => handleApprove(photo.userId)}
                  className="flex-1"
                >
                  <Check className="h-4 w-4" />
                  تأیید
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
