import { beforeAll, describe, expect, it } from "vitest";
import { enqueueEvent, pendingEvents, withTenant } from "@velaq/db";
import { type TestDatabase, asSuperuser, testDatabase } from "@velaq/db/testing";
import { relayTenant } from "../src/relay.js";

const T = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d1e0a";
let db: TestDatabase;

beforeAll(async () => {
  db = await testDatabase("business");
  await asSuperuser(db, (admin) => admin.query("INSERT INTO tenants (id, name) VALUES ($1,'Acme')", [T]));
});

describe("outbox relay", () => {
  it("publishes pending events once and marks them dispatched", async () => {
    for (let i = 1; i <= 3; i++) {
      await withTenant(db.app, T, (tx) => enqueueEvent(tx, {
        id: `0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d400${i}`, type: "people.EmployeeHired",
        idempotencyKey: `k${i}`, dataClass: "internal", payload: { personId: `p${i}` },
      }));
    }
    const sent: string[] = [];
    expect(await relayTenant(db.app, T, async (_t, e) => { sent.push(e.id); })).toBe(3);
    expect(sent).toHaveLength(3);
    expect(await relayTenant(db.app, T, async () => { throw new Error("should not publish again"); })).toBe(0);
    expect(await withTenant(db.app, T, (tx) => pendingEvents(tx))).toHaveLength(0);
  });

  it("leaves events pending if publishing fails, so they are retried", async () => {
    await withTenant(db.app, T, (tx) => enqueueEvent(tx, {
      id: "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d4010", type: "people.EmployeeHired",
      idempotencyKey: "retry", dataClass: "internal", payload: { personId: "p9" },
    }));
    await expect(relayTenant(db.app, T, async () => { throw new Error("broker down"); })).rejects.toThrow();
    expect(await withTenant(db.app, T, (tx) => pendingEvents(tx))).toHaveLength(1);
  });
});
