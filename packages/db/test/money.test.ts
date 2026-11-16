import { beforeAll, describe, expect, it } from "vitest";
import { withSpace } from "../src/index.js";
import { type TestDatabase, asSuperuser, testDatabase } from "../src/testing.js";

const ADA = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0a";
const TUNDE = "0192f2b4-7a1e-7a3c-9c1a-3f2b7c9d5e0b";
let n = 0;
const id = () => `0192f2b4-7a1e-7a3c-9c1a-${String(++n).padStart(12, "0")}`;

let db: TestDatabase;

beforeAll(async () => {
  db = await testDatabase("personal");
  await asSuperuser(db, (admin) => admin.query("INSERT INTO spaces (id, owner_user_id) VALUES ($1,'user_ada'), ($2,'user_tunde')", [ADA, TUNDE]));
});

/** Posts one entry with the given lines, as the app would. */
function post(space: string, o: { total: string; lines: { dir: "in" | "out"; base: string }[]; record?: string; version?: number; kind?: string; reverses?: string }) {
  return withSpace(db.app, space, async (tx) => {
    const entry = id();
    await tx.query(
      `INSERT INTO money_entries (id, entry_date, kind, source_feature, source_record, source_version, currency, total_amount, reverses_entry_id, created_by)
       VALUES ($1, '2026-11-05', $2, 'PER-010', $3, $4, 'NGN', $5, $6, $7)`,
      [entry, o.kind ?? "personal_spend", o.record ?? id(), o.version ?? 1, o.total, o.reverses ?? null, space],
    );
    let line = 0;
    for (const l of o.lines) {
      await tx.query(
        "INSERT INTO money_entry_lines (id, entry_id, line_no, category, direction, amount, currency, base_amount) VALUES ($1, $2, $3, 'Food', $4, $5, 'NGN', $5)",
        [id(), entry, ++line, l.dir, l.base],
      );
    }
    return entry;
  });
}

describe("Money Journal", () => {
  it("accepts a balanced entry", async () => {
    await expect(post(ADA, { total: "2500", lines: [{ dir: "out", base: "2000" }, { dir: "out", base: "500" }] })).resolves.toBeTruthy();
    await expect(post(ADA, { kind: "transfer", total: "10000", lines: [{ dir: "out", base: "10000" }, { dir: "in", base: "10000" }] })).resolves.toBeTruthy();
  });

  it("refuses an unbalanced entry, or one with no lines, when the transaction commits", async () => {
    await expect(post(ADA, { total: "2500", lines: [{ dir: "out", base: "2000" }] })).rejects.toThrow(/not balanced/);
    await expect(post(ADA, { total: "2500", lines: [] })).rejects.toThrow(/not balanced/);
    await expect(post(ADA, { kind: "transfer", total: "100", lines: [{ dir: "out", base: "100" }, { dir: "in", base: "90" }] })).rejects.toThrow(/not balanced/);
  });

  it("never posts the same source record version twice", async () => {
    const record = id();
    await post(ADA, { record, total: "100", lines: [{ dir: "out", base: "100" }] });
    await expect(post(ADA, { record, total: "100", lines: [{ dir: "out", base: "100" }] })).rejects.toThrow();
    await expect(post(ADA, { record, version: 2, total: "150", lines: [{ dir: "out", base: "150" }] })).resolves.toBeTruthy();
  });

  it("can't be changed or deleted, even by the database owner", async () => {
    const entry = await post(ADA, { total: "700", lines: [{ dir: "out", base: "700" }] });
    await expect(withSpace(db.app, ADA, (tx) => tx.query("UPDATE money_entries SET total_amount = 1 WHERE id = $1", [entry]))).rejects.toThrow();
    await expect(withSpace(db.app, ADA, (tx) => tx.query("DELETE FROM money_entry_lines WHERE entry_id = $1", [entry]))).rejects.toThrow();
    await expect(asSuperuser(db, (admin) => admin.query("UPDATE money_entries SET description = 'x' WHERE id = $1", [entry]))).rejects.toThrow(/append-only/);
    await expect(asSuperuser(db, (admin) => admin.query("DELETE FROM money_entries WHERE id = $1", [entry]))).rejects.toThrow(/append-only/);
  });

  it("allows each entry to be reversed only once", async () => {
    const entry = await post(ADA, { total: "300", lines: [{ dir: "out", base: "300" }] });
    await post(ADA, { reverses: entry, total: "300", lines: [{ dir: "in", base: "300" }] });
    await expect(post(ADA, { reverses: entry, total: "300", lines: [{ dir: "in", base: "300" }] })).rejects.toThrow();
  });

  it("keeps each person's money to themselves", async () => {
    const seen = await withSpace(db.app, TUNDE, (tx) => tx.query("SELECT (SELECT count(*) FROM money_entries)::int AS e, (SELECT count(*) FROM money_entry_lines)::int AS l"));
    expect(seen.rows[0]).toEqual({ e: 0, l: 0 });
    await expect(post(TUNDE, { total: "1", lines: [{ dir: "out", base: "1" }], reverses: undefined }).then(() =>
      withSpace(db.app, TUNDE, (tx) => tx.query("INSERT INTO money_entries (id, space_id, entry_date, kind, source_feature, source_record, source_version, currency, total_amount, created_by) VALUES ($1, $2, '2026-11-05', 'personal_spend', 'PER-010', $3, 1, 'NGN', 0, $2)", [id(), ADA, id()])),
    )).rejects.toThrow();
  });
});

describe("Budgets", () => {
  const budget = (space: string, category: string, month: string, amount: string | null) =>
    withSpace(db.app, space, async (tx) => {
      await tx.query("INSERT INTO money_categories (id, name, direction) VALUES ($1, 'Food', 'out') ON CONFLICT DO NOTHING", [category]);
      await tx.query("INSERT INTO money_budgets (id, category_id, from_month, amount) VALUES ($1, $2, $3::date, $4)", [id(), category, month, amount]);
    });

  it("keeps one limit per category per starting month, starting on the 1st, above zero", async () => {
    const food = id();
    await budget(ADA, food, "2026-11-01", "50000");
    await budget(ADA, food, "2026-12-01", null); // stopped from December
    await expect(budget(ADA, food, "2026-11-01", "60000")).rejects.toThrow(/money_budgets_uq/);
    await expect(budget(ADA, food, "2027-01-15", "60000")).rejects.toThrow(/money_budgets_month_ck/);
    await expect(budget(ADA, food, "2027-02-01", "0")).rejects.toThrow(/money_budgets_amount_ck/);
  });

  it("keeps each person's budgets to themselves", async () => {
    const seen = await withSpace(db.app, TUNDE, (tx) => tx.query("SELECT count(*)::int AS n FROM money_budgets"));
    expect(seen.rows[0]).toEqual({ n: 0 });
  });
});

describe("Savings goals", () => {
  const goal = (space: string, target: string, name = "Rent") =>
    withSpace(db.app, space, async (tx) => {
      const g = id();
      await tx.query("INSERT INTO money_goals (id, name, target) VALUES ($1, $2, $3)", [g, name, target]);
      return g;
    });
  const give = (space: string, goalId: string, amount: string, kind = "deposit") =>
    withSpace(db.app, space, (tx) => tx.query("INSERT INTO money_goal_contributions (id, goal_id, kind, contrib_date, amount) VALUES ($1, $2, $3, '2026-11-01', $4)", [id(), goalId, kind, amount]));

  it("needs a name and a target above zero; contributions are deposits or withdrawals above zero", async () => {
    await expect(goal(ADA, "0")).rejects.toThrow(/money_goals_target_ck/);
    await expect(goal(ADA, "100", "")).rejects.toThrow(/money_goals_name_ck/);
    const g = await goal(ADA, "500000");
    await give(ADA, g, "1000");
    await expect(give(ADA, g, "0")).rejects.toThrow(/money_goal_contrib_amount_ck/);
    await expect(give(ADA, g, "10", "gift")).rejects.toThrow(/money_goal_contrib_kind_ck/);
  });

  it("keeps each person's goals and contributions to themselves", async () => {
    const seen = await withSpace(db.app, TUNDE, (tx) => tx.query("SELECT (SELECT count(*) FROM money_goals)::int AS g, (SELECT count(*) FROM money_goal_contributions)::int AS c"));
    expect(seen.rows[0]).toEqual({ g: 0, c: 0 });
  });
});

describe("Connection security", () => {
  it("always asks for the strictest SSL mode, keeping everything else in the address", async () => {
    const { strictSsl } = await import("../src/pg.js");
    const neon = "postgresql://owner:p%40ss@ep-cool-1.eu-central-1.aws.neon.tech/velaq_personal?sslmode=require&channel_binding=require";
    const out = new URL(strictSsl(neon));
    expect(out.searchParams.get("sslmode")).toBe("verify-full");
    expect(out.searchParams.get("channel_binding")).toBe("require");
    expect(out.password).toBe("p%40ss");
    expect(out.hostname).toBe("ep-cool-1.eu-central-1.aws.neon.tech");
    expect(strictSsl("postgres://velaq_app:velaq_app@localhost:5432/velaq_personal")).toBe("postgres://velaq_app:velaq_app@localhost:5432/velaq_personal");
    expect(new URL(strictSsl("postgres://a:b@h/db?sslmode=disable")).searchParams.get("sslmode")).toBe("disable");
  });
});

describe("Tasks", () => {
  const addTask = (space: string, values: Record<string, unknown>) =>
    withSpace(db.app, space, (tx) =>
      tx.query("INSERT INTO tasks (id, title, priority, repeat) VALUES ($1, $2, $3, $4)", [id(), values.title ?? "Pay rent", values.priority ?? 0, values.repeat ?? null]),
    );

  it("checks titles, priorities and repeats", async () => {
    await addTask(ADA, {});
    await expect(addTask(ADA, { title: "" })).rejects.toThrow(/tasks_title_ck/);
    await expect(addTask(ADA, { priority: 4 })).rejects.toThrow(/tasks_priority_ck/);
    await expect(addTask(ADA, { repeat: "hourly" })).rejects.toThrow(/tasks_repeat_ck/);
  });

  it("keeps each person's tasks and lists to themselves, and never lets the app delete a task", async () => {
    const seen = await withSpace(db.app, TUNDE, (tx) => tx.query("SELECT (SELECT count(*) FROM tasks)::int AS t, (SELECT count(*) FROM task_lists)::int AS l"));
    expect(seen.rows[0]).toEqual({ t: 0, l: 0 });
    await expect(withSpace(db.app, ADA, (tx) => tx.query("DELETE FROM tasks"))).rejects.toThrow(/permission denied/);
  });
});
