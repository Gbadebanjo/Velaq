/**
 * PER-010 Income & Expense Tracking, and the Personal Money Journal (FND-026) it writes to.
 *
 * Transactions are the person's own editable records. Every change posts to the journal:
 *   add     -> a new entry (version 1)
 *   edit    -> an entry reversing the previous version, then a new entry (version n+1)
 *   delete  -> an entry reversing the last version
 * Reports read the journal, so they always add up, history included.
 */
import { Inject, Injectable } from "@nestjs/common";
import { type Queryable, type TxRunner, withSpace } from "@velaq/db";
import { uuidv7 } from "../identity/uuid.js";
import { PERSONAL_DB } from "../space/space.service.js";
import { type CsvItem, guessCategory, guessMapping, importHash, parseCsv, readRows } from "./csv.js";
import type { Mapping, TransactionInput } from "./money.schemas.js";

export const FEATURE = "PER-010";

export class MoneyError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export interface Account {
  id: string;
  name: string;
  kind: string;
  currency: string;
  openingBalance: string;
  archived: boolean;
}
export interface Category {
  id: string;
  name: string;
  direction: "in" | "out";
  archived: boolean;
}
/** Runs inside the same database transaction as saving or deleting an entry (used by Savings Goals). */
export type EntryHook = (tx: Queryable, saved: Transaction | null, deleted: boolean) => Promise<void>;

export interface Transaction {
  id: string;
  kind: "income" | "expense" | "transfer";
  date: string;
  amount: string;
  currency: string;
  fxRate: string;
  baseAmount: string;
  accountId: string;
  toAccountId: string | null;
  toAmount: string | null;
  categoryId: string | null;
  note: string;
  tags: string[];
  source: string;
}

const DEFAULT_OUT = ["Food & groceries", "Transport", "Data & airtime", "Rent & housing", "Bills & utilities", "Family & dependants", "Health", "Education", "Shopping", "Entertainment", "Personal care", "Giving & donations", "Bank charges", "Other"];
const DEFAULT_IN = ["Salary", "Business & freelance", "Gifts", "Investment returns", "Refunds", "Other income"];

const MAX_ACCOUNTS = 30;
const MAX_CATEGORIES = 60;

type Row = Record<string, unknown>;
const txn = (r: Row): Transaction => ({
  id: r.id as string,
  kind: r.kind as Transaction["kind"],
  date: typeof r.txn_date === "string" ? r.txn_date : new Date(r.txn_date as Date).toISOString().slice(0, 10),
  amount: String(r.amount),
  currency: String(r.currency),
  fxRate: String(r.fx_rate),
  baseAmount: String(r.base_amount),
  accountId: r.account_id as string,
  toAccountId: (r.to_account_id as string) ?? null,
  toAmount: r.to_amount === null || r.to_amount === undefined ? null : String(r.to_amount),
  categoryId: (r.category_id as string) ?? null,
  note: r.note as string,
  tags: (r.tags as string[]) ?? [],
  source: r.source as string,
});
const dec = (v: unknown) => Number(v ?? 0).toFixed(2);

@Injectable()
export class MoneyService {
  constructor(@Inject(PERSONAL_DB) private readonly db: TxRunner) {}

  // ---- Setup -------------------------------------------------------------------------------------

  /** Home currency, accounts and categories. The first visit sets up a Cash account and default categories. */
  async setup(spaceId: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const settings = await tx.query<{ home_currency: string }>("SELECT home_currency FROM money_settings");
      if (!settings.rows.length) await this.seed(tx);
      return this.read(tx);
    });
  }

  private async seed(tx: Queryable) {
    // A page loads several money requests at once, and each may arrive here. Only the one whose insert
    // creates the settings row adds the starter account and categories; the others wait on that row,
    // then find it exists and add nothing.
    const created = await tx.query("INSERT INTO money_settings DEFAULT VALUES ON CONFLICT DO NOTHING RETURNING space_id");
    if (!created.rows.length) return;
    await tx.query("INSERT INTO money_accounts (id, name, kind, currency) VALUES ($1, 'Cash', 'cash', 'NGN')", [uuidv7()]);
    const all = [...DEFAULT_OUT.map((n) => [n, "out"]), ...DEFAULT_IN.map((n) => [n, "in"])];
    for (const [i, [name, dir]] of all.entries()) {
      await tx.query("INSERT INTO money_categories (id, name, direction, position) VALUES ($1, $2, $3, $4)", [uuidv7(), name, dir, i]);
    }
  }

  private async read(tx: Queryable) {
    const s = await tx.query<{ home_currency: string }>("SELECT home_currency FROM money_settings");
    const a = await tx.query<Row>("SELECT id, name, kind, currency, opening_balance, archived FROM money_accounts ORDER BY archived, position, created_at");
    const c = await tx.query<Row>("SELECT id, name, direction, archived FROM money_categories ORDER BY archived, direction DESC, position, name");
    const used = await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM money_transactions");
    return {
      homeCurrency: s.rows[0]?.home_currency ?? "NGN",
      /** The home currency can only change before anything is recorded. */
      homeCurrencyLocked: (used.rows[0]?.n ?? 0) > 0,
      accounts: a.rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, currency: r.currency, openingBalance: dec(r.opening_balance), archived: r.archived }) as Account),
      categories: c.rows.map((r) => ({ id: r.id, name: r.name, direction: r.direction, archived: r.archived }) as Category),
    };
  }

  async setHomeCurrency(spaceId: string, currency: string) {
    await this.setup(spaceId);
    return withSpace(this.db, spaceId, async (tx) => {
      const used = await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM money_transactions");
      if ((used.rows[0]?.n ?? 0) > 0) throw new MoneyError(409, "The home currency can't change once you've recorded money. Your totals are kept in it.");
      await tx.query("UPDATE money_settings SET home_currency = $1", [currency]);
      // The starter Cash account follows the home currency while it is still unused.
      await tx.query("UPDATE money_accounts SET currency = $1 WHERE name = 'Cash' AND kind = 'cash'", [currency]);
      return this.read(tx);
    });
  }

  // ---- Accounts and categories ---------------------------------------------------------------------

  async addAccount(spaceId: string, a: { name: string; kind: string; currency: string; openingBalance: string }) {
    await this.setup(spaceId);
    return withSpace(this.db, spaceId, async (tx) => {
      const n = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM money_accounts")).rows[0]?.n ?? 0;
      if (n >= MAX_ACCOUNTS) throw new MoneyError(409, `You can have up to ${MAX_ACCOUNTS} accounts. Archive one you no longer use.`);
      await tx.query("INSERT INTO money_accounts (id, name, kind, currency, opening_balance, position) VALUES ($1, $2, $3, $4, $5, $6)", [uuidv7(), a.name, a.kind, a.currency, a.openingBalance, n]);
      return this.read(tx);
    });
  }

  async updateAccount(spaceId: string, id: string, a: { name?: string; archived?: boolean }) {
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query("UPDATE money_accounts SET name = coalesce($2, name), archived = coalesce($3, archived) WHERE id = $1 RETURNING id", [id, a.name ?? null, a.archived ?? null]);
      if (!r.rows.length) throw new MoneyError(404, "That account doesn't exist.");
      return this.read(tx);
    });
  }

  async addCategory(spaceId: string, c: { name: string; direction: "in" | "out" }) {
    await this.setup(spaceId);
    return withSpace(this.db, spaceId, async (tx) => {
      const rows = (await tx.query<{ name: string; direction: string }>("SELECT name, direction FROM money_categories")).rows;
      if (rows.length >= MAX_CATEGORIES) throw new MoneyError(409, `You can have up to ${MAX_CATEGORIES} categories. Archive one you no longer use.`);
      if (rows.some((r) => r.direction === c.direction && r.name.toLowerCase() === c.name.toLowerCase())) throw new MoneyError(409, "You already have a category with that name.", "name");
      await tx.query("INSERT INTO money_categories (id, name, direction, position) VALUES ($1, $2, $3, $4)", [uuidv7(), c.name, c.direction, rows.length]);
      return this.read(tx);
    });
  }

  async updateCategory(spaceId: string, id: string, c: { name?: string; archived?: boolean }) {
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query("UPDATE money_categories SET name = coalesce($2, name), archived = coalesce($3, archived) WHERE id = $1 RETURNING id", [id, c.name ?? null, c.archived ?? null]);
      if (!r.rows.length) throw new MoneyError(404, "That category doesn't exist.");
      return this.read(tx);
    });
  }

  // ---- Transactions --------------------------------------------------------------------------------

  async list(spaceId: string, month: string, filter: { accountId?: string; categoryId?: string } = {}): Promise<Transaction[]> {
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query<Row>(
        `SELECT * FROM money_transactions
          WHERE NOT deleted AND txn_date >= ($1 || '-01')::date AND txn_date < ($1 || '-01')::date + interval '1 month'
            AND ($2::uuid IS NULL OR account_id = $2 OR to_account_id = $2) AND ($3::uuid IS NULL OR category_id = $3)
          ORDER BY txn_date DESC, created_at DESC`,
        [month, filter.accountId ?? null, filter.categoryId ?? null],
      );
      return r.rows.map(txn);
    });
  }

  async add(spaceId: string, actorId: string, t: TransactionInput, source: "manual" | "csv" = "manual", hash: string | null = null, hook?: EntryHook): Promise<Transaction | null> {
    return withSpace(this.db, spaceId, async (tx) => {
      const v = await this.validate(tx, t);
      const id = uuidv7();
      const r = await tx.query<Row>(
        `INSERT INTO money_transactions (id, kind, txn_date, amount, currency, fx_rate, base_amount, account_id, to_account_id, to_amount, category_id, note, tags, source, import_hash)
         VALUES ($1, $2, $3, $4, $5, $6, round($4::numeric * $6::numeric, 2), $7, $8, $9, $10, $11, $12::text[], $13, $14)
         ON CONFLICT (space_id, account_id, import_hash) DO NOTHING
         RETURNING *`,
        [id, t.kind, t.date, t.amount, v.currency, v.fxRate, t.accountId, t.toAccountId ?? null, v.toAmount, t.categoryId ?? null, t.note, t.tags, source, hash],
      );
      if (!r.rows.length) return null; // the same statement line was imported before
      const saved = txn(r.rows[0]!);
      await this.post(tx, actorId, saved, 1, v);
      await hook?.(tx, saved, false);
      return saved;
    });
  }

  async update(spaceId: string, actorId: string, id: string, t: TransactionInput, hook?: EntryHook): Promise<Transaction> {
    return withSpace(this.db, spaceId, async (tx) => {
      const before = (await tx.query<Row>("SELECT * FROM money_transactions WHERE id = $1 AND NOT deleted FOR UPDATE", [id])).rows[0];
      if (!before) throw new MoneyError(404, "That entry doesn't exist.");
      const v = await this.validate(tx, t);
      const version = (before.version as number) + 1;
      const r = await tx.query<Row>(
        `UPDATE money_transactions SET kind = $2, txn_date = $3, amount = $4, currency = $5, fx_rate = $6, base_amount = round($4::numeric * $6::numeric, 2),
                account_id = $7, to_account_id = $8, to_amount = $9, category_id = $10, note = $11, tags = $12::text[], version = $13, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id, t.kind, t.date, t.amount, v.currency, v.fxRate, t.accountId, t.toAccountId ?? null, v.toAmount, t.categoryId ?? null, t.note, t.tags, version],
      );
      await this.reverse(tx, actorId, id, version - 1);
      const saved = txn(r.rows[0]!);
      await this.post(tx, actorId, saved, version, v);
      await hook?.(tx, saved, false);
      return saved;
    });
  }

  async remove(spaceId: string, actorId: string, id: string, hook?: EntryHook): Promise<void> {
    await withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query<Row>("UPDATE money_transactions SET deleted = true, updated_at = now() WHERE id = $1 AND NOT deleted RETURNING *", [id]);
      if (!r.rows.length) throw new MoneyError(404, "That entry doesn't exist.");
      await this.reverse(tx, actorId, id, r.rows[0]!.version as number);
      await hook?.(tx, txn(r.rows[0]!), true);
    });
  }

  /** Checks accounts, category and currencies; works out the rate and the amount received. */
  private async validate(tx: Queryable, t: TransactionInput) {
    const home = (await tx.query<{ home_currency: string }>("SELECT home_currency FROM money_settings")).rows[0]?.home_currency ?? "NGN";
    const accounts = (await tx.query<{ id: string; currency: string; archived: boolean }>("SELECT id, currency, archived FROM money_accounts WHERE id = ANY($1::uuid[])", [[t.accountId, t.toAccountId].filter(Boolean)])).rows;
    const from = accounts.find((a) => a.id === t.accountId);
    if (!from) throw new MoneyError(400, "Choose an account.", "accountId");
    const fxRate = from.currency === home ? "1" : t.fxRate;
    if (!fxRate) throw new MoneyError(400, `Enter the exchange rate: how many ${home} one ${from.currency} was worth.`, "fxRate");

    let toAmount: string | null = null;
    let toCurrency: string | null = null;
    if (t.kind === "transfer") {
      const to = accounts.find((a) => a.id === t.toAccountId);
      if (!to) throw new MoneyError(400, "Choose the account the money went to.", "toAccountId");
      toCurrency = to.currency;
      toAmount = to.currency === from.currency ? t.amount : t.toAmount ?? null;
      if (!toAmount) throw new MoneyError(400, `Enter how much arrived in ${to.currency}.`, "toAmount");
    } else {
      const c = (await tx.query<{ direction: string }>("SELECT direction FROM money_categories WHERE id = $1", [t.categoryId])).rows[0];
      if (!c) throw new MoneyError(400, "Choose a category.", "categoryId");
      if (c.direction !== (t.kind === "income" ? "in" : "out")) throw new MoneyError(400, t.kind === "income" ? "Choose an income category." : "Choose a spending category.", "categoryId");
    }
    return { home, currency: from.currency, fxRate, toAmount, toCurrency };
  }

  /** Posts one version of a transaction to the Money Journal. */
  private async post(tx: Queryable, actorId: string, t: Transaction, version: number, v: { home: string; toCurrency: string | null }) {
    const entry = uuidv7();
    const kind = t.kind === "income" ? "personal_income" : t.kind === "expense" ? "personal_spend" : "transfer";
    await tx.query(
      `INSERT INTO money_entries (id, entry_date, kind, source_feature, source_record, source_version, description, currency, total_amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [entry, t.date, kind, FEATURE, t.id, version, t.note, v.home, t.baseAmount, actorId],
    );
    const line = (no: number, direction: "in" | "out", amount: string, currency: string, accountId: string, category: string) =>
      tx.query(
        `INSERT INTO money_entry_lines (id, entry_id, line_no, category, direction, amount, currency, fx_rate, base_amount, dimensions)
         VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, round($8::numeric / $6::numeric, 8), $8, $9::jsonb)`,
        [uuidv7(), entry, no, category, direction, amount, currency, t.baseAmount, JSON.stringify({ account_id: accountId, tags: t.tags })],
      );
    if (t.kind === "transfer") {
      await line(1, "out", t.amount, t.currency, t.accountId, "transfer");
      await line(2, "in", t.toAmount!, v.toCurrency!, t.toAccountId!, "transfer");
    } else {
      await line(1, t.kind === "income" ? "in" : "out", t.amount, t.currency, t.accountId, t.categoryId!);
    }
  }

  /** Posts an entry that exactly cancels one version of a transaction: same lines, opposite directions. */
  private async reverse(tx: Queryable, actorId: string, recordId: string, version: number) {
    const original = (await tx.query<Row>("SELECT * FROM money_entries WHERE source_feature = $1 AND source_record = $2 AND source_version = $3", [FEATURE, recordId, version])).rows[0];
    if (!original) return;
    const entry = uuidv7();
    await tx.query(
      `INSERT INTO money_entries (id, entry_date, kind, source_feature, source_record, source_version, description, currency, total_amount, reverses_entry_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [entry, original.entry_date, original.kind, `${FEATURE}:reversal`, recordId, version, "Correction", original.currency, original.total_amount, original.id, actorId],
    );
    await tx.query(
      `INSERT INTO money_entry_lines (id, entry_id, line_no, category, direction, amount, currency, fx_rate, base_amount, dimensions)
       SELECT gen_random_uuid(), $1, line_no, category, CASE direction WHEN 'in' THEN 'out' ELSE 'in' END, amount, currency, fx_rate, base_amount, dimensions
         FROM money_entry_lines WHERE entry_id = $2`,
      [entry, original.id],
    );
  }

  // ---- Reports (from the journal) -------------------------------------------------------------------

  /** One month: money in, money out and net in the home currency; spending and income by category; account balances; six-month trend. */
  async summary(spaceId: string, month: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const home = (await tx.query<{ home_currency: string }>("SELECT home_currency FROM money_settings")).rows[0]?.home_currency ?? "NGN";
      // Signed amounts: money in is positive, money out negative. Reversals cancel what they reverse.
      const byCategory = await tx.query<{ category: string; kind: string; net: string }>(
        `SELECT l.category, e.kind, sum(CASE l.direction WHEN 'in' THEN l.base_amount ELSE -l.base_amount END)::text AS net
           FROM money_entry_lines l JOIN money_entries e ON e.id = l.entry_id
          WHERE e.kind IN ('personal_income','personal_spend')
            AND e.entry_date >= ($1 || '-01')::date AND e.entry_date < ($1 || '-01')::date + interval '1 month'
          GROUP BY l.category, e.kind`,
        [month],
      );
      const trend = await tx.query<{ month: string; income: string; spending: string }>(
        `SELECT to_char(date_trunc('month', e.entry_date), 'YYYY-MM') AS month,
                coalesce(sum(CASE l.direction WHEN 'in' THEN l.base_amount ELSE -l.base_amount END) FILTER (WHERE e.kind = 'personal_income'), 0)::text AS income,
                coalesce(-sum(CASE l.direction WHEN 'in' THEN l.base_amount ELSE -l.base_amount END) FILTER (WHERE e.kind = 'personal_spend'), 0)::text AS spending
           FROM money_entry_lines l JOIN money_entries e ON e.id = l.entry_id
          WHERE e.kind IN ('personal_income','personal_spend')
            AND e.entry_date >= ($1 || '-01')::date - interval '5 months' AND e.entry_date < ($1 || '-01')::date + interval '1 month'
          GROUP BY 1 ORDER BY 1`,
        [month],
      );
      // Balances in each account's own currency, all time up to the end of the month.
      const balances = await tx.query<{ id: string; balance: string }>(
        `SELECT a.id, (a.opening_balance + coalesce(sum(CASE l.direction WHEN 'in' THEN l.amount ELSE -l.amount END), 0))::text AS balance
           FROM money_accounts a
           LEFT JOIN money_entry_lines l ON l.dimensions ->> 'account_id' = a.id::text AND l.currency = a.currency
                AND l.entry_id IN (SELECT id FROM money_entries WHERE entry_date < ($1 || '-01')::date + interval '1 month')
          GROUP BY a.id, a.opening_balance`,
        [month],
      );
      const income = byCategory.rows.filter((r) => r.kind === "personal_income");
      const spend = byCategory.rows.filter((r) => r.kind === "personal_spend");
      const sum = (rows: { net: string }[], sign: 1 | -1) => rows.reduce((s, r) => s + sign * Number(r.net), 0);
      const totalIn = sum(income, 1);
      const totalOut = sum(spend, -1);
      // Fill the six months so the chart has no gaps.
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(`${month}-01T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - (5 - i));
        return d.toISOString().slice(0, 7);
      });
      return {
        month,
        homeCurrency: home,
        income: totalIn.toFixed(2),
        spending: totalOut.toFixed(2),
        net: (totalIn - totalOut).toFixed(2),
        spendingByCategory: spend.map((r) => ({ categoryId: r.category, amount: (-Number(r.net)).toFixed(2) })).filter((r) => Number(r.amount) !== 0).sort((a, b) => Number(b.amount) - Number(a.amount)),
        incomeByCategory: income.map((r) => ({ categoryId: r.category, amount: Number(r.net).toFixed(2) })).filter((r) => Number(r.amount) !== 0).sort((a, b) => Number(b.amount) - Number(a.amount)),
        balances: balances.rows.map((r) => ({ accountId: r.id, balance: Number(r.balance).toFixed(2) })),
        trend: months.map((m) => {
          const t = trend.rows.find((r) => r.month === m);
          return { month: m, income: Number(t?.income ?? 0).toFixed(2), spending: Number(t?.spending ?? 0).toFixed(2) };
        }),
      };
    });
  }

  // ---- CSV import -----------------------------------------------------------------------------------

  /** Reads the file and guesses its layout. Nothing is saved. */
  parse(csv: string) {
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new MoneyError(400, "That file has no rows we can read. Export the statement as CSV and try again.", "csv");
    return { rows: rows.slice(0, 200), totalRows: rows.length, guess: guessMapping(rows) };
  }

  /** Applies the confirmed layout and marks lines already recorded. Nothing is saved. */
  async preview(spaceId: string, csv: string, mapping: Mapping, accountId: string) {
    const rows = parseCsv(csv);
    const width = Math.max(...rows.map((r) => r.length));
    for (const col of [mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit]) {
      if (col !== null && col >= width) throw new MoneyError(400, "Choose columns that exist in the file.", "mapping");
    }
    if (mapping.amount === null && mapping.debit === null && mapping.credit === null) throw new MoneyError(400, "Choose the amount column, or the money-in and money-out columns.", "mapping");
    const { items, problems } = readRows(rows, mapping);
    const setup = await this.setup(spaceId);
    const account = setup.accounts.find((a) => a.id === accountId);
    if (!account) throw new MoneyError(400, "Choose the account this statement is for.", "accountId");
    const seen = await withSpace(this.db, spaceId, (tx) =>
      tx.query<{ import_hash: string | null; txn_date: string; amount: string; kind: string }>(
        "SELECT import_hash, txn_date::text, amount::text, kind FROM money_transactions WHERE account_id = $1 AND NOT deleted",
        [accountId],
      ),
    );
    const hashes = new Set(seen.rows.map((r) => r.import_hash).filter(Boolean));
    const manual = new Set(seen.rows.map((r) => `${r.txn_date}|${Number(r.amount).toFixed(2)}|${r.kind}`));
    return {
      account: { id: account.id, name: account.name, currency: account.currency },
      items: items.map((i: CsvItem) => {
        const hash = importHash(i);
        return {
          ...i,
          categoryId: guessCategory(i.description, i.kind, setup.categories.filter((c) => !c.archived)),
          /** Already imported from a statement: will be skipped. */
          imported: hashes.has(hash),
          /** Looks like something already recorded by hand: left unticked by default. */
          maybeDuplicate: !hashes.has(hash) && manual.has(`${i.date}|${i.amount}|${i.kind}`),
        };
      }),
      problems,
    };
  }

  /** Imports the chosen lines. Lines already imported from a statement are skipped, so retrying is safe. */
  async commit(spaceId: string, actorId: string, accountId: string, items: { date: string; description: string; amount: string; kind: "income" | "expense"; categoryId: string }[]) {
    let imported = 0;
    let skipped = 0;
    for (const i of items) {
      const saved = await this.add(spaceId, actorId, { kind: i.kind, date: i.date, amount: i.amount, accountId, categoryId: i.categoryId, toAccountId: null, toAmount: null, fxRate: null, note: i.description, tags: [] }, "csv", importHash(i)).catch((e) => {
        if (e instanceof MoneyError && e.field === "fxRate") throw new MoneyError(400, "Imports into accounts in another currency aren't supported yet. Add those by hand with the rate.", "accountId");
        throw e;
      });
      if (saved) imported++;
      else skipped++;
    }
    return { imported, skipped };
  }
}
