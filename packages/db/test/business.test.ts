import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { business, enqueueEvent, inScope, markDispatched, pendingEvents, withTenant } from "../src/index.js";
import { type TestDatabase, asSuperuser, testDatabase } from "../src/testing.js";

const A = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d1e0a";
const B = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d1e0b";

let db: TestDatabase;

beforeAll(async () => {
  db = await testDatabase("business");
  await asSuperuser(db, (admin) => admin.query("INSERT INTO tenants (id, name) VALUES ($1,'Acme'), ($2,'Beta')", [A, B]));
});

describe("business database: row level security", () => {
  it("fails closed when no tenant is bound", async () => {
    expect((await db.app.query("SELECT * FROM tenants")).rows).toHaveLength(0);
  });

  it("isolates tenants from each other", async () => {
    await withTenant(db.app, A, (tx) => tx.query("INSERT INTO feature_entitlements (feature_id, entitled, enabled) VALUES ('PPL-001',true,true)"));
    await withTenant(db.app, B, (tx) => tx.query("INSERT INTO feature_entitlements (feature_id, entitled, enabled) VALUES ('PPL-002',true,false)"));
    const a = await withTenant(db.app, A, (tx) => tx.query<{ feature_id: string }>("SELECT feature_id FROM feature_entitlements"));
    const b = await withTenant(db.app, B, (tx) => tx.query<{ feature_id: string }>("SELECT feature_id FROM feature_entitlements"));
    expect(a.rows.map((r) => r.feature_id)).toEqual(["PPL-001"]);
    expect(b.rows.map((r) => r.feature_id)).toEqual(["PPL-002"]);
  });

  it("fills the tenant from the bound scope", async () => {
    const r = await withTenant(db.app, A, (tx) => tx.query<{ tenant_id: string }>("SELECT tenant_id FROM feature_entitlements"));
    expect(r.rows.every((x) => x.tenant_id === A)).toBe(true);
  });

  it("blocks writing a row for another tenant", async () => {
    await expect(
      withTenant(db.app, A, (tx) => tx.query("INSERT INTO feature_entitlements (tenant_id, feature_id) VALUES ($1,'PPL-099')", [B])),
    ).rejects.toThrow();
  });

  it("rejects a non-UUID scope before touching the database", async () => {
    await expect(withTenant(db.app, "x'; DROP TABLE tenants;--", async () => 1)).rejects.toThrow(/UUID/);
  });

  it("keeps the audit log append-only for the app role", async () => {
    await withTenant(db.app, A, (tx) =>
      tx.query("INSERT INTO audit_log (id, action, entity) VALUES ($1,'create','employee')", ["0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d1f01"]));
    await expect(withTenant(db.app, A, (tx) => tx.query("UPDATE audit_log SET action = 'x'"))).rejects.toThrow();
    await expect(withTenant(db.app, A, (tx) => tx.query("DELETE FROM audit_log"))).rejects.toThrow();
  });

  it("limits the tenant offline lease to 24 hours", async () => {
    await expect(withTenant(db.app, A, (tx) => tx.query("UPDATE tenants SET offline_lease_hours = 72 WHERE id = $1", [A]))).rejects.toThrow();
  });

  it("puts a new payee account into a 48-hour cooling-off", async () => {
    const r = await withTenant(db.app, A, async (tx) => {
      await tx.query("INSERT INTO cdm_payees.payee_accounts (id, person_id, account_enc, account_hmac) VALUES ($1,$2,'\\x00','h')",
        ["0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d2001", "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d2002"]);
      return tx.query<{ status: string; hours: number }>(
        "SELECT status, EXTRACT(EPOCH FROM (usable_after - created_at))/3600 AS hours FROM cdm_payees.payee_accounts");
    });
    expect(r.rows[0]?.status).toBe("cooling_off");
    expect(Math.round(Number(r.rows[0]?.hours))).toBe(48);
  });

  it("works through the typed Drizzle client", async () => {
    const rows = await inScope(db.orm, A, (tx) =>
      tx.select().from(business.featureEntitlements).where(eq(business.featureEntitlements.featureId, "PPL-001")));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scopeId).toBe(A);
  });
});

describe("business database: transactional outbox", () => {
  const ev = (n: number) => ({
    id: `0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d30${String(n).padStart(2, "0")}`,
    type: "people.EmployeeHired", idempotencyKey: `hire-${n}`, dataClass: "internal" as const, payload: { personId: `p${n}` },
  });

  it("deduplicates by idempotency key", async () => {
    expect(await withTenant(db.app, A, (tx) => enqueueEvent(tx, ev(1)))).toBe(true);
    expect(await withTenant(db.app, A, (tx) => enqueueEvent(tx, { ...ev(1), id: ev(2).id }))).toBe(false);
  });

  it("refuses Restricted values in payloads", async () => {
    await expect(withTenant(db.app, A, (tx) => enqueueEvent(tx, { ...ev(3), payload: { salary: 500000 } }))).rejects.toThrow(/restricted/);
  });

  it("dispatches pending events once", async () => {
    const pending = await withTenant(db.app, A, (tx) => pendingEvents(tx));
    expect(pending.length).toBeGreaterThan(0);
    await withTenant(db.app, A, (tx) => markDispatched(tx, pending.map((p) => p.id)));
    expect(await withTenant(db.app, A, (tx) => pendingEvents(tx))).toHaveLength(0);
  });

  it("does not show tenant A events to tenant B", async () => {
    expect(await withTenant(db.app, B, (tx) => pendingEvents(tx))).toHaveLength(0);
  });
});
