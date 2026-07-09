import { z } from "zod";

// Shared between the bot's inline Like/Pass buttons and the Mini App's
// swipe deck (EPIC 6, US-6.4) so both surfaces call recordSwipeAndCheckMatch()
// with the exact same validated shape — see G5 dual-surface parity.
export const swipeActionSchema = z.object({
  targetUserId: z.string().min(1),
  action: z.enum(["like", "pass"]),
});

export type SwipeActionInput = z.infer<typeof swipeActionSchema>;
