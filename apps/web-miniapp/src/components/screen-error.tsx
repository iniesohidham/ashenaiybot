import { ApiError } from "@/lib/api";
import { ACCOUNT_INACTIVE_BODY, ACCOUNT_INACTIVE_TITLE, GENERIC_ERROR_MESSAGE } from "@/lib/copy";

/**
 * A 403 ACCOUNT_INACTIVE means this session's account was banned or
 * (self-)deleted (see plugins/miniAppAuth.ts) — e.g. right after using
 * Settings' delete-account action, every other screen's query will start
 * getting this. Shown in place of a generic error so it reads as "this is
 * expected", not a bug.
 */
export function ScreenError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="flex flex-col items-center gap-2 p-16 text-center">
        <h2 className="text-lg font-semibold">{ACCOUNT_INACTIVE_TITLE}</h2>
        <p className="text-sm text-muted-foreground">{ACCOUNT_INACTIVE_BODY}</p>
      </div>
    );
  }
  return <p className="p-4 text-sm text-destructive">{GENERIC_ERROR_MESSAGE}</p>;
}
