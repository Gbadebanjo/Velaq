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
import { guessMapping, parseCsv, readAmount, readDate } from "../src/money/csv.js";
import { BudgetService } from "../src/money/budgets.js";
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
const journal = () => withSpace(db.app, ADA, (tx) => tx.query<{ kind: string; reverses_entry_id: string | null; total_amount: string }>("SELECT kind, reverses_entry_id, total_amount::text FROM money_entries ORDER BY created_at"));

beforeAll(async () => {
  db = await testDatabase("personal");
  const ref = await Test.createTestingModule({
    controllers: [MoneyController],
    providers: [
      MoneyService,
      BudgetService,
      GoalService,
      { provide: PERSONAL_DB, useValue: db.app },
      { provide: SpaceService, useValue: new SpaceService(db.app) },
      { provide: IdentityService, useValue: fakeIdentity },
      { provide: ENTITLEMENT_STORE, useValue: new PgEntitlementStore(db.app) },
      { provide: CapabilityService, useFactory: (s: PgEntitlementStore) => new CapabilityService(s, new Set(["PER-010"])), inject: [ENTITLEMENT_STORE] },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  app = ref.createNestApplication();
  await app.init();
});
afterAll(async () => app?.close());

describe("Setting up", () => {
  it("starts with naira, a Cash account and everyday categories", async () => {
    setup = (await ada.get("/v1/money/setup").expect(200)).body;
    expect(setup.homeCurrency).toBe("NGN");
    expect(setup.accounts.map((a) => a.name)).toEqual(["Cash"]);
    expect(setup.categories.map((c) => c.name)).toEqual(expect.arrayContaining(["Food & groceries", "Transport", "Data & airtime", "Salary"]));
  });

  it("adds accounts, including one in dollars", async () => {
    await ada.post("/v1/money/accounts", { name: "GTBank", kind: "bank", currency: "NGN", openingBalance: "150,000" }).expect(201);
    setup = (await ada.post("/v1/money/accounts", { name: "Dom account", kind: "bank", currency: "USD" }).expect(201)).body;
    expect(setup.accounts.map((a) => a.name)).toEqual(["Cash", "GTBank", "Dom account"]);
    await ada.post("/v1/money/accounts", { name: "", kind: "vault", currency: "XYZ" }).expect(400);
  });

  it("adds and renames categories, refusing duplicates", async () => {
    setup = (await ada.post("/v1/money/categories", { name: "Generator fuel", direction: "out" }).expect(201)).body;
    await ada.post("/v1/money/categories", { name: "generator FUEL", direction: "out" }).expect(409);
    setup = (await ada.patch(`/v1/money/categories/${cat("Generator fuel")}`, { name: "Generator & diesel" }).expect(200)).body;
    expect(setup.categories.some((c) => c.name === "Generator & diesel")).toBe(true);
  });
});

describe("Recording money", () => {
  let lunch: string;

  it("records income, spending and transfers, each posted to the Money Journal", async () => {
    await ada.post("/v1/money/transactions", { kind: "income", date: "2026-11-01", amount: "450,000", accountId: acct("GTBank"), categoryId: cat("Salary"), note: "November salary" }).expect(201);
    lunch = (await ada.post("/v1/money/transactions", { kind: "expense", date: "2026-11-03", amount: "₦3,500.50", accountId: acct("Cash"), categoryId: cat("Food & groceries"), tags: ["Work"] }).expect(201)).body.id;
    await ada.post("/v1/money/transactions", { kind: "expense", date: "2026-11-04", amount: "2000", accountId: acct("GTBank"), categoryId: cat("Data & airtime") }).expect(201);
    await ada.post("/v1/money/transactions", { kind: "transfer", date: "2026-11-05", amount: "20000", accountId: acct("GTBank"), toAccountId: acct("Cash") }).expect(201);
    const j = (await journal()).rows;
    expect(j.map((e) => e.kind)).toEqual(["personal_income", "personal_spend", "personal_spend", "transfer"]);
  });

  it("asks for the rate when the account is in another currency, and converts at that rate", async () => {
    const no = await ada.post("/v1/money/transactions", { kind: "income", date: "2026-11-06", amount: "500", accountId: acct("Dom account"), categoryId: cat("Business & freelance") }).expect(400);
    expect(no.body.fields.fxRate).toMatch(/exchange rate/);
    const r = await ada.post("/v1/money/transactions", { kind: "income", date: "2026-11-06", amount: "500", fxRate: "1,550", accountId: acct("Dom account"), categoryId: cat("Business & freelance") }).expect(201);
    expect(r.body).toMatchObject({ currency: "USD", fxRate: "1550.00000000", baseAmount: "775000.0000" });
  });

  it("moves money between currencies at the amounts given", async () => {
    await ada.post("/v1/money/transactions", { kind: "transfer", date: "2026-11-07", amount: "100", fxRate: "1500", accountId: acct("Dom account"), toAccountId: acct("GTBank") }).expect(400);
    await ada.post("/v1/money/transactions", { kind: "transfer", date: "2026-11-07", amount: "100", fxRate: "1500", toAmount: "150000", accountId: acct("Dom account"), toAccountId: acct("GTBank") }).expect(201);
  });

  it("checks what doesn't make sense", async () => {
    const wrong = await ada.post("/v1/money/transactions", { kind: "income", date: "2026-11-02", amount: "100", accountId: acct("Cash"), categoryId: cat("Transport") }).expect(400);
    expect(wrong.body.fields.categoryId).toBe("Choose an income category.");
    const r = await ada.post("/v1/money/transactions", { kind: "expense", date: "2026-13-40", amount: "-5", accountId: acct("Cash") }).expect(400);
    expect(Object.keys(r.body.fields).sort()).toEqual(["amount", "categoryId", "date"]);
    await ada.post("/v1/money/transactions", { kind: "transfer", date: "2026-11-02", amount: "100", accountId: acct("Cash"), toAccountId: acct("Cash") }).expect(400);
  });

  it("totals the month from the journal: in, out, net, categories and balances", async () => {
    const s = (await ada.get("/v1/money/summary?month=2026-11").expect(200)).body;
    expect(s).toMatchObject({ income: "1225000.00", spending: "5500.50", net: "1219499.50", homeCurrency: "NGN" });
    expect(s.spendingByCategory).toEqual([{ categoryId: cat("Food & groceries"), amount: "3500.50" }, { categoryId: cat("Data & airtime"), amount: "2000.00" }]);
    const bal = Object.fromEntries(s.balances.map((b: { accountId: string; balance: string }) => [b.accountId, b.balance]));
    expect(bal[acct("Cash")]).toBe("16499.50"); // 0 - 3,500.50 + 20,000
    expect(bal[acct("GTBank")]).toBe("728000.00"); // 150,000 + 450,000 - 2,000 - 20,000 + 150,000
    expect(bal[acct("Dom account")]).toBe("400.00"); // 500 - 100 dollars
    expect(s.trend).toHaveLength(6);
    expect(s.trend[5]).toEqual({ month: "2026-11", income: "1225000.00", spending: "5500.50" });
  });

  it("edits by reversing the old version in the journal, never changing it", async () => {
    await ada.put(`/v1/money/transactions/${lunch}`, { kind: "expense", date: "2026-11-03", amount: "4000", accountId: acct("Cash"), categoryId: cat("Food & groceries") }).expect(200);
    const j = (await journal()).rows;
    expect(j.filter((e) => e.reverses_entry_id).map((e) => e.total_amount)).toEqual(["3500.5000"]);
    const s = (await ada.get("/v1/money/summary?month=2026-11")).body;
    expect(s.spending).toBe("6000.00");
  });

  it("deletes by reversing too, and lists only what's left", async () => {
    await ada.del(`/v1/money/transactions/${lunch}`).expect(200);
    await ada.del(`/v1/money/transactions/${lunch}`).expect(404);
    expect((await ada.get("/v1/money/summary?month=2026-11")).body.spending).toBe("2000.00");
    const list = (await ada.get("/v1/money/transactions?month=2026-11").expect(200)).body;
    expect(list).toHaveLength(5);
    expect((await ada.get(`/v1/money/transactions?month=2026-11&account=${acct("Dom account")}`)).body).toHaveLength(2);
  });

  it("locks the home currency once money is recorded", async () => {
    await ada.put("/v1/money/settings", { homeCurrency: "USD" }).expect(409);
  });

  it("keeps each person's money to themselves", async () => {
    const tunde = as(TUNDE);
    const s = (await tunde.get("/v1/money/setup").expect(200)).body;
    expect(s.accounts.map((a: { name: string }) => a.name)).toEqual(["Cash"]);
    expect((await tunde.get("/v1/money/transactions?month=2026-11")).body).toEqual([]);
    expect((await tunde.get("/v1/money/summary?month=2026-11")).body.income).toBe("0.00");
    const list = (await ada.get("/v1/money/transactions?month=2026-11")).body;
    await tunde.del(`/v1/money/transactions/${list[0].id}`).expect(404);
    await tunde.post("/v1/money/transactions", { kind: "expense", date: "2026-11-03", amount: "10", accountId: acct("Cash"), categoryId: cat("Transport") }).expect(400);
  });
});

const STATEMENT = `GUARANTY TRUST BANK PLC
Account Name:,ADA EXAMPLE
Account Number:,0123456789
Period:,01-Nov-2026 to 30-Nov-2026

Trans. Date,Value Date,Reference,Debits,Credits,Balance,Remarks
05-Nov-2026,05-Nov-2026,123,"1,200.00",,"148,800.00",AIRTIME MTN 0803xxxxxxx
06-Nov-2026,06-Nov-2026,124,,"25,000.00","173,800.00",TRANSFER FROM JOHN DOE
07-Nov-2026,07-Nov-2026,125,"4,500.00",,"169,300.00",UBER TRIP LAGOS
07-Nov-2026,07-Nov-2026,126,50.00,,"169,250.00",SMS ALERT CHARGES
,,,,,,Closing balance
`;

describe("Importing a bank statement CSV", () => {
  it("reads awkward cells", () => {
    expect(readDate("05-Nov-2026", "DD-MMM-YYYY")).toBe("2026-11-05");
    expect(readDate("31/02/2026", "DD/MM/YYYY")).toBeNull();
    expect(readDate("2026-11-05 14:20:00", "YYYY-MM-DD")).toBe("2026-11-05");
    expect(readAmount("(3,000.00)")).toEqual({ value: "3000.00", negative: true });
    expect(readAmount("₦2,500 DR")).toEqual({ value: "2500.00", negative: true });
    expect(readAmount("")).toBeNull();
  });

  it("finds the table under the bank's notes and guesses the columns", () => {
    const rows = parseCsv(STATEMENT);
    expect(guessMapping(rows)).toEqual({ headerRow: 4, date: 0, dateFormat: "DD-MMM-YYYY", description: 6, amount: null, debit: 3, credit: 4 });
  });

  let items: { date: string; description: string; amount: string; kind: "income" | "expense"; categoryId: string; imported: boolean; maybeDuplicate: boolean }[];

  it("previews lines with suggested categories, marking likely duplicates", async () => {
    // Something already typed in by hand, matching the airtime line.
    await ada.post("/v1/money/transactions", { kind: "expense", date: "2026-11-05", amount: "1200", accountId: acct("GTBank"), categoryId: cat("Data & airtime") }).expect(201);
    const parsed = (await ada.post("/v1/money/import/parse", { csv: STATEMENT }).expect(201)).body;
    const r = await ada.post("/v1/money/import/preview", { csv: STATEMENT, mapping: parsed.guess, accountId: acct("GTBank") }).expect(201);
    items = r.body.items;
    expect(items.map((i) => [i.date, i.amount, i.kind])).toEqual([
      ["2026-11-05", "1200.00", "expense"],
      ["2026-11-06", "25000.00", "income"],
      ["2026-11-07", "4500.00", "expense"],
      ["2026-11-07", "50.00", "expense"],
    ]);
    expect(items.map((i) => setup.categories.find((c) => c.id === i.categoryId)?.name)).toEqual(["Data & airtime", "Other income", "Transport", "Bank charges"]);
    expect(items.map((i) => i.maybeDuplicate)).toEqual([true, false, false, false]);
    expect(r.body.problems).toEqual([]);
  });

  it("imports the chosen lines once, however many times it's retried", async () => {
    const chosen = items.filter((i) => !i.maybeDuplicate).map(({ date, description, amount, kind, categoryId }) => ({ date, description, amount, kind, categoryId }));
    expect((await ada.post("/v1/money/import/commit", { accountId: acct("GTBank"), items: chosen }).expect(201)).body).toEqual({ imported: 3, skipped: 0 });
    expect((await ada.post("/v1/money/import/commit", { accountId: acct("GTBank"), items: chosen }).expect(201)).body).toEqual({ imported: 0, skipped: 3 });
    const again = (await ada.post("/v1/money/import/preview", { csv: STATEMENT, mapping: guessMapping(parseCsv(STATEMENT)), accountId: acct("GTBank") })).body.items;
    expect(again.map((i: { imported: boolean }) => i.imported)).toEqual([false, true, true, true]);
    const list = (await ada.get(`/v1/money/transactions?month=2026-11&account=${acct("GTBank")}`)).body;
    expect(list.filter((t: { source: string }) => t.source === "csv")).toHaveLength(3);
  });

  it("refuses files it can't use", async () => {
    await ada.post("/v1/money/import/parse", { csv: "just one line" }).expect(400);
    await ada.post("/v1/money/import/preview", { csv: STATEMENT, mapping: { headerRow: 4, date: 0, dateFormat: "DD-MMM-YYYY", description: 99, amount: null, debit: 3, credit: 4 }, accountId: acct("GTBank") }).expect(400);
  });
});
