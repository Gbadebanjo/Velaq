import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { type TestDatabase, testDatabase } from "@velaq/db/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_CLIENT, AiFailed, type AiClient, type AiRequest } from "../src/ai/ai.js";
import { AuthGuard } from "../src/auth/auth.guard.js";
import type { Principal } from "../src/auth/principal.js";
import { CapabilityService, ENTITLEMENT_STORE } from "../src/capability.service.js";
import { PgEntitlementStore } from "../src/entitlements.js";
import { IdentityService } from "../src/identity/identity.service.js";
import { ProfileController } from "../src/profile/profile.controller.js";
import { ProfileService } from "../src/profile/profile.service.js";
import { TailorController } from "../src/profile/tailor.controller.js";
import { checkAnswer, figuresIn, namesIn } from "../src/profile/tailor.js";
import { VersionService } from "../src/profile/versions.js";
import { PERSONAL_DB, SpaceService } from "../src/space/space.service.js";

const ADA = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d6e0a";
const TUNDE = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d6e0b";
const EMPTY = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d6e0c";
const NAMES: Record<string, { firstName: string; lastName: string }> = {
  [ADA]: { firstName: "Adaora", lastName: "Nwosu" },
  [TUNDE]: { firstName: "Tunde", lastName: "Bello" },
  [EMPTY]: { firstName: "Empty", lastName: "Profile" },
};
const fakeIdentity = {
  verifySession: async (token: string): Promise<Principal | null> =>
    NAMES[token] ? { accountId: token, sessionId: "s", email: `${token.slice(-4)}@example.com`, ...NAMES[token]!, product: "personal", expiresAt: new Date().toISOString() } : null,
  accountName: async () => null,
};

/** A stand-in for Claude: returns whatever the test sets, and remembers what it was asked. */
class FakeAi implements AiClient {
  readonly model = "fake-model";
  answer: unknown = {};
  fail = false;
  last?: AiRequest;
  async json<T>(req: AiRequest): Promise<T> {
    this.last = req;
    if (this.fail) throw new AiFailed("The AI service is busy right now. Try again in a minute.");
    return this.answer as T;
  }
}

const JD = "We are hiring a Senior Product Designer to lead design for our logistics app. You will run user research, build a design system, and work with engineers. Experience with Kubernetes is a plus.";
const KORA = { role: "Senior Product Designer", organisation: "Kora Logistics", location: "Abuja", start: "2023-01", end: "", current: true, description: "Lead design for the delivery app used by 40,000 drivers.\nBuilt the design system." };
const BRIGHT = { role: "Product Designer", organisation: "Brightpath Health", location: "Lagos", start: "2020-03", end: "2022-12", current: false, description: "Designed the booking flow.\nRan usability sessions with clinic staff." };

let db: TestDatabase;
let app: INestApplication;
const ai = new FakeAi();
const http = () => request(app.getHttpServer());
const as = (who: string) => ({
  get: (p: string) => http().get(p).set("authorization", `Bearer ${who}`),
  post: (p: string, b: object = {}) => http().post(p).set("authorization", `Bearer ${who}`).send(b),
  put: (p: string, b: object) => http().put(p).set("authorization", `Bearer ${who}`).send(b),
  del: (p: string) => http().delete(p).set("authorization", `Bearer ${who}`),
});
const ada = as(ADA);

async function makeApp(client: AiClient | null) {
  const spaces = new SpaceService(db.app);
  const ref = await Test.createTestingModule({
    controllers: [ProfileController, TailorController],
    providers: [
      ProfileService,
      VersionService,
      { provide: PERSONAL_DB, useValue: db.app },
      { provide: SpaceService, useValue: spaces },
      { provide: IdentityService, useValue: fakeIdentity },
      { provide: AI_CLIENT, useValue: client },
      { provide: ENTITLEMENT_STORE, useValue: new PgEntitlementStore(db.app) },
      { provide: CapabilityService, useFactory: (s: PgEntitlementStore) => new CapabilityService(s, new Set(["PER-001"])), inject: [ENTITLEMENT_STORE] },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  const a = ref.createNestApplication();
  await a.init();
  return a;
}

let ids: { kora: string; bright: string; p1: string; p2: string };

beforeAll(async () => {
  process.env.AI_DAILY_LIMIT = "5";
  db = await testDatabase("personal");
  app = await makeApp(ai);
  const r = await ada
    .put("/v1/profile", {
      updatedAt: null,
      basics: { headline: "Product Designer", location: "Abuja", about: "Designer with 7 years of experience.", phone: "", website: "", showEmail: false },
      skills: ["Figma", "User research", "Design systems", "Prototyping"],
      entries: {
        experience: [{ data: BRIGHT }, { data: KORA }],
        education: [],
        certification: [],
        portfolio: [{ data: { title: "Booking redesign", url: "example.com/a", description: "" } }, { data: { title: "Driver app", url: "example.com/b", description: "" } }],
        link: [],
      },
    })
    .expect(200);
  ids = { bright: r.body.entries.experience[0].id, kora: r.body.entries.experience[1].id, p1: r.body.entries.portfolio[0].id, p2: r.body.entries.portfolio[1].id };
});
afterAll(async () => app?.close());

describe("checking the AI's answer", () => {
  it("finds every figure written in a text", () => {
    expect([...figuresIn("40,000 drivers, 18% fewer, since 2021 and 3.5x")]).toEqual(["40000", "18", "2021", "3.5"]);
  });
});

describe("Tailor for a job", () => {
  it("says whether AI is set up and how many tailorings are left", async () => {
    expect((await ada.get("/v1/profile/ai").expect(200)).body).toEqual({ available: true, dailyLimit: 5, remainingToday: 5 });
    const off = await makeApp(null);
    const r = await request(off.getHttpServer()).get("/v1/profile/ai").set("authorization", `Bearer ${ADA}`).expect(200);
    expect(r.body.available).toBe(false);
    await request(off.getHttpServer()).post("/v1/profile/tailor").set("authorization", `Bearer ${ADA}`).send({ jobTitle: "Designer", jobDescription: JD }).expect(503);
    await off.close();
  });

  it("checks the job details", async () => {
    const r = await ada.post("/v1/profile/tailor", { jobTitle: "", jobDescription: "too short" }).expect(400);
    expect(Object.keys(r.body.fields).sort()).toEqual(["jobDescription", "jobTitle"]);
  });

  it("sends the AI labelled entries, never ids, and keeps only what's true in its answer", async () => {
    ai.answer = {
      headline: "Senior Product Designer for logistics apps",
      about: "Designer with 7 years of experience who cut costs by 40%.", // 40% isn't in the profile
      skills: ["Design systems", "kubernetes", "User research", "Figma"], // Kubernetes isn't theirs; Prototyping left out
      experience: [
        { ref: "E2", description: "- Lead design for the delivery app used by 40,000 drivers.\n- Built and maintain the design system." },
        { ref: "E1", description: "Ran usability sessions with clinic staff to improve booking for 2 million patients." }, // new figure
        { ref: "E9", description: "Invented job" },
      ],
      projects: ["P2", "P2", "P7"],
      certifications: [],
      gaps: ["Kubernetes", "  "],
      summary: "Put logistics work first.",
    };
    const r = await ada.post("/v1/profile/tailor", { jobTitle: "Senior Product Designer", company: "Kora", jobDescription: JD }).expect(201);
    const s = r.body;

    expect(ai.last!.user).toContain("[E1] Product Designer at Brightpath Health");
    expect(ai.last!.user).toContain("Title: Senior Product Designer");
    expect(ai.last!.user).not.toContain(ids.kora);
    expect(ai.last!.system).toMatch(/Never add/);

    expect(s.headline).toEqual({ original: "Product Designer", suggested: "Senior Product Designer for logistics apps", kept: false });
    expect(s.about).toMatchObject({ suggested: "Designer with 7 years of experience.", kept: true });
    expect(s.skills.suggested).toEqual(["Design systems", "User research", "Figma", "Prototyping"]);
    expect(s.experience.map((e: { id: string }) => e.id)).toEqual([ids.kora, ids.bright]);
    expect(s.experience[0]).toMatchObject({ suggested: "Lead design for the delivery app used by 40,000 drivers.\nBuilt and maintain the design system.", kept: false });
    expect(s.experience[1]).toMatchObject({ suggested: BRIGHT.description, kept: true });
    expect(s.projects.suggested).toEqual([ids.p2, ids.p1]);
    expect(s.gaps).toEqual(["Kubernetes"]);
    expect(s.model).toBe("fake-model");
  });

  it("copes with a broken or empty answer by keeping the originals", async () => {
    ai.answer = { nonsense: true };
    const s = (await ada.post("/v1/profile/tailor", { jobTitle: "Designer", jobDescription: JD }).expect(201)).body;
    expect(s.headline).toMatchObject({ suggested: "Product Designer", kept: false });
    expect(s.skills.suggested).toEqual(["Figma", "User research", "Design systems", "Prototyping"]);
    expect(s.experience.map((e: { id: string }) => e.id)).toEqual([ids.bright, ids.kora]);
  });

  it("reports an AI failure clearly", async () => {
    ai.fail = true;
    const r = await ada.post("/v1/profile/tailor", { jobTitle: "Designer", jobDescription: JD }).expect(502);
    expect(r.body.message).toMatch(/busy/);
    ai.fail = false;
  });

  it("asks for a profile first", async () => {
    const r = await as(EMPTY).post("/v1/profile/tailor", { jobTitle: "Designer", jobDescription: JD }).expect(409);
    expect(r.body.error).toBe("profile_empty");
  });

  it("stops at the daily limit", async () => {
    ai.answer = {};
    // Three tailorings already ran in this file (the failed one counts too); the fourth and fifth are allowed, the sixth isn't.
    await ada.post("/v1/profile/tailor", { jobTitle: "Designer", jobDescription: JD }).expect(201);
    await ada.post("/v1/profile/tailor", { jobTitle: "Designer", jobDescription: JD }).expect(201);
    const r = await ada.post("/v1/profile/tailor", { jobTitle: "Designer", jobDescription: JD }).expect(429);
    expect(r.body.message).toMatch(/all 5 tailorings/);
    expect((await ada.get("/v1/profile/ai")).body.remainingToday).toBe(0);
  });
});

describe("Tailored versions", () => {
  let versionId: string;

  it("saves the approved changes as a separate version, leaving the main profile alone", async () => {
    const before = (await ada.get("/v1/profile")).body;
    const r = await ada
      .post("/v1/profile/versions", {
        name: "Senior Product Designer – Kora",
        jobTitle: "Senior Product Designer",
        company: "Kora",
        jobDescription: JD,
        changes: {
          headline: "Senior Product Designer for logistics apps",
          about: "My own edited About me.",
          skills: ["Design systems", "Kubernetes", "figma"], // Kubernetes isn't theirs and is dropped
          experience: [{ id: ids.kora, description: "Rewritten for the job." }, { id: "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d0000", description: "Not a real job" }],
          projects: [ids.p2],
          certifications: [],
        },
      })
      .expect(201);
    versionId = r.body.id;
    expect(r.body).toMatchObject({ name: "Senior Product Designer – Kora", jobTitle: "Senior Product Designer", company: "Kora" });

    const v = (await ada.get(`/v1/profile/versions/${versionId}`).expect(200)).body;
    expect(v.content.basics).toMatchObject({ headline: "Senior Product Designer for logistics apps", about: "My own edited About me." });
    expect(v.content.skills).toEqual(["Design systems", "Figma"]);
    expect(v.content.entries.experience.map((e: { id: string }) => e.id)).toEqual([ids.kora, ids.bright]);
    expect(v.content.entries.experience[0].data).toMatchObject({ role: "Senior Product Designer", organisation: "Kora Logistics", start: "2023-01", description: "Rewritten for the job." });
    expect(v.content.entries.portfolio.map((e: { id: string }) => e.id)).toEqual([ids.p2, ids.p1]);
    expect(v.jobDescription).toBe(JD);

    const after = (await ada.get("/v1/profile")).body;
    expect(after.basics).toEqual(before.basics);
    expect(after.entries).toEqual(before.entries);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("lists, downloads and deletes versions", async () => {
    const list = (await ada.get("/v1/profile/versions").expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("content");
    const pdf = await ada.get(`/v1/profile/versions/${versionId}/cv.pdf?template=sidebar`).expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe('attachment; filename="Adaora-Nwosu-Senior-Product-Designer-Kora-CV.pdf"');
    await ada.del(`/v1/profile/versions/${versionId}`).expect(200);
    await ada.get(`/v1/profile/versions/${versionId}`).expect(404);
  });

  it("keeps each person's versions to themselves", async () => {
    const mine = (await ada.post("/v1/profile/versions", { name: "Mine", jobTitle: "Designer", changes: { headline: "", about: "", skills: [], experience: [], projects: [], certifications: [] } }).expect(201)).body;
    const tunde = as(TUNDE);
    expect((await tunde.get("/v1/profile/versions")).body).toEqual([]);
    await tunde.get(`/v1/profile/versions/${mine.id}`).expect(404);
    await tunde.del(`/v1/profile/versions/${mine.id}`).expect(404);
    await tunde.get(`/v1/profile/versions/${mine.id}/cv.pdf`).expect(404);
    await ada.get(`/v1/profile/versions/${mine.id}`).expect(200);
  });
});

describe("checkAnswer on its own", () => {
  it("never lets the AI change who, where or when", () => {
    const profile = {
      person: { firstName: "A", lastName: "B", email: "a@b.c" },
      basics: { headline: "", location: "", about: "", phone: "", website: "", showEmail: false },
      skills: [],
      entries: { experience: [{ id: "x", kind: "experience" as const, data: KORA }], education: [], certification: [], portfolio: [], link: [] },
      share: null,
      cvTemplate: "classic" as const,
      completeness: { percent: 0, missing: [] },
      updatedAt: null,
    };
    const s = checkAnswer(profile, { experience: [{ ref: "E1", description: "Led design at Google since 2015." }] }, "m");
    expect(s.experience[0]).toMatchObject({ role: "Senior Product Designer", organisation: "Kora Logistics", kept: true });
    // A new name with no figures is caught too; names already in the profile are fine.
    const named = checkAnswer(profile, { experience: [{ ref: "E1", description: "Led design using Kubernetes." }] }, "m");
    expect(named.experience[0]!.kept).toBe(true);
    const fine = checkAnswer(profile, { experience: [{ ref: "E1", description: "Led the delivery app design at Kora Logistics.\nBuilt the design system." }] }, "m");
    expect(fine.experience[0]).toMatchObject({ kept: false, suggested: "Led the delivery app design at Kora Logistics.\nBuilt the design system." });
  });

  it("spots names but not sentence starts", () => {
    expect(namesIn("Led design at Google. Built tools in Figma and AWS.\nRan research")).toEqual(["Google", "Figma", "AWS"]);
  });
});
