import { describe, expect, it } from "vitest";
import { CapabilityService } from "../src/capability.service.js";
import { InMemoryEntitlementStore } from "../src/entitlements.js";

const T = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d1e0a";

describe("CapabilityService", () => {
  it("denies an unknown feature", async () => {
    const svc = new CapabilityService(new InMemoryEntitlementStore(), new Set());
    expect((await svc.check(T, "XXX-999", true)).usable).toBe(false);
  });
  it("denies a feature that is not released, even if entitled and enabled", async () => {
    const store = new InMemoryEntitlementStore();
    store.set(T, "PER-001", { entitled: true, enabled: true });
    const svc = new CapabilityService(store, new Set());
    expect((await svc.check(T, "PER-001", true)).denial).toBe("not_released");
  });
  it("allows a released, entitled, enabled feature", async () => {
    const store = new InMemoryEntitlementStore();
    store.set(T, "PER-001", { entitled: true, enabled: true });
    const svc = new CapabilityService(store, new Set(["PER-001"]));
    expect((await svc.check(T, "PER-001", true)).usable).toBe(true);
  });
  it("denies when the principal lacks permission", async () => {
    const store = new InMemoryEntitlementStore();
    store.set(T, "PER-001", { entitled: true, enabled: true });
    const svc = new CapabilityService(store, new Set(["PER-001"]));
    expect((await svc.check(T, "PER-001", false)).denial).toBe("not_allowed");
  });
});
