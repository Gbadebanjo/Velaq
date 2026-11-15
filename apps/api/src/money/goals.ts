/**
 * PER-012 Savings Goals.
 *
 * A goal earmarks money for something (rent, a laptop, school fees). Money set aside stays in the
 * person's accounts; the goal keeps count. Every contribution posts to the Money Journal (kind
 * 'savings', one line on the goal), so how much a goal holds is read from the journal and can't
 * drift. Removing a contribution posts a reversal, like everything else in Money.
 *
 * Money can be set aside by hand, or while recording income ("put ₦20,000 of this salary toward
 * Rent"). That link lives on the contribution, and follows the income entry when it's edited or deleted.
 */
import { Inject, Injectable } from "@nestjs/common";
import { type Queryable, type TxRunner, withSpace } from "@velaq/db";
import { uuidv7 } from "../identity/uuid.js";
import { PERSONAL_DB } from "../space/space.service.js";
import { addMonths, lagosMonth } from "./budgets.js";
import { MoneyError, type Transaction } from "./money.service.js";

export const GOALS = "PER-012";
const SOURCE = "PER-012";
const MAX_GOALS = 20;
/** Months of recent saving used to work out the pace. */
const PACE_MONTHS = 3;

export type GoalStatus = "reached" | "on_track" | "behind" | "overdue" | "no_date" | "not_started";
export interface Contribution {
  id: string;
  kind: "deposit" | "withdrawal";
  date: string;
  amount: string;
  note: string;
  transactionId: string | null;
}
export interface Goal {
  id: string;
  name: string;
  target: string;
  targetDate: string | null;
  archived: boolean;
  saved: string;
  remaining: string;
  percent: number;
  status: GoalStatus;
  /** To finish by the target date: how much to set aside each month from now. */
  monthlyNeeded: string | null;
  /** Average set aside per month recently. */
  pace: string;
  /** At that pace, the month the goal would be reached. */
  projectedMonth: string | null;
  contributions: Contribution[];
}

const kobo = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const naira = (k: number) => (k / 100).toFixed(2);
const day = (v: string | Date) => (typeof v === "string" ? v : v.toISOString()).slice(0, 10);
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

@Injectable()
export class GoalService {
  constructor(@Inject(PERSONAL_DB) private readonly db: TxRunner) {}

  async list(spaceId: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const home = (await tx.query<{ home_currency: string }>("SELECT home_currency FROM money_settings")).rows[0]?.home_currency ?? "NGN";
      const goals = await this.read(tx);
      const active = goals.filter((g) => !g.archived);
      return {
        homeCurrency: home,
        goals,
        totals: {
          saved: naira(active.reduce((s, g) => s + kobo(g.saved), 0)),
          target: naira(active.reduce((s, g) => s + kobo(g.target), 0)),
        },
      };
    });
  }

  async create(spaceId: string, g: { name: string; target: string; targetDate: string | null }) {
    return withSpace(this.db, spaceId, async (tx) => {
      const n = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM money_goals WHERE NOT archived")).rows[0]!.n;
      if (n >= MAX_GOALS) throw new MoneyError(409, `You can have up to ${MAX_GOALS} goals at a time. Archive one you've finished with.`);
      const id = uuidv7();
      await tx.query("INSERT INTO money_goals (id, name, target, target_date, position) VALUES ($1, $2, $3, $4, $5)", [id, g.name, g.target, g.targetDate, n]);
      return id;
    });
  }

  async update(spaceId: string, id: string, g: { name?: string; target?: string; targetDate?: string | null; archived?: boolean }) {
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query(
        `UPDATE money_goals SET name = coalesce($2, name), target = coalesce($3, target),
                target_date = CASE WHEN $4::boolean THEN $5::date ELSE target_date END,
                archived = coalesce($6, archived), updated_at = now()
          WHERE id = $1 RETURNING id`,
        [id, g.name ?? null, g.target ?? null, g.targetDate !== undefined, g.targetDate ?? null, g.archived ?? null],
      );
      if (!r.rows.length) throw new MoneyError(404, "That goal doesn't exist.");
    });
  }

  /** Adds money to a goal, or takes some back out. */
  async contribute(spaceId: string, actorId: string, goalId: string, c: { kind: "deposit" | "withdrawal"; date: string; amount: string; note: string }) {
    return withSpace(this.db, spaceId, async (tx) => {
      const goal = await this.goal(tx, goalId);
      if (goal.archived) throw new MoneyError(409, "That goal is archived. Bring it back to add to it.");
      if (c.kind === "withdrawal") {
        const saved = await this.savedIn(tx, goalId);
        if (kobo(c.amount) > saved) throw new MoneyError(400, `The goal holds ${naira(saved)}. You can't take out more than that.`, "amount");
      }
      const id = uuidv7();
      await tx.query("INSERT INTO money_goal_contributions (id, goal_id, kind, contrib_date, amount, note) VALUES ($1, $2, $3, $4, $5, $6)", [id, goalId, c.kind, c.date, c.amount, c.note]);
      await this.post(tx, actorId, { id, goalId, kind: c.kind, date: c.date, amount: c.amount, note: c.note || goal.name }, 1);
      return id;
    });
  }

  async removeContribution(spaceId: string, actorId: string, id: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query<{ goal_id: string; kind: string; amount: string; version: number; transaction_id: string | null }>(
        "SELECT goal_id, kind, amount, version, transaction_id FROM money_goal_contributions WHERE id = $1 AND NOT deleted FOR UPDATE",
        [id],
      );
      const c = r.rows[0];
      if (!c) throw new MoneyError(404, "That contribution doesn't exist.");
      if (c.kind === "deposit" && kobo(c.amount) > (await this.savedIn(tx, c.goal_id))) {
        throw new MoneyError(409, "Some of this money has already been taken out of the goal, so it can't be removed.");
      }
      await tx.query("UPDATE money_goal_contributions SET deleted = true, updated_at = now() WHERE id = $1", [id]);
      await this.reverse(tx, actorId, id, c.version);
    });
  }

  // ---- Money set aside while recording income ---------------------------------------------------

  /** Checks a set-aside before the income entry is saved. */
  async checkSetAside(tx: Queryable, s: { goalId: string; amount: string } | null) {
    if (!s) return;
    const goal = (await tx.query<{ archived: boolean }>("SELECT archived FROM money_goals WHERE id = $1", [s.goalId])).rows[0];
    if (!goal) throw new MoneyError(400, "Choose a goal.", "setAside.goalId");
    if (goal.archived) throw new MoneyError(400, "That goal is archived.", "setAside.goalId");
  }

  /**
   * Runs inside the same database transaction as saving the income entry, so both happen or neither.
   * Replaces whatever was set aside from this entry before (or removes it when s is null).
   */
  async linkIncome(tx: Queryable, actorId: string, t: Transaction | null, s: { goalId: string; amount: string } | null, deleted = false) {
    if (!t) return;
    const wanted = t.kind === "income" && !deleted ? s : null;
    if (wanted && kobo(wanted.amount) > kobo(t.baseAmount)) {
      throw new MoneyError(400, "You can't set aside more than the income itself.", "setAside.amount");
    }
    const old = (await tx.query<{ id: string; goal_id: string; amount: string; version: number }>(
      "SELECT id, goal_id, amount, version FROM money_goal_contributions WHERE transaction_id = $1 AND NOT deleted FOR UPDATE",
      [t.id],
    )).rows[0];
    const same = old && wanted && old.goal_id === wanted.goalId && kobo(old.amount) === kobo(wanted.amount);
    if (same) {
      // Keep the date in step with the income entry.
      await tx.query("UPDATE money_goal_contributions SET contrib_date = $2 WHERE id = $1 AND contrib_date <> $2::date", [old.id, t.date]);
      return;
    }
    if (old) {
      if (kobo(old.amount) > (await this.savedIn(tx, old.goal_id))) {
        throw new MoneyError(409, "Money set aside from this income has since been taken out of its goal, so the set-aside can't change.");
      }
      await tx.query("UPDATE money_goal_contributions SET deleted = true, updated_at = now() WHERE id = $1", [old.id]);
      await this.reverse(tx, actorId, old.id, old.version);
    }
    if (wanted) {
      const id = uuidv7();
      await tx.query(
        "INSERT INTO money_goal_contributions (id, goal_id, kind, contrib_date, amount, note, transaction_id) VALUES ($1, $2, 'deposit', $3, $4, $5, $6)",
        [id, wanted.goalId, t.date, wanted.amount, t.note ? `From: ${t.note}` : "From income", t.id],
      );
      await this.post(tx, actorId, { id, goalId: wanted.goalId, kind: "deposit", date: t.date, amount: wanted.amount, note: t.note || "From income" }, 1);
    }
  }

  /** What was set aside from each of these income entries, for the edit window. */
  async setAsides(spaceId: string, transactionIds: string[]) {
    if (!transactionIds.length) return new Map<string, { goalId: string; amount: string }>();
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query<{ transaction_id: string; goal_id: string; amount: string }>(
        "SELECT transaction_id, goal_id, amount::text FROM money_goal_contributions WHERE transaction_id = ANY($1::uuid[]) AND NOT deleted",
        [transactionIds],
      );
      return new Map(r.rows.map((x) => [x.transaction_id, { goalId: x.goal_id, amount: naira(kobo(x.amount)) }]));
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async goal(tx: Queryable, id: string) {
    const g = (await tx.query<{ id: string; name: string; archived: boolean }>("SELECT id, name, archived FROM money_goals WHERE id = $1", [id])).rows[0];
    if (!g) throw new MoneyError(404, "That goal doesn't exist.");
    return g;
  }

  /** How much a goal holds, in kobo, from the journal. */
  private async savedIn(tx: Queryable, goalId: string) {
    const r = await tx.query<{ net: string | null }>(
      `SELECT sum(CASE l.direction WHEN 'in' THEN l.base_amount ELSE -l.base_amount END)::text AS net
         FROM money_entry_lines l JOIN money_entries e ON e.id = l.entry_id
        WHERE e.kind = 'savings' AND l.category = $1`,
      [goalId],
    );
    return kobo(r.rows[0]?.net);
  }

  private async read(tx: Queryable): Promise<Goal[]> {
    const goals = (await tx.query<{ id: string; name: string; target: string; target_date: string | Date | null; archived: boolean; created_at: Date }>(
      "SELECT id, name, target::text, target_date, archived, created_at FROM money_goals ORDER BY archived, position, created_at",
    )).rows;
    if (!goals.length) return [];
    const now = lagosMonth();
    const paceFrom = addMonths(now, -(PACE_MONTHS - 1));
    const journal = (await tx.query<{ goal: string; month: string; net: string }>(
      `SELECT l.category AS goal, to_char(e.entry_date, 'YYYY-MM') AS month,
              sum(CASE l.direction WHEN 'in' THEN l.base_amount ELSE -l.base_amount END)::text AS net
         FROM money_entry_lines l JOIN money_entries e ON e.id = l.entry_id
        WHERE e.kind = 'savings' GROUP BY 1, 2`,
    )).rows;
    const contributions = (await tx.query<{ id: string; goal_id: string; kind: Contribution["kind"]; contrib_date: string | Date; amount: string; note: string; transaction_id: string | null }>(
      `SELECT id, goal_id, kind, contrib_date, amount::text, note, transaction_id FROM (
         SELECT *, row_number() OVER (PARTITION BY goal_id ORDER BY contrib_date DESC, created_at DESC) AS n
           FROM money_goal_contributions WHERE NOT deleted) c
        WHERE n <= 30 ORDER BY contrib_date DESC, created_at DESC`,
    )).rows;

    return goals.map((g) => {
      const mine = journal.filter((j) => j.goal === g.id);
      const saved = mine.reduce((s, j) => s + kobo(j.net), 0);
      const target = kobo(g.target);
      const remaining = Math.max(0, target - saved);
      const targetMonth = g.target_date ? day(g.target_date).slice(0, 7) : null;
      // Pace: what was set aside over the last few months, counting only months since the goal began.
      const started = [day(g.created_at).slice(0, 7), ...mine.map((j) => j.month)].sort()[0]!;
      const since = started > paceFrom ? started : paceFrom;
      const span = monthsBetween(since, now) + 1;
      const recent = mine.filter((j) => j.month >= since && j.month <= now).reduce((s, j) => s + kobo(j.net), 0);
      const pace = Math.max(0, Math.round(recent / span));
      const projectedMonth = remaining === 0 ? null : pace > 0 ? addMonths(now, Math.ceil(remaining / pace)) : null;
      const monthsLeft = targetMonth ? monthsBetween(now, targetMonth) + 1 : null;
      const monthlyNeeded = remaining > 0 && monthsLeft !== null && monthsLeft > 0 ? naira(Math.ceil(remaining / monthsLeft / 100) * 100) : null;
      const status: GoalStatus =
        remaining === 0 ? "reached"
        : targetMonth && targetMonth < now ? "overdue"
        : saved === 0 && pace === 0 ? "not_started"
        : !targetMonth ? "no_date"
        : projectedMonth && projectedMonth <= targetMonth ? "on_track"
        : "behind";
      return {
        id: g.id,
        name: g.name,
        target: naira(target),
        targetDate: g.target_date ? day(g.target_date) : null,
        archived: g.archived,
        saved: naira(saved),
        remaining: naira(remaining),
        percent: Math.min(100, Math.floor((saved / target) * 100)),
        status,
        monthlyNeeded,
        pace: naira(pace),
        projectedMonth,
        contributions: contributions
          .filter((c) => c.goal_id === g.id)
          .map((c) => ({ id: c.id, kind: c.kind, date: day(c.contrib_date), amount: naira(kobo(c.amount)), note: c.note, transactionId: c.transaction_id })),
      };
    });
  }

  /** Posts a contribution to the Money Journal: one line on the goal, in the home currency. */
  private async post(tx: Queryable, actorId: string, c: { id: string; goalId: string; kind: string; date: string; amount: string; note: string }, version: number) {
    const home = (await tx.query<{ home_currency: string }>("SELECT home_currency FROM money_settings")).rows[0]?.home_currency ?? "NGN";
    const entry = uuidv7();
    await tx.query(
      `INSERT INTO money_entries (id, entry_date, kind, source_feature, source_record, source_version, description, currency, total_amount, created_by)
       VALUES ($1, $2, 'savings', $3, $4, $5, $6, $7, $8, $9)`,
      [entry, c.date, SOURCE, c.id, version, c.note, home, c.amount, actorId],
    );
    await tx.query(
      `INSERT INTO money_entry_lines (id, entry_id, line_no, category, direction, amount, currency, fx_rate, base_amount, dimensions)
       VALUES ($1, $2, 1, $3, $4, $5, $6, 1, $5, $7::jsonb)`,
      [uuidv7(), entry, c.goalId, c.kind === "deposit" ? "in" : "out", c.amount, home, JSON.stringify({ goal_id: c.goalId })],
    );
  }

  private async reverse(tx: Queryable, actorId: string, recordId: string, version: number) {
    const original = (await tx.query<{ id: string; entry_date: string; currency: string; total_amount: string }>(
      "SELECT id, entry_date, currency, total_amount FROM money_entries WHERE source_feature = $1 AND source_record = $2 AND source_version = $3",
      [SOURCE, recordId, version],
    )).rows[0];
    if (!original) return;
    const entry = uuidv7();
    await tx.query(
      `INSERT INTO money_entries (id, entry_date, kind, source_feature, source_record, source_version, description, currency, total_amount, reverses_entry_id, created_by)
       VALUES ($1, $2, 'savings', $3, $4, $5, 'Correction', $6, $7, $8, $9)`,
      [entry, original.entry_date, `${SOURCE}:reversal`, recordId, version, original.currency, original.total_amount, original.id, actorId],
    );
    await tx.query(
      `INSERT INTO money_entry_lines (id, entry_id, line_no, category, direction, amount, currency, fx_rate, base_amount, dimensions)
       SELECT gen_random_uuid(), $1, line_no, category, CASE direction WHEN 'in' THEN 'out' ELSE 'in' END, amount, currency, fx_rate, base_amount, dimensions
         FROM money_entry_lines WHERE entry_id = $2`,
      [entry, original.id],
    );
  }
}
