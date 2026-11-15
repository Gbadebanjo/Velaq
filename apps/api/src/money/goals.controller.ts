import { Body, Controller, Delete, ForbiddenException, Get, HttpException, Inject, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { CurrentPrincipal, type Principal } from "../auth/index.js";
import { CapabilityService } from "../capability.service.js";
import { parse } from "../identity/identity.controller.js";
import { GOALS, GoalService } from "./goals.js";
import { contributionSchema, goalSchema, goalUpdateSchema } from "./money.schemas.js";
import { MoneyError, MoneyService } from "./money.service.js";

/**
 * PER-012 Savings Goals. Every response is the full list, so the page always shows fresh numbers.
 *   GET    /v1/money/goals
 *   POST   /v1/money/goals                                 add a goal
 *   PATCH  /v1/money/goals/:id                             rename, change the target or date, archive
 *   POST   /v1/money/goals/:id/contributions               add money, or take some out
 *   DELETE /v1/money/goals/contributions/:contributionId   remove a contribution (posts a reversal)
 */
@Controller("v1/money/goals")
export class GoalsController {
  constructor(
    @Inject(GoalService) private readonly goals: GoalService,
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(CapabilityService) private readonly caps: CapabilityService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() me: Principal) {
    return this.goals.list(await this.space(me));
  }

  @Post()
  async create(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    const space = await this.space(me);
    const g = parse(goalSchema, body);
    notPast(g.targetDate);
    await this.goals.create(space, g).catch(toHttp);
    return this.goals.list(space);
  }

  @Patch(":id")
  async update(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const space = await this.space(me);
    const g = parse(goalUpdateSchema, body);
    notPast(g.targetDate);
    await this.goals.update(space, id, g).catch(toHttp);
    return this.goals.list(space);
  }

  @Post(":id/contributions")
  async contribute(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const space = await this.space(me);
    const c = parse(contributionSchema, body);
    if (c.date > lagosToday()) throw new HttpException({ error: "invalid_input", message: "Use today's date or an earlier one.", fields: { date: "Use today's date or an earlier one." } }, 400);
    await this.goals.contribute(space, me.accountId, id, c).catch(toHttp);
    return this.goals.list(space);
  }

  @Delete("contributions/:contributionId")
  async removeContribution(@CurrentPrincipal() me: Principal, @Param("contributionId", ParseUUIDPipe) id: string) {
    const space = await this.space(me);
    await this.goals.removeContribution(space, me.accountId, id).catch(toHttp);
    return this.goals.list(space);
  }

  private async space(me: Principal): Promise<string> {
    if (!me.scopeId) throw new ForbiddenException({ error: "no_space", message: "This session has no Personal space." });
    const cap = await this.caps.check(me.scopeId, GOALS, true);
    if (!cap.usable) throw new ForbiddenException({ error: "feature_off", message: "Savings Goals aren't available on your plan.", denial: cap.denial });
    await this.money.setup(me.scopeId);
    return me.scopeId;
  }
}

const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

function notPast(date: string | null | undefined) {
  if (date && date < lagosToday()) {
    throw new HttpException({ error: "invalid_input", message: "Choose a date from today on.", fields: { targetDate: "Choose a date from today on." } }, 400);
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
