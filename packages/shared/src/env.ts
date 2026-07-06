import type { z } from "zod";

/**
 * Parses `source` against `schema`; on failure, prints a human-readable list
 * of what's wrong (never the values themselves) and exits the process.
 * Used by every backend entrypoint so misconfiguration fails fast instead of
 * causing silent bugs downstream.
 */
export function parseEnv<Schema extends z.ZodTypeAny>(
  schema: Schema,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return result.data;
}
