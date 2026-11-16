import { Body, Controller, Delete, ForbiddenException, Get, HttpException, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, type Principal } from "../auth/index.js";
import { CapabilityService } from "../capability.service.js";
import { parse } from "../identity/identity.controller.js";
import { completeSchema, listSchema, taskPatchSchema, taskSchema, viewSchema } from "./tasks.schemas.js";
import { TASKS, TaskError, TaskService, type View } from "./tasks.service.js";

/**
 * PER-030 Tasks.
 *   GET    /v1/tasks?view=today|upcoming|inbox|all|completed|list:<id>
 *   POST   /v1/tasks                 add a task
 *   PATCH  /v1/tasks/:id             change it
 *   POST   /v1/tasks/:id/complete    { done: true | false }; a repeating task makes its next occurrence
 *   DELETE /v1/tasks/:id
 *   POST   /v1/tasks/lists, PATCH /v1/tasks/lists/:id, DELETE /v1/tasks/lists/:id (its tasks move to the Inbox)
 */
@Controller("v1/tasks")
export class TasksController {
  constructor(
    @Inject(TaskService) private readonly tasks: TaskService,
    @Inject(CapabilityService) private readonly caps: CapabilityService,
  ) {}

  @Get()
  async view(@CurrentPrincipal() me: Principal, @Query("view") view?: string) {
    return this.tasks.view(await this.space(me), parse(viewSchema, view ?? "today") as View).catch(toHttp);
  }

  @Post()
  async create(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    return this.tasks.create(await this.space(me), parse(taskSchema, body)).catch(toHttp);
  }

  @Post("lists")
  async addList(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    return this.tasks.addList(await this.space(me), parse(listSchema, body)).catch(toHttp);
  }

  @Patch("lists/:id")
  async renameList(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.tasks.renameList(await this.space(me), id, parse(listSchema, body)).catch(toHttp);
    return { ok: true };
  }

  @Delete("lists/:id")
  async removeList(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string) {
    await this.tasks.removeList(await this.space(me), id).catch(toHttp);
    return { ok: true };
  }

  @Patch(":id")
  async update(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.tasks.update(await this.space(me), id, parse(taskPatchSchema, body)).catch(toHttp);
  }

  @Post(":id/complete")
  async complete(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.tasks.complete(await this.space(me), id, parse(completeSchema, body).done).catch(toHttp);
  }

  @Delete(":id")
  async remove(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string) {
    await this.tasks.remove(await this.space(me), id).catch(toHttp);
    return { ok: true };
  }

  private async space(me: Principal): Promise<string> {
    if (!me.scopeId) throw new ForbiddenException({ error: "no_space", message: "This session has no Personal space." });
    const cap = await this.caps.check(me.scopeId, TASKS, true);
    if (!cap.usable) throw new ForbiddenException({ error: "feature_off", message: "Tasks aren't available on your plan.", denial: cap.denial });
    return me.scopeId;
  }
}

function toHttp(e: unknown): never {
  if (e instanceof TaskError) {
    throw new HttpException(
      e.field ? { error: "invalid_input", message: e.message, fields: { [e.field]: e.message } } : { error: e.status === 404 ? "not_found" : "conflict", message: e.message },
      e.status,
    );
  }
  throw e;
}
