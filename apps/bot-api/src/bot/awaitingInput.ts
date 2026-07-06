/**
 * Ephemeral per-user marker for "what free-text/photo input is the bot
 * currently expecting from this user" — needed to disambiguate an incoming
 * text/photo message during the optional bio/interests/photo onboarding
 * steps and the edit-profile flow (US-2.4, US-2.5, US-2.7), where the
 * required-field state alone (see deriveOnboardingStep) can't tell.
 *
 * Deliberately in-memory rather than Redis-backed: this is single-instance,
 * best-effort UI state (see PRD §6 — one `api` container), not the
 * matchmaking/session state Redis is provisioned for in later epics. Losing
 * it on a restart just means a rare stray message goes unrouted; the
 * required onboarding path never depends on it (it falls back to
 * deriveOnboardingStep), and edit-profile steps are always re-enterable via
 * the edit menu.
 */

// "interests" carries no free-text/photo expectation of its own (that step is
// callback-only) — it's tracked here purely so the int:done/int:skip
// handlers know whether they're mid-onboarding-chain or a standalone edit.
export type AwaitingField = "birth_date" | "bio" | "photo" | "interests";
export type AwaitingMode = "onboarding" | "edit";

export interface AwaitingInput {
  field: AwaitingField;
  mode: AwaitingMode;
}

export interface AwaitingInputStore {
  get(userId: string): AwaitingInput | null;
  set(userId: string, value: AwaitingInput): void;
  clear(userId: string): void;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export function createInMemoryAwaitingInputStore(
  now: () => number = Date.now,
  ttlMs: number = DEFAULT_TTL_MS,
): AwaitingInputStore {
  const entries = new Map<string, { value: AwaitingInput; expiresAt: number }>();

  return {
    get(userId) {
      const entry = entries.get(userId);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(userId);
        return null;
      }
      return entry.value;
    },
    set(userId, value) {
      entries.set(userId, { value, expiresAt: now() + ttlMs });
    },
    clear(userId) {
      entries.delete(userId);
    },
  };
}
