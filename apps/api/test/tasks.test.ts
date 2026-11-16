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
import { BudgetService } from "../src/money/budgets.js";
import { GoalsController } from "../src/money/goals.controller.js";
import { TasksController } from "../src/tasks/tasks.controller.js";
import { TaskService, nextDue } from "../src/tasks/tasks.service.js";
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


beforeAll(async () => {
  db = await testDatabase("personal");
  const ref = await Test.createTestingModule({
    controllers: [MoneyController, BudgetsController, GoalsController, TasksController],
    providers: [
      MoneyService,
      BudgetService,
      GoalService,
      TaskService,
      { provide: PERSONAL_DB, useValue: db.app },
      { provide: SpaceService, useValue: new SpaceService(db.app) },
      { provide: IdentityService, useValue: fakeIdentity },
      { provide: ENTITLEMENT_STORE, useValue: new PgEntitlementStore(db.app) },
      { provide: CapabilityService, useFactory: (s: PgEntitlementStore) => new CapabilityService(s, new Set(["PER-010", "PER-011", "PER-012", "PER-030"])), inject: [ENTITLEMENT_STORE] },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  }).compile();
  app = ref.createNestApplication();
  await app.init();
});
afterAll(async () => app?.close());

const tunde = as(TUNDE);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const shift = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
type T = { id: string; title: string; dueDate: string | null; priority: number; repeat: string | null; listId: string | null; goalId: string | null; goalName: string | null; completedAt: string | null; notes: string };
type V = { today: string; tasks: T[]; lists: { id: string; name: string; open: number }[]; counts: { today: number; upcoming: number; inbox: number; overdue: number }; goals: { id: string; name: string }[] };
const view = async (v = "today", who = ada) => (await who.get(`/v1/tasks?view=${v}`).expect(200)).body as V;
const titles = (x: V) => x.tasks.map((t) => t.title);
const add = async (body: Record<string, unknown>) => (await ada.post("/v1/tasks", body).expect(201)).body as T;

describe("Repeats", () => {
  it("works out the next date, keeping month ends and leap days sensible", () => {
    expect(nextDue("2026-11-16", "daily")).toBe("2026-11-17");
    expect(nextDue("2026-11-16", "weekly")).toBe("2026-11-23");
    expect(nextDue("2026-11-20", "weekdays")).toBe("2026-11-23"); // Friday to Monday
    expect(nextDue("2026-11-16", "weekdays")).toBe("2026-11-17");
    expect(nextDue("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDue("2026-12-31", "monthly")).toBe("2027-01-31");
    expect(nextDue("2028-02-29", "yearly")).toBe("2029-02-28");
    expect(nextDue(null, "daily", "2026-11-16")).toBe("2026-11-17");
  });
});

describe("Tasks", () => {
  it("starts empty", async () => {
    expect(await view()).toMatchObject({ tasks: [], lists: [], counts: { today: 0, upcoming: 0, inbox: 0, overdue: 0 } });
  });

  it("adds tasks, checking what's typed", async () => {
    await ada.post("/v1/tasks", { title: "   " }).expect(400);
    await ada.post("/v1/tasks", { title: "x".repeat(201) }).expect(400);
    await ada.post("/v1/tasks", { title: "Pay rent", dueDate: "2026-02-30" }).expect(400);
    await ada.post("/v1/tasks", { title: "Pay rent", priority: 7 }).expect(400);
    await ada.post("/v1/tasks", { title: "Pay rent", repeat: "hourly" }).expect(400);
    const t = await add({ title: "  Pay   rent ", dueDate: today, priority: 3, notes: "Line one\nLine two" });
    expect(t).toMatchObject({ title: "Pay rent", dueDate: today, priority: 3, listId: null, notes: "Line one\nLine two", completedAt: null });
  });

  it("sorts tasks into Today (with overdue), Upcoming and the Inbox", async () => {
    await add({ title: "Renew licence", dueDate: shift(-2) });
    await add({ title: "Call Mum", dueDate: shift(3) });
    await add({ title: "Read a book" });
    const t = await view("today");
    expect(titles(t)).toEqual(["Renew licence", "Pay rent"]);
    expect(t.counts).toEqual({ today: 2, upcoming: 1, inbox: 4, overdue: 1 });
    expect(titles(await view("upcoming"))).toEqual(["Call Mum"]);
    expect(titles(await view("inbox"))).toEqual(["Renew licence", "Pay rent", "Call Mum", "Read a book"]);
    await ada.get("/v1/tasks?view=nonsense").expect(400);
  });

  it("puts tasks in lists, and moves them to the Inbox when a list is removed", async () => {
    await ada.post("/v1/tasks/lists", { name: "inbox" }).expect(400);
    const work = (await ada.post("/v1/tasks/lists", { name: "Work" }).expect(201)).body as { id: string };
    await ada.post("/v1/tasks/lists", { name: "work" }).expect(400);
    const t = await add({ title: "Send report", listId: work.id, dueDate: shift(1) });
    expect(titles(await view(`list:${work.id}`))).toEqual(["Send report"]);
    expect((await view()).lists).toEqual([{ id: work.id, name: "Work", open: 1 }]);
    await ada.patch(`/v1/tasks/lists/${work.id}`, { name: "Office" }).expect(200);
    await ada.del(`/v1/tasks/lists/${work.id}`).expect(200);
    expect(titles(await view("inbox"))).toContain("Send report");
    await ada.get(`/v1/tasks?view=list:${work.id}`).expect(404);
    await ada.patch(`/v1/tasks/${t.id}`, { listId: work.id }).expect(400);
  });

  it("edits a task, and links it to a savings goal", async () => {
    const t = (await view("inbox")).tasks.find((x) => x.title === "Read a book")!;
    const goalId = "0192f2b4-7a1e-7a3c-9c1a-000000000001";
    await withSpace(db.app, ADA, (tx) => tx.query("INSERT INTO money_goals (id, name, target) VALUES ($1, 'New laptop', 900000)", [goalId]));
    expect((await view()).goals).toEqual([{ id: goalId, name: "New laptop" }]);
    const e = (await ada.patch(`/v1/tasks/${t.id}`, { title: "Read a book a month", priority: 1, goalId }).expect(200)).body as T;
    expect(e).toMatchObject({ title: "Read a book a month", priority: 1, goalId, goalName: "New laptop", dueDate: null });
    await ada.patch(`/v1/tasks/${t.id}`, {}).expect(400);
    await ada.patch(`/v1/tasks/${t.id}`, { goalId: null }).expect(200);
  });

  it("ticks a task off and back on", async () => {
    const t = (await view("today")).tasks.find((x) => x.title === "Pay rent")!;
    const r = (await ada.post(`/v1/tasks/${t.id}/complete`, { done: true }).expect(201)).body as { task: T; next: T | null };
    expect(r.task.completedAt).not.toBeNull();
    expect(r.next).toBeNull();
    expect(titles(await view("today"))).not.toContain("Pay rent");
    expect(titles(await view("completed"))).toEqual(["Pay rent"]);
    await ada.post(`/v1/tasks/${t.id}/complete`, { done: false }).expect(201);
    expect(titles(await view("today"))).toContain("Pay rent");
  });

  it("makes the next occurrence of a repeating task, and takes it back if the tick is undone", async () => {
    const t = await add({ title: "Water plants", repeat: "weekly" });
    expect(t.dueDate).toBe(today); // a repeat counts from today when no date is given
    const r = (await ada.post(`/v1/tasks/${t.id}/complete`, { done: true }).expect(201)).body as { next: T };
    expect(r.next).toMatchObject({ title: "Water plants", dueDate: shift(7), repeat: "weekly" });
    expect(titles(await view("upcoming"))).toContain("Water plants");
    await ada.post(`/v1/tasks/${t.id}/complete`, { done: false }).expect(201);
    expect(titles(await view("upcoming"))).not.toContain("Water plants");
    // Once the next one has been edited, undoing leaves it alone.
    const again = (await ada.post(`/v1/tasks/${t.id}/complete`, { done: true }).expect(201)).body as { next: T };
    await ada.patch(`/v1/tasks/${again.next.id}`, { notes: "Use the blue can" }).expect(200);
    await ada.post(`/v1/tasks/${t.id}/complete`, { done: false }).expect(201);
    expect((await view("upcoming")).tasks.filter((x) => x.title === "Water plants")).toHaveLength(1);
  });

  it("deletes a task", async () => {
    const t = (await view("upcoming")).tasks.find((x) => x.title === "Call Mum")!;
    await ada.del(`/v1/tasks/${t.id}`).expect(200);
    await ada.del(`/v1/tasks/${t.id}`).expect(404);
    expect(titles(await view("upcoming"))).not.toContain("Call Mum");
  });

  it("keeps each person's tasks to themselves", async () => {
    const mine = (await view("inbox")).tasks[0]!;
    expect((await view("inbox", tunde)).tasks).toEqual([]);
    await tunde.patch(`/v1/tasks/${mine.id}`, { title: "Mine now" }).expect(404);
    await tunde.post(`/v1/tasks/${mine.id}/complete`, { done: true }).expect(404);
    await tunde.del(`/v1/tasks/${mine.id}`).expect(404);
    const goalId = "0192f2b4-7a1e-7a3c-9c1a-000000000001";
    await tunde.post("/v1/tasks", { title: "Sneaky", goalId }).expect(400);
    expect((await view("inbox")).tasks.find((x) => x.id === mine.id)!.title).toBe(mine.title);
  });
});
