/**
 * PER-011 Budgets: a monthly limit on a spending category.
 *
 * Limits are stored as "from this month on" rows, so a change never rewrites a past month.
 * What was spent always comes from the Money Journal, the same numbers Income & Expense shows.
 * With carry-over on, money left unspent last month is added to this month (overspending is
 * never carried as a debt). Sums are done in kobo (whole numbers) so nothing is lost to rounding.
 */
import { Inject, Injectable } from "@nestjs/common";
import { type Queryable, type TxRunner, withSpace } from "@velaq/db";
import { uuidv7 } from "../identity/uuid.js";
import { PERSONAL_DB } from "../space/space.service.js";
import { MoneyError } from "./money.service.js";

export const BUDGETS = "PER-011";
/** Budgets on the Free plan. Premium has no limit. Enforced only when ENFORCE_PLAN_LIMITS=on. */
export const FREE_BUDGETS = 5;
/** How far back carry-over is worked out. */
const LOOKBACK = 24;

export type BudgetState = "ok" | "near" | "over";
export interface Budget {
  categoryId: string;
  name: string;
  /** This month's limit as set. */
  limit: string;
  rollover: boolean;
  /** Left over from last month and added to this one (carry-over only). */
  carried: string;
  /** limit + carried. */
  available: string;
  spent: string;
  /** available - spent; negative when over. */
  left: string;
  percent: number;
  state: BudgetState;
  /** For the current month: what can be spent each day until the month ends, in whole naira. */
  perDay: string | null;
}

const kobo = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const naira = (k: number) => (k / 100).toFixed(2);
const firstDay = (month: string) => `${month}-01`;
export const lagosMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const lagosDay = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", day: "2-digit" }).format(new Date()));
export function addMonths(month: string, n: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const stateOf = (spent: number, available: number): BudgetState => (spent > available ? "over" : spent >= available * 0.8 ? "near" : "ok");

interface Rule { categoryId: string; from: string; amount: number | null; rollover: boolean }

@Injectable()
export class BudgetService {
  constructor(@Inject(PERSONAL_DB) private readonly db: TxRunner) {}

  /** Every budget for a month, the categories still without one, and the month's totals. */
  async month(spaceId: string, month: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const plan = await this.plan(tx);
      const home = (await tx.query<{ home_currency: string }>("SELECT home_currency FROM money_settings")).rows[0]?.home_currency ?? "NGN";
      const categories = (await tx.query<{ id: string; name: string; archived: boolean }>("SELECT id, name, archived FROM money_categories WHERE direction = 'out' ORDER BY position, name")).rows;
      const budgets = await this.compute(tx, month);
      const names = new Map(categories.map((c) => [c.id, c.name]));
      const items = [...budgets.entries()].map(([id, b]) => this.view(id, names.get(id) ?? "Other", b, month)).sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
      const totals = await this.totals(tx, month);
      const budgeted = items.reduce((s, b) => s + kobo(b.available), 0);
      const spentInBudgets = items.reduce((s, b) => s + kobo(b.spent), 0);
      return {
        month,
        homeCurrency: home,
        items,
        /** Spending categories that could still get a budget. */
        unbudgeted: categories.filter((c) => !c.archived && !budgets.has(c.id)).map((c) => ({ categoryId: c.id, name: c.name, spent: naira(totals.byCategory.get(c.id) ?? 0) })),
        totals: {
          budgeted: naira(budgeted),
          spentInBudgets: naira(spentInBudgets),
          income: naira(totals.income),
          spending: naira(totals.spending),
          /** Spending in categories with no budget this month. */
          outsideBudgets: naira(totals.spending - spentInBudgets),
        },
        plan: { limit: plan.limit, enforced: plan.enforced, used: items.length },
      };
    });
  }

  /** Sets a category's limit from a month on (normally the current month). */
  async set(spaceId: string, categoryId: string, input: { amount: string; rollover: boolean }, month: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const plan = await this.plan(tx);
      const c = (await tx.query<{ direction: string; archived: boolean }>("SELECT direction, archived FROM money_categories WHERE id = $1", [categoryId])).rows[0];
      if (!c) throw new MoneyError(404, "That category doesn't exist.");
      if (c.direction !== "out") throw new MoneyError(400, "Budgets are for spending categories.", "categoryId");
      const active = await this.compute(tx, month);
      if (plan.enforced && plan.limit !== null && !active.has(categoryId) && active.size >= plan.limit) {
        throw new MoneyError(409, `The Free plan includes budgets on ${plan.limit} categories. Remove one, or move to Premium for more.`);
      }
      await this.upsert(tx, categoryId, month, input.amount, input.rollover);
    });
  }

  /** Stops a category's budget from a month on. Earlier months keep theirs. */
  async stop(spaceId: string, categoryId: string, month: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const active = await this.compute(tx, month);
      if (!active.has(categoryId)) throw new MoneyError(404, "That category has no budget this month.");
      await this.upsert(tx, categoryId, month, null, false);
    });
  }

  /** After an entry is saved: how its category's budget now stands, if it's close to or over the limit. */
  async alertFor(spaceId: string, categoryId: string | null, date: string) {
    if (!categoryId) return null;
    const month = date.slice(0, 7);
    return withSpace(this.db, spaceId, async (tx) => {
      const b = (await this.compute(tx, month, categoryId)).get(categoryId);
      if (!b) return null;
      const name = (await tx.query<{ name: string }>("SELECT name FROM money_categories WHERE id = $1", [categoryId])).rows[0]?.name ?? "";
      const v = this.view(categoryId, name, b, month);
      return v.state === "ok" ? null : { categoryId, name, month, state: v.state, percent: v.percent, available: v.available, spent: v.spent, left: v.left };
    });
  }

  // ---------------------------------------------------------------------------------------------

  /** Free has a budget limit; it is only enforced once plans are switched on (ENFORCE_PLAN_LIMITS=on). */
  private async plan(tx: Queryable) {
    const plan = (await tx.query<{ plan: string }>("SELECT plan FROM spaces")).rows[0]?.plan ?? "free";
    return { limit: plan === "free" ? FREE_BUDGETS : null, enforced: process.env.ENFORCE_PLAN_LIMITS === "on" };
  }

  private async upsert(tx: Queryable, categoryId: string, month: string, amount: string | null, rollover: boolean) {
    await tx.query(
      `INSERT INTO money_budgets (id, category_id, from_month, amount, rollover) VALUES ($1, $2, $3::date, $4, $5)
       ON CONFLICT (space_id, category_id, from_month) DO UPDATE SET amount = EXCLUDED.amount, rollover = EXCLUDED.rollover, updated_at = now()`,
      [uuidv7(), categoryId, firstDay(month), amount, rollover],
    );
  }

  /** Works out each budget for a month, carrying unspent money forward where carry-over is on. */
  private async compute(tx: Queryable, month: string, only?: string) {
    const rules = (
      await tx.query<{ category_id: string; from_month: string | Date; amount: string | null; rollover: boolean }>(
        "SELECT category_id, from_month, amount, rollover FROM money_budgets WHERE from_month <= $1::date AND ($2::uuid IS NULL OR category_id = $2) ORDER BY from_month",
        [firstDay(month), only ?? null],
      )
    ).rows.map<Rule>((r) => ({
      categoryId: r.category_id,
      from: (typeof r.from_month === "string" ? r.from_month : r.from_month.toISOString()).slice(0, 7),
      amount: r.amount === null ? null : kobo(r.amount),
      rollover: r.rollover,
    }));
    const out = new Map<string, { limit: number; rollover: boolean; carried: number; available: number; spent: number }>();
    if (!rules.length) return out;
    const start = [rules[0]!.from, addMonths(month, -LOOKBACK)].sort().at(-1)!;
    const spent = await this.spentByMonth(tx, start, month);
    for (const id of new Set(rules.map((r) => r.categoryId))) {
      const mine = rules.filter((r) => r.categoryId === id);
      let prev: { available: number; spent: number } | null = null;
      for (let m = start; m <= month; m = addMonths(m, 1)) {
        const rule = mine.filter((r) => r.from <= m).at(-1);
        if (!rule || rule.amount === null) {
          prev = null;
          continue;
        }
        const carried: number = rule.rollover && prev ? Math.max(0, prev.available - prev.spent) : 0;
        const s = spent.get(`${id}|${m}`) ?? 0;
        const now: { limit: number; rollover: boolean; carried: number; available: number; spent: number } = { limit: rule.amount, rollover: rule.rollover, carried, available: rule.amount + carried, spent: s };
        prev = now;
        if (m === month) out.set(id, now);
      }
    }
    return out;
  }

  /** Spending per category per month, in kobo of the home currency, from the journal. Reversals cancel. */
  private async spentByMonth(tx: Queryable, from: string, to: string) {
    const r = await tx.query<{ category: string; month: string; spent: string }>(
      `SELECT l.category, to_char(e.entry_date, 'YYYY-MM') AS month,
              sum(CASE l.direction WHEN 'out' THEN l.base_amount ELSE -l.base_amount END)::text AS spent
         FROM money_entry_lines l JOIN money_entries e ON e.id = l.entry_id
        WHERE e.kind = 'personal_spend' AND e.entry_date >= $1::date AND e.entry_date < $2::date + interval '1 month'
        GROUP BY 1, 2`,
      [firstDay(from), firstDay(to)],
    );
    return new Map(r.rows.map((x) => [`${x.category}|${x.month}`, kobo(x.spent)]));
  }

  private async totals(tx: Queryable, month: string) {
    const r = await tx.query<{ category: string; kind: string; net: string }>(
      `SELECT l.category, e.kind, sum(CASE l.direction WHEN 'in' THEN l.base_amount ELSE -l.base_amount END)::text AS net
         FROM money_entry_lines l JOIN money_entries e ON e.id = l.entry_id
        WHERE e.kind IN ('personal_income','personal_spend')
          AND e.entry_date >= $1::date AND e.entry_date < $1::date + interval '1 month'
        GROUP BY 1, 2`,
      [firstDay(month)],
    );
    const byCategory = new Map(r.rows.filter((x) => x.kind === "personal_spend").map((x) => [x.category, -kobo(x.net)]));
    return {
      income: r.rows.filter((x) => x.kind === "personal_income").reduce((s, x) => s + kobo(x.net), 0),
      spending: [...byCategory.values()].reduce((s, v) => s + v, 0),
      byCategory,
    };
  }

  private view(categoryId: string, name: string, b: { limit: number; rollover: boolean; carried: number; available: number; spent: number }, month: string): Budget {
    const left = b.available - b.spent;
    const now = lagosMonth();
    const daysLeft = month === now ? daysIn(month) - lagosDay() + 1 : 0;
    return {
      categoryId,
      name,
      limit: naira(b.limit),
      rollover: b.rollover,
      carried: naira(b.carried),
      available: naira(b.available),
      spent: naira(b.spent),
      left: naira(left),
      percent: b.available > 0 ? Math.round((b.spent / b.available) * 100) : 0,
      state: stateOf(b.spent, b.available),
      perDay: month === now && left > 0 ? naira(Math.floor(left / daysLeft / 100) * 100) : month === now ? "0.00" : null,
    };
  }
}
