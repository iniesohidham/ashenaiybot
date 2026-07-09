"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { SwipeCard, type SwipeCardHandle } from "@/components/swipe-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ScreenError } from "@/components/screen-error";
import {
  GENERIC_ERROR_MESSAGE,
  LOADING_MESSAGE,
  SWIPE_CANDIDATE_EXPIRED_MESSAGE,
  SWIPE_EMPTY_BODY,
  SWIPE_EMPTY_TITLE,
  SWIPE_KEEP_BROWSING_LABEL,
  SWIPE_LIKE_LABEL,
  SWIPE_MATCH_BODY,
  SWIPE_MATCH_TITLE,
  SWIPE_PASS_LABEL,
  SWIPE_RATE_LIMITED_MESSAGE,
  SWIPE_START_CHAT_LABEL,
} from "@/lib/copy";

export default function SwipeDeckPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const cardRef = useRef<SwipeCardHandle>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [matchedId, setMatchedId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["candidate"],
    queryFn: api.getNextCandidate,
  });

  const swipeMutation = useMutation({
    mutationFn: (action: "like" | "pass") => {
      if (!data?.candidate) return Promise.reject(new Error("no candidate"));
      return api.swipe({ targetUserId: data.candidate.id, action });
    },
    onSuccess: (result) => {
      if (result.matched && result.matchId) {
        setMatchedId(result.matchId);
      }
      void queryClient.invalidateQueries({ queryKey: ["candidate"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "CANDIDATE_EXPIRED") {
        setNotice(SWIPE_CANDIDATE_EXPIRED_MESSAGE);
      } else if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        setNotice(SWIPE_RATE_LIMITED_MESSAGE);
      } else {
        setNotice(GENERIC_ERROR_MESSAGE);
      }
      void queryClient.invalidateQueries({ queryKey: ["candidate"] });
    },
  });

  function handleAction(action: "like" | "pass") {
    setNotice(null);
    cardRef.current?.swipe(action);
  }

  async function handleStartChat() {
    if (!matchedId) return;
    await api.startChat(matchedId);
    setMatchedId(null);
    // /chat resolves its own active session via getActiveChat() — no need
    // to thread the id through a query param.
    router.push("/chat");
  }

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{LOADING_MESSAGE}</p>;
  }
  if (isError) {
    return <ScreenError error={error} />;
  }

  return (
    <main className="flex flex-col gap-4 p-4">
      {notice && <p className="text-center text-sm text-muted-foreground">{notice}</p>}

      {data?.candidate ? (
        <>
          {/* key={candidate.id} forces a fresh SwipeCard instance per candidate — without it, the same instance's internal drag/exit-animation state (set mid-swipe) would carry over into the next card, leaving it rendered off-screen or pre-opacity'd instead of centered and interactive. */}
          <SwipeCard key={data.candidate.id} ref={cardRef} candidate={data.candidate} onSwiped={(action) => swipeMutation.mutate(action)} />
          <div className="flex justify-center gap-4">
            <Button variant="outline" size="lg" onClick={() => handleAction("pass")} aria-label={SWIPE_PASS_LABEL}>
              ✕ {SWIPE_PASS_LABEL}
            </Button>
            <Button size="lg" onClick={() => handleAction("like")} aria-label={SWIPE_LIKE_LABEL}>
              ♥ {SWIPE_LIKE_LABEL}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <h2 className="text-lg font-semibold">{SWIPE_EMPTY_TITLE}</h2>
          <p className="text-sm text-muted-foreground">{SWIPE_EMPTY_BODY}</p>
        </div>
      )}

      <Dialog open={matchedId !== null} onOpenChange={(open) => !open && setMatchedId(null)}>
        <DialogContent>
          <DialogTitle>{SWIPE_MATCH_TITLE}</DialogTitle>
          <DialogDescription>{SWIPE_MATCH_BODY}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchedId(null)}>
              {SWIPE_KEEP_BROWSING_LABEL}
            </Button>
            <Button onClick={handleStartChat}>{SWIPE_START_CHAT_LABEL}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
