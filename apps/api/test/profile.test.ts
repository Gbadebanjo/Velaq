import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { withSpace } from "@velaq/db";
import { type TestDatabase, testDatabase } from "@velaq/db/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthGuard } from "../src/auth/auth.guard.js";
import type { Principal } from "../src/auth/principal.js";
import { CapabilityService, ENTITLEMENT_STORE } from "../src/capability.service.js";
import { PgEntitlementStore } from "../src/entitlements.js";
import { IdentityService } from "../src/identity/identity.service.js";
import { ProfileController } from "../src/profile/profile.controller.js";
import { ProfileService } from "../src/profile/profile.service.js";
import { PERSONAL_DB, SpaceService } from "../src/space/space.service.js";

const ADA = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0a";
const TUNDE = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0b";
const OFF = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0c";
const NAMES: Record<string, { firstName: string; lastName: string }> = {
  [ADA]: { firstName: "Adébáyọ̀", lastName: "Okafor" },
  [TUNDE]: { firstName: "Tunde", lastName: "Bello" },
  [OFF]: { firstName: "Off", lastName: "Feature" },
};

/** Stand-in for sign-in: the token is the account id. */
const fakeIdentity = {
  verifySession: async (token: string): Promise<Principal | null> =>
    NAMES[token]
      ? { accountId: token, sessionId: "s", email: `${token.slice(-4)}@example.com`, ...NAMES[token]!, product: "personal", expiresAt: new Date().toISOString() }
      : null,
  accountName: async (id: string) => (NAMES[id] ? { ...NAMES[id]!, email: `${id.slice(-4)}@example.com` } : null),
};

let db: TestDatabase;
let app: INestApplication;
const http = () => request(app.getHttpServer());
const as = (who: string) => ({
  get: (path: string) => http().get(path).set("authorization", `Bearer ${who}`),
  put: (path: string, body: object) => http().put(path).set("authorization", `Bearer ${who}`).send(body),
  post: (path: string, body: object = {}) => http().post(path).set("authorization", `Bearer ${who}`).send(body),
  del: (path: string) => http().delete(path).set("authorization", `Bearer ${who}`),
});
const ada = as(ADA);

/** Reads a PDF response as bytes. */
const pdf = (req: request.Test) =>
  req.buffer(true).parse((res, cb) => {
    const parts: Buffer[] = [];
    res.on("data", (c: Buffer) => parts.push(c));
    res.on("end", () => cb(null, Buffer.concat(parts)));
  });
/** Which font family a PDF embeds: Lora for Classic, Montserrat for Modern and Sidebar. */
const family = (b: Buffer) => (b.includes("Montserrat") ? "sans" : b.includes("Lora") ? "serif" : "none");

const BASICS = { headline: "Product Designer", location: "Lagos", about: "I design calm software.", phone: "+234 800 000 0000", website: "example.com", showEmail: true };
const JOB = { role: "Senior Designer", organisation: "Kora Logistics", location: "Lagos", start: "2022-03", end: "", current: true, description: "Led the checkout redesign." };
const OLD_JOB = { role: "Designer", organisation: "Zuri Studio", location: "Remote", start: "2019-01", end: "2022-02", current: false, description: "" };
const SCHOOL = { school: "University of Lagos", qualification: "BSc", field: "Computer Science", start: "2014-09", end: "2018-07", current: false, description: "" };
const LINK = { label: "LinkedIn", url: "linkedin.com/in/example" };

type Entry = { id?: string; data: Record<string, unknown> };
/** A whole profile as the editor sends it. */
const doc = (o: Partial<{ basics: object; skills: string[]; entries: Partial<Record<string, Entry[]>>; updatedAt: string | null }> = {}) => ({
  basics: BASICS,
  skills: ["Figma", "Research", "Prototyping"],
  ...o,
  entries: { experience: [{ data: JOB }], education: [], certification: [], portfolio: [], link: [], ...o.entries },
});

beforeAll(async () => {
  db = await testDatabase("personal");
  const spaces = new SpaceService(db.app);
  const ref = await Test.createTestingModule({
    controllers: [ProfileController],
    providers: [
      ProfileService,
      { provide: PERSONAL_DB, useValue: db.app },
      { provide: SpaceService, useValue: spaces },
      { provide: IdentityService, useValue: fakeIdentity },
      { provide: ENTITLEMENT_STORE, useValue: new PgEntitlementStore(db.app) },
      { provide: CapabilityService, useFactory: (s: PgEntitlementStore) => new CapabilityService(s, new Set(["PER-001"])), inject: [ENTITLEMENT_STORE] },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  app = ref.createNestApplication();
  await app.init();
  // OFF's space exists but has the Professional Profile switched off.
  await spaces.ensure(OFF);
  await withSpace(db.app, OFF, (tx) => tx.query("UPDATE feature_entitlements SET enabled = false WHERE feature_id = 'PER-001'"));
});
afterAll(async () => app?.close());

describe("Professional Profile", () => {
  it("starts empty, with the name from the account", async () => {
    const r = await ada.get("/v1/profile").expect(200);
    expect(r.body.person).toMatchObject(NAMES[ADA]!);
    expect(r.body.basics.headline).toBe("");
    expect(r.body).not.toHaveProperty("visibility");
    expect(r.body.share).toBeNull();
    expect(r.body.updatedAt).toBeNull();
    expect(r.body.completeness.percent).toBe(0);
    await http().get("/v1/profile").expect(401);
  });

  it("saves the whole profile in one go, tidying as it goes", async () => {
    const r = await ada
      .put("/v1/profile", doc({ updatedAt: null, skills: ["Figma", "figma", " Research ", "Prototyping"], entries: { experience: [{ data: JOB }, { data: OLD_JOB }], education: [{ data: SCHOOL }], link: [{ data: LINK }] } }))
      .expect(200);
    expect(r.body.basics).toMatchObject({ ...BASICS, website: "https://example.com/" });
    expect(r.body.skills).toEqual(["Figma", "Research", "Prototyping"]);
    expect(r.body.entries.experience.map((e: Entry) => e.data.organisation)).toEqual(["Kora Logistics", "Zuri Studio"]);
    expect(r.body.entries.link[0].data.url).toBe("https://linkedin.com/in/example");
    expect(r.body.completeness).toEqual({ percent: 100, missing: [] });
    expect(r.body.updatedAt).toEqual(expect.any(String));
  });

  it("keeps ids for entries it already has, reorders, and removes what was left out", async () => {
    const before = (await ada.get("/v1/profile")).body;
    const [kora, zuri] = before.entries.experience;
    const r = await ada
      .put("/v1/profile", doc({ updatedAt: before.updatedAt, entries: { experience: [{ id: zuri.id, data: { ...OLD_JOB, role: "Product Designer" } }, { id: kora.id, data: JOB }], education: [] } }))
      .expect(200);
    expect(r.body.entries.experience.map((e: Entry) => e.id)).toEqual([zuri.id, kora.id]);
    expect(r.body.entries.experience[0].data.role).toBe("Product Designer");
    expect(r.body.entries.education).toEqual([]);
    expect(r.body.entries.link).toEqual([]);
  });

  it("saves nothing when any part is wrong, and says exactly where", async () => {
    const before = (await ada.get("/v1/profile")).body;
    const bad = await ada
      .put("/v1/profile", doc({
        updatedAt: before.updatedAt,
        basics: { ...BASICS, headline: "Changed", website: "javascript:alert(1)", phone: "call me" },
        entries: {
          experience: [{ data: JOB }, { data: { ...OLD_JOB, end: "" } }, { data: { ...OLD_JOB, start: "2023-05", end: "2021-01" } }],
          portfolio: [{ data: { title: "Case study", url: "", description: "" } }],
        },
      }))
      .expect(400);
    expect(bad.body.fields).toMatchObject({
      "basics.website": expect.stringMatching(/web address/),
      "basics.phone": expect.any(String),
      "entries.experience.1.end": expect.stringMatching(/finished/),
      "entries.experience.2.end": expect.stringMatching(/before the start/),
      "entries.portfolio.0.url": expect.any(String),
    });
    const after = (await ada.get("/v1/profile")).body;
    expect(after.basics.headline).toBe("Product Designer");
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("marks education still in progress, dropping any end month", async () => {
    const before = (await ada.get("/v1/profile")).body;
    const r = await ada.put("/v1/profile", doc({ updatedAt: before.updatedAt, entries: { education: [{ data: { ...SCHOOL, qualification: "MSc", start: "2025-10", end: "2026-01", current: true } }] } })).expect(200);
    expect(r.body.entries.education[0].data).toMatchObject({ current: true, end: "" });
  });

  it("refuses to overwrite a newer save from another window", async () => {
    const before = (await ada.get("/v1/profile")).body;
    await ada.put("/v1/profile", doc({ updatedAt: before.updatedAt, basics: { ...BASICS, headline: "Window one" } })).expect(200);
    const stale = await ada.put("/v1/profile", doc({ updatedAt: before.updatedAt, basics: { ...BASICS, headline: "Window two" } })).expect(409);
    expect(stale.body.message).toMatch(/another window/);
    expect((await ada.get("/v1/profile")).body.basics.headline).toBe("Window one");
  });

  it("limits how much a profile can hold", async () => {
    const before = (await ada.get("/v1/profile")).body;
    const many = Array.from({ length: 31 }, () => ({ data: LINK }));
    const r = await ada.put("/v1/profile", doc({ updatedAt: before.updatedAt, entries: { link: many } })).expect(400);
    expect(r.body.fields["entries.link"]).toMatch(/at most 30/);
  });

  it("keeps one person's profile and entries away from another", async () => {
    const mine = (await ada.get("/v1/profile")).body;
    const tunde = as(TUNDE);
    const r = await tunde.get("/v1/profile").expect(200);
    expect(r.body.entries.experience).toEqual([]);
    // Sending Ada's entry id creates a fresh entry for Tunde; Ada's stays as it was.
    const t = await tunde.put("/v1/profile", doc({ updatedAt: null, entries: { experience: [{ id: mine.entries.experience[0].id, data: { ...JOB, role: "Tunde's job" } }] } })).expect(200);
    expect(t.body.entries.experience[0].id).not.toBe(mine.entries.experience[0].id);
    const again = (await ada.get("/v1/profile")).body;
    expect(again.entries.experience[0].data.role).toBe(mine.entries.experience[0].data.role);
  });

  it("is refused when the feature is switched off for the space", async () => {
    const r = await as(OFF).get("/v1/profile").expect(403);
    expect(r.body.error).toBe("feature_off");
  });

  it("downloads the profile as a PDF", async () => {
    const r = await pdf(ada.get("/v1/profile/cv.pdf")).expect(200);
    expect(r.headers["content-type"]).toBe("application/pdf");
    expect(r.headers["content-disposition"]).toBe('attachment; filename="Adebayo-Okafor-CV.pdf"');
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("CV templates", () => {
  it("starts on Classic and lets the owner pick another design, without counting as an edit", async () => {
    const before = (await ada.get("/v1/profile")).body;
    expect(before.cvTemplate).toBe("classic");
    expect(family((await pdf(ada.get("/v1/profile/cv.pdf")).expect(200)).body)).toBe("serif");
    const r = await ada.put("/v1/profile/template", { template: "modern" }).expect(200);
    expect(r.body.cvTemplate).toBe("modern");
    expect(r.body.updatedAt).toBe(before.updatedAt);
    expect(family((await pdf(ada.get("/v1/profile/cv.pdf")).expect(200)).body)).toBe("sans");
    await ada.put("/v1/profile/template", { template: "fancy" }).expect(400);
  });

  it("previews a design without changing the saved one", async () => {
    expect(family((await pdf(ada.get("/v1/profile/cv.pdf?template=classic")).expect(200)).body)).toBe("serif");
    expect((await pdf(ada.get("/v1/profile/cv.pdf?template=sidebar")).expect(200)).headers["content-type"]).toBe("application/pdf");
    expect((await ada.get("/v1/profile")).body.cvTemplate).toBe("modern");
  });
});

describe("Sharing by link", () => {
  it("shows the whole profile as one unit, without settings", async () => {
    const r = await ada.post("/v1/profile/share").expect(200);
    const token = r.body.share.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const shared = await http().get(`/v1/shared-profiles/${token}`).expect(200);
    expect(shared.body.person).toMatchObject(NAMES[ADA]!);
    expect(shared.body.basics).toMatchObject({ headline: "Window one", about: "I design calm software.", phone: "+234 800 000 0000" });
    expect(shared.body.entries.experience).toHaveLength(1);
    expect(shared.body.skills).toEqual(["Figma", "Research", "Prototyping"]);
    for (const hidden of ["showEmail", "cvTemplate", "share", "updatedAt", "completeness", "visibility"]) {
      expect(JSON.stringify(shared.body)).not.toContain(hidden);
    }
  });

  it("shows the email only when the person chose to", async () => {
    const before = (await ada.get("/v1/profile")).body;
    const token = before.share.token;
    expect((await http().get(`/v1/shared-profiles/${token}`)).body.person.email).toBe(`${ADA.slice(-4)}@example.com`);
    await ada.put("/v1/profile", doc({ updatedAt: before.updatedAt, basics: { ...BASICS, showEmail: false } })).expect(200);
    expect((await http().get(`/v1/shared-profiles/${token}`)).body.person.email).toBeUndefined();
  });

  it("stops the old link working when a new one is made, and all links when turned off", async () => {
    const old = (await ada.get("/v1/profile")).body.share.token;
    const fresh = (await ada.post("/v1/profile/share").expect(200)).body.share.token;
    expect(fresh).not.toBe(old);
    await http().get(`/v1/shared-profiles/${old}`).expect(404);
    const visitorPdf = await pdf(http().get(`/v1/shared-profiles/${fresh}/cv.pdf`)).expect(200).expect("content-type", "application/pdf");
    expect(family(visitorPdf.body)).toBe("sans"); // the owner's chosen design (Modern)

    const off = await ada.del("/v1/profile/share").expect(200);
    expect(off.body.share).toBeNull();
    await http().get(`/v1/shared-profiles/${fresh}`).expect(404);
    await http().get("/v1/shared-profiles/not-a-real-token-at-all").expect(404);
    await http().get("/v1/shared-profiles/%27%3B--").expect(404);
  });
});
