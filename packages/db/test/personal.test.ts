import { beforeAll, describe, expect, it } from "vitest";
import { enqueueEvent, inScope, pendingEvents, personal, withSpace } from "../src/index.js";
import { type TestDatabase, asSuperuser, testDatabase } from "../src/testing.js";

const ADA = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0a";
const TUNDE = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0b";

let db: TestDatabase;

beforeAll(async () => {
  db = await testDatabase("personal");
  await asSuperuser(db, (admin) =>
    admin.query("INSERT INTO spaces (id, owner_user_id) VALUES ($1,'user_ada'), ($2,'user_tunde')", [ADA, TUNDE]));
});

describe("personal database", () => {
  it("has no organisation tables", async () => {
    const r = await asSuperuser(db, (admin) =>
      admin.query<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('tenants','payee_accounts')"));
    expect(r.rows[0]?.n).toBe(0);
  });

  it("fails closed when no space is bound", async () => {
    expect((await db.app.query("SELECT * FROM spaces")).rows).toHaveLength(0);
  });

  it("shows each person only their own space", async () => {
    const r = await withSpace(db.app, ADA, (tx) => tx.query<{ owner_user_id: string }>("SELECT owner_user_id FROM spaces"));
    expect(r.rows.map((x) => x.owner_user_id)).toEqual(["user_ada"]);
  });

  it("isolates one person's data from another's", async () => {
    await withSpace(db.app, ADA, (tx) => tx.query("INSERT INTO feature_entitlements (feature_id, entitled, enabled) VALUES ('PER-001',true,true)"));
    const tunde = await withSpace(db.app, TUNDE, (tx) => tx.query("SELECT * FROM feature_entitlements"));
    expect(tunde.rows).toHaveLength(0);
    await expect(
      withSpace(db.app, TUNDE, (tx) => tx.query("INSERT INTO feature_entitlements (space_id, feature_id) VALUES ($1,'PER-002')", [ADA])),
    ).rejects.toThrow();
  });

  it("only allows the three personal plans", async () => {
    await expect(withSpace(db.app, ADA, (tx) => tx.query("UPDATE spaces SET plan = 'enterprise'"))).rejects.toThrow();
  });

  it("keeps the audit log append-only", async () => {
    await withSpace(db.app, ADA, (tx) =>
      tx.query("INSERT INTO audit_log (id, action, entity) VALUES ($1,'create','note')", ["0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d6f01"]));
    await expect(withSpace(db.app, ADA, (tx) => tx.query("DELETE FROM audit_log"))).rejects.toThrow();
  });

  it("runs the outbox with the space as owner", async () => {
    await withSpace(db.app, ADA, (tx) => enqueueEvent(tx, {
      id: "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d7001", type: "personal.NoteCreated", idempotencyKey: "n1", dataClass: "internal", payload: { noteId: "n1" },
    }));
    expect(await withSpace(db.app, ADA, (tx) => pendingEvents(tx))).toHaveLength(1);
    expect(await withSpace(db.app, TUNDE, (tx) => pendingEvents(tx))).toHaveLength(0);
  });

  it("works through the typed Drizzle client", async () => {
    const rows = await inScope(db.orm, ADA, (tx) => tx.select().from(personal.spaces));
    expect(rows.map((r) => r.ownerUserId)).toEqual(["user_ada"]);
  });

  it("keeps each person's profile to themselves", async () => {
    await withSpace(db.app, ADA, async (tx) => {
      await tx.query("INSERT INTO profiles (headline) VALUES ('Product Designer')");
      await tx.query("INSERT INTO profile_entries (id, section, data) VALUES ($1, 'experience', '{}')", ["0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d7001"]);
    });
    const seen = await withSpace(db.app, TUNDE, (tx) =>
      tx.query("SELECT (SELECT count(*) FROM profiles)::int AS profiles, (SELECT count(*) FROM profile_entries)::int AS entries"));
    expect(seen.rows[0]).toEqual({ profiles: 0, entries: 0 });
    await expect(withSpace(db.app, TUNDE, (tx) => tx.query("INSERT INTO profiles (space_id) VALUES ($1)", [ADA]))).rejects.toThrow();
    await expect(
      withSpace(db.app, ADA, (tx) => tx.query("INSERT INTO profile_entries (id, section, data) VALUES ($1, 'salary', '{}')", ["0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d7002"])),
    ).rejects.toThrow();
  });

  it("finds a shared profile only with its exact token", async () => {
    await withSpace(db.app, ADA, (tx) => tx.query("INSERT INTO profile_share_links (token) VALUES ('ada-secret-token')"));
    const lookup = (token: string) =>
      db.app.transaction(async (tx) => {
        await tx.query("SELECT set_config('app.share_token', $1, true)", [token]);
        return (await tx.query<{ space_id: string }>("SELECT space_id FROM profile_share_links")).rows;
      });
    expect(await lookup("ada-secret-token")).toEqual([{ space_id: ADA }]);
    expect(await lookup("wrong")).toEqual([]);
    expect(await lookup("")).toEqual([]);
    // The token does not open the profile itself: that still needs the space bound.
    const leak = await db.app.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.share_token', 'ada-secret-token', true)");
      return (await tx.query("SELECT * FROM profiles")).rows;
    });
    expect(leak).toEqual([]);
    expect((await withSpace(db.app, TUNDE, (tx) => tx.query("SELECT * FROM profile_share_links"))).rows).toEqual([]);
  });
});
