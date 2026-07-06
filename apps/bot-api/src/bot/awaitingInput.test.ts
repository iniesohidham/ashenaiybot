import { describe, expect, it } from "vitest";
import { createInMemoryAwaitingInputStore } from "./awaitingInput.js";

describe("createInMemoryAwaitingInputStore", () => {
  it("returns null when nothing was set", () => {
    const store = createInMemoryAwaitingInputStore(() => 0);
    expect(store.get("user-1")).toBeNull();
  });

  it("returns what was set before it expires", () => {
    let time = 0;
    const store = createInMemoryAwaitingInputStore(() => time, 1000);
    store.set("user-1", { field: "bio", mode: "onboarding" });
    time = 999;
    expect(store.get("user-1")).toEqual({ field: "bio", mode: "onboarding" });
  });

  it("expires an entry after its TTL", () => {
    let time = 0;
    const store = createInMemoryAwaitingInputStore(() => time, 1000);
    store.set("user-1", { field: "bio", mode: "onboarding" });
    time = 1000;
    expect(store.get("user-1")).toBeNull();
  });

  it("clear removes an entry immediately", () => {
    const store = createInMemoryAwaitingInputStore(() => 0);
    store.set("user-1", { field: "photo", mode: "edit" });
    store.clear("user-1");
    expect(store.get("user-1")).toBeNull();
  });

  it("keeps separate state per user", () => {
    const store = createInMemoryAwaitingInputStore(() => 0);
    store.set("user-1", { field: "bio", mode: "onboarding" });
    expect(store.get("user-2")).toBeNull();
  });
});
