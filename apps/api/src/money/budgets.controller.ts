import { Body, Controller, Delete, ForbiddenException, Get, HttpException, Inject, Param, ParseUUIDPipe, Put, Query } from "@nestjs/common";
import { CurrentPrincipal, type Principal } from "../auth/index.js";
import { CapabilityService } from "../capability.service.js";
import { parse } from "../identity/identity.controller.js";
import { BUDGETS, BudgetService, addMonths, lagosMonth } from "./budgets.js";
import { budgetSchema, monthSchema } from "./money.schemas.js";
import { MoneyError, MoneyService } from "./money.service.js";

/**
 * PER-011 Budgets.
 *   GET    /v1/money/budgets?month=          every budget for the month, with what's spent and left
 *   PUT    /v1/money/budgets/:categoryId     set the limit (and carry-over) from this month on
 *   DELETE /v1/money/budgets/:categoryId     stop the budget from this month on; past months keep theirs
 */
@Controller("v1/money/budgets")
export class BudgetsController {
  constructor(
    @Inject(BudgetService) private readonly budgets: BudgetService,
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(CapabilityService) private readonly caps: CapabilityService,
  ) {}

  @Get()
  async month(@CurrentPrincipal() me: Principal, @Query("month") month?: string) {
    const space = await this.space(me);
    await this.money.setup(space);
    return this.budgets.month(space, month ? parse(monthSchema, month) : lagosMonth());
  }

  @Put(":categoryId")
  async set(@CurrentPrincipal() me: Principal, @Param("categoryId", ParseUUIDPipe) categoryId: string, @Body() body: unknown) {
    const space = await this.space(me);
    const month = editableMonth((body as { month?: string } | null)?.month);
    await this.budgets.set(space, categoryId, parse(budgetSchema, body), month).catch(toHttp);
    return this.budgets.month(space, month);
  }

  @Delete(":categoryId")
  async stop(@CurrentPrincipal() me: Principal, @Param("categoryId", ParseUUIDPipe) categoryId: string, @Query("month") q?: string, @Body() body?: unknown) {
    const space = await this.space(me);
    const month = editableMonth(q ?? (body as { month?: string } | null)?.month);
    await this.budgets.stop(space, categoryId, month).catch(toHttp);
    return this.budgets.month(space, month);
  }

  private async space(me: Principal): Promise<string> {
    if (!me.scopeId) throw new ForbiddenException({ error: "no_space", message: "This session has no Personal space." });
    const cap = await this.caps.check(me.scopeId, BUDGETS, true);
    if (!cap.usable) throw new ForbiddenException({ error: "feature_off", message: "Budgets aren't available on your plan.", denial: cap.denial });
    return me.scopeId;
  }
}

/** Budgets are set for this month or a coming one; past months stay as they were. */
function editableMonth(m?: string): string {
  const now = lagosMonth();
  if (!m) return now;
  const month = parse(monthSchema, m);
  if (month < now || month > addMonths(now, 12)) {
    throw new HttpException({ error: "invalid_input", message: "Budgets can be set for this month or the next 12.", fields: { month: "Choose this month or a later one." } }, 400);
  }
  return month;
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
