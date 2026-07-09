import { z } from "zod";

// Text-message send body for the Mini App's chat view (EPIC 6, US-6.5) —
// photo/voice send as multipart uploads instead, so they have no JSON schema
// here. Kept deliberately unbounded on length (same as the bot, which never
// caps grammY's incoming text) — checkText()/checkAndConsumeMessageRateLimit()
// are the actual content gates, not this schema.
export const sendTextMessageSchema = z.object({
  text: z.string().min(1),
});

export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
