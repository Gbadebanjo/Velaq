import { Body, Controller, Delete, ForbiddenException, Get, HttpException, Inject, NotFoundException, Optional, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { AI_CLIENT, type AiClient, AiFailed, AiUnavailable, aiDailyLimit } from "../ai/ai.js";
import { CurrentPrincipal, type Principal } from "../auth/index.js";
import { CapabilityService } from "../capability.service.js";
import { parse } from "../identity/identity.controller.js";
import { cvFileName, isCvTemplate, renderCv } from "./cv.js";
import { PROFILE_FEATURE } from "./profile.controller.js";
import { ProfileError, ProfileService } from "./profile.service.js";
import { AI_SCHEMA, SYSTEM_PROMPT, type Suggestions, checkAnswer, promptFor, tailorRequestSchema } from "./tailor.js";
import { VersionService, saveVersionSchema } from "./versions.js";

interface PdfReply {
  setHeader(name: string, value: string): unknown;
  send(body: Buffer): unknown;
}

/**
 * "Tailor for a job" and tailored versions, part of the Professional Profile (PER-001).
 *   GET    /v1/profile/ai                 whether AI is set up, and how many tailorings are left today
 *   POST   /v1/profile/tailor             suggestions for one job (nothing is saved)
 *   GET    /v1/profile/versions           the person's tailored versions
 *   POST   /v1/profile/versions           save the changes the person approved as a new version
 *   GET    /v1/profile/versions/:id       one version
 *   DELETE /v1/profile/versions/:id
 *   GET    /v1/profile/versions/:id/cv.pdf?template=
 */
@Controller("v1/profile")
export class TailorController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(VersionService) private readonly versions: VersionService,
    @Inject(CapabilityService) private readonly caps: CapabilityService,
    @Optional() @Inject(AI_CLIENT) private readonly ai: AiClient | null,
  ) {}

  @Get("ai")
  async status(@CurrentPrincipal() me: Principal) {
    const space = await this.space(me);
    const limit = aiDailyLimit();
    const used = await this.versions.tailoredToday(space);
    return { available: !!this.ai, dailyLimit: limit, remainingToday: Math.max(0, limit - used) };
  }

  @Post("tailor")
  async tailor(@CurrentPrincipal() me: Principal, @Body() body: unknown): Promise<Suggestions> {
    const space = await this.space(me);
    const job = parse(tailorRequestSchema, body);
    if (!this.ai) throw new HttpException({ error: "ai_not_set_up", message: "AI tailoring isn't set up yet." }, 503);
    if ((await this.versions.tailoredToday(space)) >= aiDailyLimit()) {
      throw new HttpException({ error: "limit_reached", message: `You've used all ${aiDailyLimit()} tailorings for today. Try again tomorrow.` }, 429);
    }
    const profile = await this.profiles.get(space, { firstName: me.firstName ?? null, lastName: me.lastName ?? null, email: me.email });
    if (!profile.entries.experience.length && !profile.basics.about) {
      throw new HttpException({ error: "profile_empty", message: "Add your experience or an About me to your profile first, then tailor it." }, 409);
    }
    await this.versions.recordTailoring(space, me.accountId); // counts towards the daily limit even if the AI then fails
    try {
      const raw = await this.ai.json({ system: SYSTEM_PROMPT, user: promptFor(profile, job), schema: AI_SCHEMA as unknown as Record<string, unknown>, maxTokens: 6000 });
      return checkAnswer(profile, raw, this.ai.model);
    } catch (e) {
      if (e instanceof AiUnavailable) throw new HttpException({ error: "ai_not_set_up", message: e.message }, 503);
      if (e instanceof AiFailed) throw new HttpException({ error: "ai_failed", message: e.message }, 502);
      throw e;
    }
  }

  @Get("versions")
  async list(@CurrentPrincipal() me: Principal) {
    return this.versions.list(await this.space(me));
  }

  @Post("versions")
  async save(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    const space = await this.space(me);
    const v = parse(saveVersionSchema, body);
    return this.versions.save(space, me.accountId, { firstName: me.firstName ?? null, lastName: me.lastName ?? null, email: me.email }, v).catch((e) => {
      if (e instanceof ProfileError) throw new HttpException({ error: "conflict", message: e.message }, e.status);
      throw e;
    });
  }

  @Get("versions/:id")
  async one(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string) {
    const v = await this.versions.get(await this.space(me), id);
    if (!v) throw new NotFoundException({ error: "not_found", message: "That version doesn't exist." });
    return v;
  }

  @Delete("versions/:id")
  async remove(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string) {
    if (!(await this.versions.remove(await this.space(me), me.accountId, id))) throw new NotFoundException({ error: "not_found", message: "That version doesn't exist." });
    return { deleted: true };
  }

  @Get("versions/:id/cv.pdf")
  async cv(@CurrentPrincipal() me: Principal, @Param("id", ParseUUIDPipe) id: string, @Query("template") template: string | undefined, @Res() res: PdfReply) {
    const space = await this.space(me);
    const v = await this.versions.get(space, id);
    if (!v) throw new NotFoundException({ error: "not_found", message: "That version doesn't exist." });
    const chosen = isCvTemplate(template) ? template : (await this.profiles.get(space, { firstName: null, lastName: null, email: "" })).cvTemplate;
    const pdf = await renderCv(v.content, chosen);
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `attachment; filename="${cvFileName(v.content).replace(/-CV\.pdf$/, "")}-${v.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "Tailored"}-CV.pdf"`);
    res.setHeader("cache-control", "private, no-store");
    res.send(pdf);
  }

  private async space(me: Principal): Promise<string> {
    if (!me.scopeId) throw new ForbiddenException({ error: "no_space", message: "This session has no Personal space." });
    const cap = await this.caps.check(me.scopeId, PROFILE_FEATURE, true);
    if (!cap.usable) throw new ForbiddenException({ error: "feature_off", message: "Professional Profile isn't available on your plan.", denial: cap.denial });
    return me.scopeId;
  }
}
