import { Body, Controller, Delete, ForbiddenException, Get, HttpException, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { CurrentPrincipal, type Principal } from "../auth/index.js";
import { CapabilityService } from "../capability.service.js";
import { parse } from "../identity/identity.controller.js";
import {
  accountSchema,
  accountUpdateSchema,
  categorySchema,
  categoryUpdateSchema,
  commitSchema,
  csvSchema,
  monthSchema,
  previewSchema,
  settingsSchema,
  setAsideSchema,
  transactionSchema,
} from "./money.schemas.js";
import { BUDGETS, BudgetService } from "./budgets.js";
import { GOALS, GoalService } from "./goals.js";
import { type EntryHook, FEATURE, MoneyError, MoneyService, type Transaction } from "./money.service.js";

/**
 * PER-010 Income & Expense Tracking.
 *   GET   /v1/money/setup                       home currency, accounts, categories (sets up defaults on first visit)
 *   PUT   /v1/money/settings                    home currency (only before anything is recorded)
 *   POST  /v1/money/accounts  PATCH /:id        add, rename or archive accounts
 *   POST  /v1/money/categories PATCH /:id       add, rename or archive categories
 *   GET   /v1/money/transactions?month=&account=&category=
 *   POST  /v1/money/transactions  PUT /:id  DELETE /:id
 *   GET   /v1/money/summary?month=              totals, categories, balances and trend, from the Money Journal
 *   POST  /v1/money/import/parse | preview | commit   CSV statement import
 */
@Controller("v1/money")
export class MoneyController {
  constructor(
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(CapabilityService) private readonly caps: CapabilityService,
    @Inject(BudgetService) private readonly budgets: BudgetService,
    @Inject(GoalService) private readonly goals: GoalService,
  ) {}

  @Get("setup")
  async setup(@CurrentPrincipal() me: Principal) {
    return this.money.setup(await this.space(me));
  }

  @Put("settings")
  async settings(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    return this.money.setHomeCurrency(await this.space(me), parse(settingsSchema, body).homeCurrency).catch(toHttp);
  }

  @Post("accounts")
  async addAccount(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    return this.money.addAccount(await this.space(me), parse(accountSchema, body)).catch(toHttp);
  }

  @Patch("accounts/:id")
  async updateAccount(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.money.updateAccount(await this.space(me), id, parse(accountUpdateSchema, body)).catch(toHttp);
  }

  @Post("categories")
  async addCategory(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    return this.money.addCategory(await this.space(me), parse(categorySchema, body)).catch(toHttp);
  }

  @Patch("categories/:id")
  async updateCategory(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.money.updateCategory(await this.space(me), id, parse(categoryUpdateSchema, body)).catch(toHttp);
  }

  @Get("transactions")
  async list(@CurrentPrincipal() me: Principal, @Query("month") month: string, @Query("account") account?: string, @Query("category") category?: string) {
    const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    const space = await this.space(me);
    const list = await this.money.list(space, parse(monthSchema, month ?? ""), { accountId: uuid(account), categoryId: uuid(category) });
    if (!(await this.caps.check(space, GOALS, true)).usable) return list;
    const set = await this.goals.setAsides(space, list.filter((t) => t.kind === "income").map((t) => t.id));
    return list.map((t) => (set.has(t.id) ? { ...t, setAside: set.get(t.id) } : t));
  }

  @Post("transactions")
  async add(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    const space = await this.space(me);
    await this.money.setup(space);
    const input = parse(transactionSchema, body);
    const saved = await this.money.add(space, me.accountId, input, "manual", null, await this.goalHook(space, me, body)).catch(toHttp);
    return this.withBudget(space, saved);
  }

  @Put("transactions/:id")
  async update(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const space = await this.space(me);
    const input = parse(transactionSchema, body);
    const saved = await this.money.update(space, me.accountId, id, input, await this.goalHook(space, me, body)).catch(toHttp);
    return this.withBudget(space, saved);
  }

  /**
   * Money set aside for a goal while recording income. It's saved in the same database transaction
   * as the entry. An entry sent without "setAside" keeps what it had, unless it's no longer income.
   */
  private async goalHook(space: string, me: Principal, body: unknown): Promise<EntryHook | undefined> {
    if (!(await this.caps.check(space, GOALS, true)).usable) return undefined;
    const given = !!body && typeof body === "object" && "setAside" in body;
    const setAside = parse(setAsideSchema, given ? (body as { setAside: unknown }).setAside : null);
    return async (tx, saved, deleted) => {
      if (!given && saved?.kind === "income" && !deleted) return;
      await this.goals.checkSetAside(tx, setAside);
      await this.goals.linkIncome(tx, me.accountId, saved, setAside, deleted);
    };
  }

  /** Adds how the entry's budget now stands when it's close to or over its limit (and Budgets is on). */
  private async withBudget(space: string, t: Transaction | null) {
    if (!t || t.kind !== "expense") return t;
    const cap = await this.caps.check(space, BUDGETS, true);
    return { ...t, budgetAlert: cap.usable ? await this.budgets.alertFor(space, t.categoryId, t.date) : null };
  }

  @Delete("transactions/:id")
  async remove(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string) {
    // Money set aside from this entry for a goal is taken back out with it.
    await this.money.remove(await this.space(me), me.accountId, id, (tx, saved) => this.goals.linkIncome(tx, me.accountId, saved, null, true)).catch(toHttp);
    return { deleted: true };
  }

  @Get("summary")
  async summary(@CurrentPrincipal() me: Principal, @Query("month") month: string) {
    const space = await this.space(me);
    await this.money.setup(space);
    return this.money.summary(space, parse(monthSchema, month ?? ""));
  }

  @Post("import/parse")
  async importParse(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    await this.space(me);
    try {
      return this.money.parse(parse(csvSchema, body).csv);
    } catch (e) {
      return toHttp(e);
    }
  }

  @Post("import/preview")
  async importPreview(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    const b = parse(previewSchema, body);
    return this.money.preview(await this.space(me), b.csv, b.mapping, b.accountId).catch(toHttp);
  }

  @Post("import/commit")
  async importCommit(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    const b = parse(commitSchema, body);
    return this.money.commit(await this.space(me), me.accountId, b.accountId, b.items).catch(toHttp);
  }

  private async space(me: Principal): Promise<string> {
    if (!me.scopeId) throw new ForbiddenException({ error: "no_space", message: "This session has no Personal space." });
    const cap = await this.caps.check(me.scopeId, FEATURE, true);
    if (!cap.usable) throw new ForbiddenException({ error: "feature_off", message: "Income & Expense Tracking isn't available on your plan.", denial: cap.denial });
    return me.scopeId;
  }
}

function toHttp(e: unknown): never {
  if (e instanceof MoneyError) {
    throw new HttpException(
      e.field ? { error: "invalid_input", message: e.message, fields: { [e.field]: e.message } } : { error: e.status === 404 ? "not_found" : "conflict", message: e.message },
      e.status,
    );
  }
  throw e;
}
