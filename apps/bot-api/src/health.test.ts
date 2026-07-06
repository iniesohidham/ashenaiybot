import { describe, expect, it } from "vitest";
import { checkHealth } from "./health.js";

describe("checkHealth", () => {
  it("reports ok when both dependencies respond", async () => {
    const result = await checkHealth({
      pingDb: async () => {},
      pingRedis: async () => {},
    });
    expect(result).toEqual({ status: "ok", db: "ok", redis: "ok" });
  });

  it("reports error with details when the db check fails", async () => {
    const result = await checkHealth({
      pingDb: async () => {
        throw new Error("connection refused");
      },
      pingRedis: async () => {},
    });
    expect(result.status).toBe("error");
    expect(result.db).toBe("error");
    expect(result.redis).toBe("ok");
    expect(result.details?.db).toBe("connection refused");
  });

  it("reports error with details when the redis check fails", async () => {
    const result = await checkHealth({
      pingDb: async () => {},
      pingRedis: async () => {
        throw new Error("timeout");
      },
    });
    expect(result.status).toBe("error");
    expect(result.redis).toBe("error");
    expect(result.details?.redis).toBe("timeout");
  });
});
