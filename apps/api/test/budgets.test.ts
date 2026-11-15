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
    controllers: [MoneyController, BudgetsController],
    providers: [
      MoneyService,
      BudgetService,
      GoalService,
      { provide: PERSONAL_DB, useValue: db.app },
      { provide: SpaceService, useValue: new SpaceService(db.app) },
      { provide: IdentityService, useValue: fakeIdentity },
      { provide: ENTITLEMENT_STORE, useValue: new PgEntitlementStore(db.app) },
      { provide: CapabilityService, useFactory: (s: PgEntitlementStore) => new CapabilityService(s, new Set(["PER-010", "PER-011"])), inject: [ENTITLEMENT_STORE] },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  app = ref.createNestApplication();
  await app.init();
});
afterAll(async () => app?.close());

const tunde = as(TUNDE);
const now = lagosMonth();
const last = addMonths(now, -1);
const before = addMonths(now, -2);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const spend = (category: string, amount: string, date = today) =>
  ada.post("/v1/money/transactions", { kind: "expense", date, amount, accountId: acct("Cash"), categoryId: cat(category) }).expect(201);
type Month = { items: { categoryId: string; name: string; limit: string; carried: string; available: string; spent: string; left: string; percent: number; state: string; perDay: string | null; rollover: boolean }[]; unbudgeted: { name: string }[]; totals: Record<string, string>; plan: { limit: number | null; enforced: boolean; used: number } };
const budgets = async (month = now) => (await ada.get(`/v1/money/budgets?month=${month}`).expect(200)).body as Month;
const item = (m: Month, name: string) => m.items.find((i) => i.name === name);

describe("Budgets", () => {
  it("starts with none, listing the spending categories that could have one", async () => {
    setup = (await ada.get("/v1/money/setup").expect(200)).body;
    const m = await budgets();
    expect(m.items).toEqual([]);
    expect(m.unbudgeted.map((c) => c.name)).toEqual(expect.arrayContaining(["Food & groceries", "Transport"]));
    expect(m.unbudgeted.map((c) => c.name)).not.toContain("Salary");
    expect(m.plan).toEqual({ limit: 5, enforced: false, used: 0 });
  });

  it("sets a monthly limit and tracks spending against it from the journal", async () => {
    await ada.put(`/v1/money/budgets/${cat("Food & groceries")}`, { amount: "50,000" }).expect(200);
    const r = (await spend("Food & groceries", "20000")).body;
    expect(r.budgetAlert).toBeNull();
    const f = item(await budgets(), "Food & groceries")!;
    expect(f).toMatchObject({ limit: "50000.00", available: "50000.00", spent: "20000.00", left: "30000.00", percent: 40, state: "ok" });
    expect(Number(f.perDay)).toBeGreaterThan(0);
  });

  it("warns at 80% and again when over the limit", async () => {
    const near = (await spend("Food & groceries", "22000")).body;
    expect(near.budgetAlert).toMatchObject({ name: "Food & groceries", state: "near", percent: 84 });
    const over = (await spend("Food & groceries", "10000")).body;
    expect(over.budgetAlert).toMatchObject({ state: "over", left: "-2000.00" });
    expect(item(await budgets(), "Food & groceries")!.perDay).toBe("0.00");
  });

  it("follows edits and deletes, because they reverse in the journal", async () => {
    const list = (await ada.get(`/v1/money/transactions?month=${now}`).expect(200)).body as { id: string; amount: string }[];
    const big = list.find((t) => Number(t.amount) === 22000)!;
    await ada.del(`/v1/money/transactions/${big.id}`).expect(200);
    expect(item(await budgets(), "Food & groceries")).toMatchObject({ spent: "30000.00", state: "ok" });
  });

  it("carries unspent money into the next month when carry-over is on, but never a debt", async () => {
    // Budgets for past months can't be set through the API, so set one up as if made two months ago.
    await withSpace(db.app, ADA, (tx) =>
      tx.query("INSERT INTO money_budgets (id, category_id, from_month, amount, rollover) VALUES (gen_random_uuid(), $1, $2::date, 30000, true)", [cat("Transport"), `${before}-01`]),
    );
    await spend("Transport", "45000", `${before}-10`); // over by 15,000: nothing carried
    await spend("Transport", "10000", `${last}-10`); // 20,000 unspent: carried into this month
    expect(item(await budgets(before), "Transport")).toMatchObject({ available: "30000.00", state: "over" });
    expect(item(await budgets(last), "Transport")).toMatchObject({ carried: "0.00", available: "30000.00", spent: "10000.00" });
    expect(item(await budgets(), "Transport")).toMatchObject({ limit: "30000.00", carried: "20000.00", available: "50000.00", rollover: true });
  });

  it("changes a limit from this month on, leaving past months as they were", async () => {
    await ada.put(`/v1/money/budgets/${cat("Transport")}`, { amount: "40000", rollover: false }).expect(200);
    expect(item(await budgets(), "Transport")).toMatchObject({ limit: "40000.00", carried: "0.00", available: "40000.00" });
    expect(item(await budgets(last), "Transport")).toMatchObject({ limit: "30000.00" });
  });

  it("stops a budget from this month on", async () => {
    const m = (await ada.del(`/v1/money/budgets/${cat("Transport")}`).expect(200)).body as Month;
    expect(item(m, "Transport")).toBeUndefined();
    expect(m.unbudgeted.map((c) => c.name)).toContain("Transport");
    expect(item(await budgets(last), "Transport")).toBeDefined();
    await ada.del(`/v1/money/budgets/${cat("Transport")}`).expect(404);
  });

  it("adds up the month: budgeted, spent inside and outside budgets", async () => {
    await spend("Health", "5000");
    const m = await budgets();
    expect(m.totals).toMatchObject({ budgeted: "50000.00", spentInBudgets: "30000.00", outsideBudgets: "5000.00", spending: "35000.00" });
  });

  it("checks what doesn't make sense", async () => {
    await ada.put(`/v1/money/budgets/${cat("Salary")}`, { amount: "1000" }).expect(400);
    await ada.put(`/v1/money/budgets/${cat("Health")}`, { amount: "0" }).expect(400);
    await ada.put(`/v1/money/budgets/${cat("Health")}`, { amount: "1000", month: last }).expect(400);
    await ada.put("/v1/money/budgets/0192f2b4-7a1e-7a3c-9c1a-000000000000", { amount: "1000" }).expect(404);
  });

  it("limits Free to 5 budgets once plan limits are switched on", async () => {
    process.env.ENFORCE_PLAN_LIMITS = "on";
    try {
      for (const n of ["Data & airtime", "Bills & utilities", "Health", "Shopping"]) await ada.put(`/v1/money/budgets/${cat(n)}`, { amount: "10000" }).expect(200);
      const r = await ada.put(`/v1/money/budgets/${cat("Entertainment")}`, { amount: "10000" }).expect(409);
      expect(r.body.message).toMatch(/5 categories/);
      await ada.put(`/v1/money/budgets/${cat("Health")}`, { amount: "12000" }).expect(200); // changing one you have is fine
    } finally {
      delete process.env.ENFORCE_PLAN_LIMITS;
    }
    await ada.put(`/v1/money/budgets/${cat("Entertainment")}`, { amount: "10000" }).expect(200);
  });

  it("keeps each person's budgets to themselves", async () => {
    await tunde.get("/v1/money/setup").expect(200);
    const m = (await tunde.get("/v1/money/budgets").expect(200)).body as Month;
    expect(m.items).toEqual([]);
    await tunde.put(`/v1/money/budgets/${cat("Food & groceries")}`, { amount: "1000" }).expect(404);
    expect(item(await budgets(), "Food & groceries")!.limit).toBe("50000.00");
  });
});
