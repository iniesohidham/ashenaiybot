"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { INTEREST_OPTIONS } from "@ashena/shared";
import type { PublicCandidateDto } from "@/lib/api";
import { api } from "@/lib/api";
import { AuthedImg } from "@/components/authed-media";

const SWIPE_THRESHOLD_PX = 100;
export const SWIPE_ANIMATION_MS = 180;

export interface SwipeCardHandle {
  swipe: (action: "like" | "pass") => void;
}

interface SwipeCardProps {
  candidate: PublicCandidateDto;
  onSwiped: (action: "like" | "pass") => void;
}

const interestLabel = (value: string): string =>
  INTEREST_OPTIONS.find((option) => option.value === value)?.labelFa ?? value;

/**
 * US-6.4: drag-to-swipe (right = like, left = pass), plus an imperative
 * `swipe()` handle the parent's Like/Pass buttons call so the tap
 * alternative (required by the AC for accessibility) plays the exact same
 * exit animation and calls the exact same onSwiped callback as a completed
 * drag — not a separate code path.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard({ candidate, onSwiped }, ref) {
  const [dragX, setDragX] = useState(0);
  const [exiting, setExiting] = useState<"like" | "pass" | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);

  function triggerSwipe(action: "like" | "pass") {
    setExiting(action);
    setTimeout(() => onSwiped(action), SWIPE_ANIMATION_MS);
  }

  useImperativeHandle(ref, () => ({ swipe: triggerSwipe }));

  function handlePointerDown(e: React.PointerEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setDragX(e.clientX - startX.current);
  }

  function handlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (Math.abs(dragX) > SWIPE_THRESHOLD_PX) {
      triggerSwipe(dragX > 0 ? "like" : "pass");
    } else {
      setDragX(0);
    }
  }

  const translateX = exiting ? (exiting === "like" ? 600 : -600) : dragX;
  const rotate = translateX / 20;
  const likeOpacity = Math.min(Math.max(dragX / SWIPE_THRESHOLD_PX, 0), 1);
  const passOpacity = Math.min(Math.max(-dragX / SWIPE_THRESHOLD_PX, 0), 1);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative touch-none select-none rounded-2xl border border-border bg-card shadow-md"
      style={{
        transform: `translateX(${translateX}px) rotate(${rotate}deg)`,
        transition: dragging.current ? "none" : "transform 180ms ease-out",
      }}
    >
      <div
        className="absolute left-4 top-4 rounded-lg border-2 border-emerald-500 px-2 py-1 text-sm font-bold text-emerald-500"
        style={{ opacity: exiting === "like" ? 1 : likeOpacity }}
      >
        LIKE
      </div>
      <div
        className="absolute right-4 top-4 rounded-lg border-2 border-rose-500 px-2 py-1 text-sm font-bold text-rose-500"
        style={{ opacity: exiting === "pass" ? 1 : passOpacity }}
      >
        PASS
      </div>

      <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-t-2xl bg-muted">
        {candidate.hasApprovedPhoto ? (
          <AuthedImg path={api.profilePhotoUrl(candidate.id)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl">👤</span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <p className="text-lg font-semibold">{candidate.age ? `${candidate.age} ساله` : ""}</p>
        {candidate.bio && <p className="text-sm text-muted-foreground">{candidate.bio}</p>}
        {candidate.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {candidate.interests.map((interest) => (
              <span key={interest} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {interestLabel(interest)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
