"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "motion/react";
import { INTEREST_OPTIONS } from "@ashena/shared";
import { User } from "lucide-react";
import type { PublicCandidateDto } from "@/lib/api";
import { api } from "@/lib/api";
import { AuthedImg } from "@/components/authed-media";

const SWIPE_OFFSET_THRESHOLD = 120;
const SWIPE_VELOCITY_THRESHOLD = 500;
const SWIPE_EXIT_DISTANCE = 600;

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
 * US-6.4: drag-to-swipe (right = like, left = pass) with real velocity-aware
 * fling physics (motion's drag gesture + spring animate, not a fixed pixel
 * threshold alone), plus an imperative `swipe()` handle the parent's
 * Like/Pass buttons call so the tap alternative (required by the AC for
 * accessibility) drives the exact same motion value and calls the exact
 * same onSwiped callback as a completed drag — not a separate code path.
 * The parent renders this with `key={candidate.id}` (see app/page.tsx), so
 * every new candidate is a fresh mount — `x` starts back at 0 for free,
 * no manual reset needed.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard({ candidate, onSwiped }, ref) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const likeOpacity = useTransform(x, [20, SWIPE_OFFSET_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_OFFSET_THRESHOLD, -20], [1, 0]);
  const [exiting, setExiting] = useState(false);

  function triggerSwipe(action: "like" | "pass") {
    setExiting(true);
    const target = action === "like" ? SWIPE_EXIT_DISTANCE : -SWIPE_EXIT_DISTANCE;
    animate(x, target, {
      type: "spring",
      stiffness: 300,
      damping: 30,
      onComplete: () => onSwiped(action),
    });
  }

  useImperativeHandle(ref, () => ({ swipe: triggerSwipe }));

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const { offset, velocity } = info;
    const pastOffsetThreshold = Math.abs(offset.x) > SWIPE_OFFSET_THRESHOLD;
    const pastVelocityThreshold = Math.abs(velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    if (pastOffsetThreshold || pastVelocityThreshold) {
      triggerSwipe(offset.x > 0 || velocity.x > 0 ? "like" : "pass");
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 32 });
    }
  }

  return (
    <motion.div
      drag={exiting ? false : "x"}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      style={{ x, rotate }}
      className="relative touch-none select-none rounded-2xl border border-border bg-card shadow-lg"
    >
      <motion.div
        className="absolute left-4 top-4 rounded-lg border-2 border-emerald-500 px-2 py-1 text-sm font-bold text-emerald-500"
        style={{ opacity: likeOpacity }}
      >
        LIKE
      </motion.div>
      <motion.div
        className="absolute right-4 top-4 rounded-lg border-2 border-rose-500 px-2 py-1 text-sm font-bold text-rose-500"
        style={{ opacity: passOpacity }}
      >
        PASS
      </motion.div>

      <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-t-2xl bg-muted">
        {candidate.hasApprovedPhoto ? (
          <AuthedImg path={api.profilePhotoUrl(candidate.id)} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-16 w-16 text-muted-foreground" strokeWidth={1.5} />
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
    </motion.div>
  );
});
