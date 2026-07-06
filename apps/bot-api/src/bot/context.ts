import type { Context as BaseContext } from "grammy";
import type { User as InternalUser } from "@ashena/db";

export interface IdentityFlavor {
  /** Set by identityMiddleware before any command handler runs (US-1.4). */
  internalUser: InternalUser;
}

export type BotContext = BaseContext & IdentityFlavor;
