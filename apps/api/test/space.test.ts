import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { pendingEvents, withSpace } from "@velaq/db";
import { type TestDatabase, testDatabase } from "@velaq/db/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppController } from "../src/app.controller.js";
import { AuthGuard } from "../src/auth/auth.guard.js";
import type { Principal } from "../src/auth/principal.js";
import { CapabilityService, ENTITLEMENT_STORE } from "../src/capability.service.js";
import { PgEntitlementStore } from "../src/entitlements.js";
import { IdentityService } from "../src/identity/identity.service.js";
import { PERSONAL_DB, SpaceService, planFeatures } from "../src/space/space.service.js";

const ADA = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0a";
const TUNDE = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0b";

/** Stand-in for sign-in: the token is the account id. */
const fakeIdentity = {
  verifySession: async (token: string): Promise<Principal | null> =>
    [ADA, TUNDE].includes(token)
      ? { accountId: token, sessionId: "s", email: `${token}@example.com`, product: "personal", expiresAt: new Date().toISOString() }
      : null,
};

let db: TestDatabase;
let spaces: SpaceService;
let app: INestApplication;

beforeAll(async () => {
  db = await testDatabase("personal");
  spaces = new SpaceService(db.app);
  const ref = await Test.createTestingModule({
    controllers: [AppController],
    providers: [
      { provide: PERSONAL_DB, useValue: db.app },
      { provide: SpaceService, useValue: spaces },
      { provide: IdentityService, useValue: fakeIdentity },
      { provide: ENTITLEMENT_STORE, useValue: new PgEntitlementStore(db.app) },
      { provide: CapabilityService, useFactory: (s: PgEntitlementStore) => new CapabilityService(s, new Set(["PER-031"])), inject: [ENTITLEMENT_STORE] },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  app = ref.createNestApplication();
  await app.init();
});
afterAll(async () => app?.close());

describe("Personal spaces", () => {
  it("creates a space on first use, once", async () => {
    expect(await spaces.ensure(ADA)).toBe(ADA);
    expect(await new SpaceService(db.app).ensure(ADA)).toBe(ADA);
    const space = await spaces.get(ADA);
    expect(space).toMatchObject({ id: ADA, plan: "free" });
    const events = await withSpace(db.app, ADA, (tx) => pendingEvents(tx));
    expect(events.filter((e) => e.type === "personal.SpaceCreated")).toHaveLength(1);
  });

  it("switches on exactly the Free plan's features", async () => {
    const r = await withSpace(db.app, ADA, (tx) => tx.query<{ feature_id: string }>("SELECT feature_id FROM feature_entitlements WHERE enabled ORDER BY 1"));
    expect(r.rows.map((x) => x.feature_id)).toEqual([...planFeatures("free")].sort());
    expect(planFeatures("free")).not.toContain("PER-050");
    expect(planFeatures("hustle")).toContain("PER-020");
  });

  it("keeps each person's space private", async () => {
    await spaces.ensure(TUNDE);
    expect(await spaces.get(TUNDE)).toMatchObject({ id: TUNDE });
    const seen = await withSpace(db.app, TUNDE, (tx) => tx.query<{ id: string }>("SELECT id FROM spaces"));
    expect(seen.rows.map((x) => x.id)).toEqual([TUNDE]);
  });

  it("serves the caller's own space, taken from the session", async () => {
    const r = await request(app.getHttpServer()).get("/v1/space").set("authorization", `Bearer ${TUNDE}`).expect(200);
    expect(r.body.space.id).toBe(TUNDE);
    const notes = r.body.capabilities.find((c: { featureId: string }) => c.featureId === "PER-031");
    const tasks = r.body.capabilities.find((c: { featureId: string }) => c.featureId === "PER-030");
    expect(notes.usable).toBe(true);
    expect(tasks).toMatchObject({ usable: false, denial: "not_released" });
  });

  it("ignores any scope a client tries to send", async () => {
    const r = await request(app.getHttpServer()).get("/v1/capabilities?features=PER-031").set("authorization", `Bearer ${TUNDE}`).set("x-tenant-id", ADA).expect(200);
    expect(r.body.scopeId).toBe(TUNDE);
  });

  it("requires a session", async () => {
    await request(app.getHttpServer()).get("/v1/space").expect(401);
  });
});
