import { describe, expect, it } from "vitest";
import {
  FEATURES, PERSONAL_FIRST_WAVE, effectiveOfflineLeaseHours, evaluateCapability,
  EventEnvelope, assertNoRestrictedKeys, featureById,
} from "../src/index.js";

describe("feature registry", () => {
  it("has 86 features: 67 business, 16 personal, 3 marketplace", () => {
    expect(FEATURES).toHaveLength(86);
    expect(FEATURES.filter((f) => f.product === "business")).toHaveLength(67);
    expect(FEATURES.filter((f) => f.product === "personal")).toHaveLength(16);
    expect(FEATURES.filter((f) => f.product === "marketplace")).toHaveLength(3);
  });
  it("has unique ids", () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });
  it("first Personal wave is all registered Personal features", () => {
    for (const id of PERSONAL_FIRST_WAVE) expect(featureById(id)?.product).toBe("personal");
  });
});

describe("offline lease", () => {
  it("defaults to 24 hours", () => expect(effectiveOfflineLeaseHours()).toBe(24));
  it("lets a tenant shorten it", () => expect(effectiveOfflineLeaseHours(8)).toBe(8));
  it("never lets a tenant extend it", () => expect(effectiveOfflineLeaseHours(72)).toBe(24));
  it("ignores invalid values", () => expect(effectiveOfflineLeaseHours(-1)).toBe(24));
});

describe("capability map", () => {
  const base = { released: true, entitled: true, enabled: true, allowed: true };
  it("allows when all checks pass", () => expect(evaluateCapability(base).usable).toBe(true));
  it.each([
    ["released", "not_released"], ["entitled", "not_entitled"], ["enabled", "not_enabled"], ["allowed", "not_allowed"],
  ] as const)("denies when %s fails", (k, denial) => {
    const r = evaluateCapability({ ...base, [k]: false });
    expect(r.usable).toBe(false);
    expect(r.denial).toBe(denial);
  });
  it("lists active enhancements sorted", () => {
    expect(evaluateCapability({ ...base, enhancements: { "PPL-004": true, "PPL-003": true, "PPL-002": false } }).enhancements)
      .toEqual(["PPL-003", "PPL-004"]);
  });
});

describe("events", () => {
  const ok = {
    id: "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d1e10", type: "people.EmployeeHired", version: 1,
    tenantId: "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d1e11", occurredAt: new Date().toISOString(),
    idempotencyKey: "k1", dataClass: "internal" as const, payload: { personId: "p1" },
  };
  it("parses a valid envelope", () => expect(EventEnvelope.parse(ok).replayable).toBe(true));
  it("rejects a bad type name", () => expect(() => EventEnvelope.parse({ ...ok, type: "bad" })).toThrow());
  it("rejects restricted keys, including nested", () => {
    expect(() => assertNoRestrictedKeys({ a: { salary: 1 } })).toThrow(/salary/);
    expect(() => assertNoRestrictedKeys({ personId: "p1" })).not.toThrow();
  });
});
