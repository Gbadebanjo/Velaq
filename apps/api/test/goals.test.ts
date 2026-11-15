import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { withSpace } from "@velaq/db";
import { type TestDatabase, testDatabase } from "@velaq/db/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthGuard } from "../src/auth/auth.guard.js";
import type { Principal } from "../src/auth/principal.js";
import { CapabilityService, ENTITLEMENT_STORE } from "../src/capability.service.js";
import { PgEntitlementStore } from "../src/entitlements.js";
import { IdentityService } from "../src/identity/identity.service.js";
import { BudgetService, addMonths, lagosMonth } from "../src/money/budgets.js";
import { GoalsController } from "../src/money/goals.controller.js";
import { BudgetsController } from "../src/money/budgets.controller.js";
import { GoalService } from "../src/money/goals.js";
import { MoneyController } from "../src/money/money.controller.js";
import { MoneyService } from "../src/money/money.service.js";
import { PERSONAL_DB, SpaceService } from "../src/space/space.service.js";

const ADA = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d7e0a";
const TUNDE = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d7e0b";
const fakeIdentity = {
  verifySession: async (token: string): Promise<Principal | null> =>
    [ADA, TUNDE].includes(token) ? { accountId: token, sessionId: "s", email: "x@example.com", firstName: "A", lastName: "B", product: "personal", expiresAt: new Date().toISOString() } : null,
};

let db: TestDatabase;
let app: INestApplication;
const http = () => request(app.getHttpServer());
const as = (who: string) => ({
  get: (p: string) => http().get(p).set("authorization", `Bearer ${who}`),
  post: (p: string, b: object = {}) => http().post(p).set("authorization", `Bearer ${who}`).send(b),
  put: (p: string, b: object) => http().put(p).set("authorization", `Bearer ${who}`).send(b),
  patch: (p: string, b: object) => http().patch(p).set("authorization", `Bearer ${who}`).send(b),
  del: (p: string) => http().delete(p).set("authorization", `Bearer ${who}`),
});
const ada = as(ADA);

type Setup = { homeCurrency: string; accounts: { id: string; name: string; currency: string }[]; categories: { id: string; name: string; direction: string }[] };
let setup: Setup;
const cat = (name: string) => setup.categories.find((c) => c.name === name)!.id;
const acct = (name: string) => setup.accounts.find((a) => a.name === name)!.id;

beforeAll(async () => {
  db = await testDatabase("personal");
  const ref = await Test.createTestingModule({
    controllers: [MoneyController, BudgetsController, GoalsController],
    providers: [
      MoneyService,
      BudgetService,
      GoalService,
      { provide: PERSONAL_DB, useValue: db.app },
      { provide: SpaceService, useValue: new SpaceService(db.app) },
      { provide: IdentityService, useValue: fakeIdentity },
      { provide: ENTITLEMENT_STORE, useValue: new PgEntitlementStore(db.app) },
      { provide: CapabilityService, useFactory: (s: PgEntitlementStore) => new CapabilityService(s, new Set(["PER-010", "PER-011", "PER-012"])), inject: [ENTITLEMENT_STORE] },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  app = ref.createNestApplication();
  await app.init();
});
afterAll(async () => app?.close());

const tunde = as(TUNDE);
const now = lagosMonth();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const inMonths = (n: number) => `${addMonths(now, n)}-15`;
type G = { id: string; name: string; target: string; saved: string; remaining: string; percent: number; status: string; monthlyNeeded: string | null; pace: string; projectedMonth: string | null; archived: boolean; contributions: { id: string; kind: string; amount: string; transactionId: string | null }[] };
type L = { goals: G[]; totals: { saved: string; target: string } };
const goals = async () => (await ada.get("/v1/money/goals").expect(200)).body as L;
const goal = async (name: string) => (await goals()).goals.find((g) => g.name === name)!;
const contribute = (g: G, amount: string, kind = "deposit", date = today) => ada.post(`/v1/money/goals/${g.id}/contributions`, { kind, date, amount });
const income = (amount: string, setAside?: unknown, extra: Record<string, unknown> = {}) =>
  ada.post("/v1/money/transactions", { kind: "income", date: today, amount, accountId: acct("Cash"), categoryId: cat("Salary"), ...(setAside === undefined ? {} : { setAside }), ...extra });

describe("Savings Goals", () => {
  it("starts empty", async () => {
    setup = (await ada.get("/v1/money/setup").expect(200)).body;
    expect(await goals()).toMatchObject({ goals: [], totals: { saved: "0.00" } });
  });

  it("adds a goal, checking the name, amount and date", async () => {
    await ada.post("/v1/money/goals", { name: "  ", target: "1000" }).expect(400);
    await ada.post("/v1/money/goals", { name: "Rent", target: "0" }).expect(400);
    await ada.post("/v1/money/goals", { name: "Rent", target: "1000", targetDate: "2020-01-01" }).expect(400);
    const r = (await ada.post("/v1/money/goals", { name: "Rent", target: "600,000", targetDate: inMonths(6) }).expect(201)).body as L;
    expect(r.goals[0]).toMatchObject({ name: "Rent", target: "600000.00", saved: "0.00", status: "not_started", monthlyNeeded: "85715.00" });
  });

  it("tracks money added, the monthly amount needed, the pace and the projected finish", async () => {
    await contribute(await goal("Rent"), "100000").expect(201);
    const g = await goal("Rent");
    expect(g).toMatchObject({ saved: "100000.00", remaining: "500000.00", percent: 16, pace: "100000.00", projectedMonth: addMonths(now, 5), status: "on_track", monthlyNeeded: "71429.00" });
  });

  it("takes money out, but never more than the goal holds", async () => {
    const g = await goal("Rent");
    const r = await contribute(g, "100001", "withdrawal").expect(400);
    expect(r.body.fields.amount).toMatch(/holds 100000.00/);
    await contribute(g, "20000", "withdrawal").expect(201);
    expect((await goal("Rent")).saved).toBe("80000.00");
    await contribute(g, "1000", "deposit", inMonths(1)).expect(400); // future dates aren't allowed
  });

  it("removes a contribution with a reversal, unless the money was already taken out", async () => {
    const g = await goal("Rent");
    const deposit = g.contributions.find((c) => c.kind === "deposit")!;
    const withdrawal = g.contributions.find((c) => c.kind === "withdrawal")!;
    await ada.del(`/v1/money/goals/contributions/${deposit.id}`).expect(409);
    await ada.del(`/v1/money/goals/contributions/${withdrawal.id}`).expect(200);
    expect((await goal("Rent")).saved).toBe("100000.00");
    await ada.del(`/v1/money/goals/contributions/${withdrawal.id}`).expect(404);
  });

  it("sets money aside while recording income, in the same save", async () => {
    const rent = await goal("Rent");
    // Too much: nothing is saved, not even the income entry.
    const before = (await ada.get(`/v1/money/transactions?month=${now}`).expect(200)).body.length;
    await income("300000", { goalId: rent.id, amount: "300001" }).expect(400);
    expect((await ada.get(`/v1/money/transactions?month=${now}`).expect(200)).body.length).toBe(before);

    const t = (await income("300000", { goalId: rent.id, amount: "50000" }).expect(201)).body;
    expect((await goal("Rent")).saved).toBe("150000.00");
    const listed = (await ada.get(`/v1/money/transactions?month=${now}`).expect(200)).body.find((x: { id: string }) => x.id === t.id);
    expect(listed.setAside).toEqual({ goalId: rent.id, amount: "50000.00" });

    const put = (body: Record<string, unknown>) => ada.put(`/v1/money/transactions/${t.id}`, { kind: "income", date: today, amount: "300000", accountId: acct("Cash"), categoryId: cat("Salary"), ...body });
    await put({ note: "Pay", setAside: { goalId: rent.id, amount: "50000" } }).expect(200);
    expect((await goal("Rent")).saved).toBe("150000.00"); // unchanged, not doubled
    await put({ setAside: { goalId: rent.id, amount: "70000" } }).expect(200);
    expect((await goal("Rent")).saved).toBe("170000.00");
    await put({ note: "No set-aside field sent" }).expect(200);
    expect((await goal("Rent")).saved).toBe("170000.00"); // kept
    await put({ kind: "expense", categoryId: cat("Food & groceries") }).expect(200);
    expect((await goal("Rent")).saved).toBe("100000.00"); // no longer income, so no longer set aside
    await put({ setAside: { goalId: rent.id, amount: "30000" } }).expect(200);
    expect((await goal("Rent")).saved).toBe("130000.00");
    await ada.del(`/v1/money/transactions/${t.id}`).expect(200);
    expect((await goal("Rent")).saved).toBe("100000.00");
  });

  it("doesn't count set-aside money as spending or move it out of accounts", async () => {
    const before = (await ada.get(`/v1/money/summary?month=${now}`).expect(200)).body;
    await contribute(await goal("Rent"), "5000").expect(201);
    const after = (await ada.get(`/v1/money/summary?month=${now}`).expect(200)).body;
    expect(after.spending).toBe(before.spending);
    expect(after.balances).toEqual(before.balances);
  });

  it("marks a goal reached, and handles goals with no date", async () => {
    await ada.post("/v1/money/goals", { name: "New phone", target: "1000" }).expect(201);
    expect((await goal("New phone")).status).toBe("not_started");
    await contribute(await goal("New phone"), "400").expect(201);
    expect(await goal("New phone")).toMatchObject({ status: "no_date", monthlyNeeded: null, projectedMonth: addMonths(now, 2) });
    await contribute(await goal("New phone"), "600").expect(201);
    expect(await goal("New phone")).toMatchObject({ status: "reached", percent: 100, remaining: "0.00", projectedMonth: null });
  });

  it("edits and archives goals; archived goals take no money and leave the totals", async () => {
    const phone = await goal("New phone");
    await ada.patch(`/v1/money/goals/${phone.id}`, { target: "1500", name: "Phone" }).expect(200);
    expect(await goal("Phone")).toMatchObject({ target: "1500.00", status: "no_date" });
    const totalBefore = (await goals()).totals.saved;
    await ada.patch(`/v1/money/goals/${phone.id}`, { archived: true }).expect(200);
    await contribute(await goal("Phone"), "10").expect(409);
    expect(Number((await goals()).totals.saved)).toBe(Number(totalBefore) - 1000);
    await ada.patch(`/v1/money/goals/${phone.id}`, {}).expect(400);
  });

  it("keeps each person's goals to themselves", async () => {
    await tunde.get("/v1/money/setup").expect(200);
    expect((await tunde.get("/v1/money/goals").expect(200)).body.goals).toEqual([]);
    const rent = await goal("Rent");
    await tunde.post(`/v1/money/goals/${rent.id}/contributions`, { date: today, amount: "1" }).expect(404);
    await tunde.patch(`/v1/money/goals/${rent.id}`, { name: "Mine" }).expect(404);
    await tunde.del(`/v1/money/goals/contributions/${rent.contributions[0]!.id}`).expect(404);
    expect((await goal("Rent")).name).toBe("Rent");
  });
});
