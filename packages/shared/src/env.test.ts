import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("returns parsed values when the source matches the schema", () => {
    const schema = z.object({ PORT: z.coerce.number().int().positive() });
    const result = parseEnv(schema, { PORT: "3000" });
    expect(result.PORT).toBe(3000);
  });

  it("exits the process when a required variable is missing", () => {
    const schema = z.object({ REQUIRED: z.string().min(1) });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseEnv(schema, {})).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
