import { describe, expect, it } from "vitest";
import { otherPartyId } from "./service.js";

describe("otherPartyId", () => {
  const match = { userAId: "user-a", userBId: "user-b" };

  it("returns userB when given userA", () => {
    expect(otherPartyId(match, "user-a")).toBe("user-b");
  });

  it("returns userA when given userB", () => {
    expect(otherPartyId(match, "user-b")).toBe("user-a");
  });
});
