import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { CurrentPrincipal, Public, type Principal } from "../auth/index.js";
import { CapabilityService } from "../capability.service.js";
import { parse } from "../identity/identity.controller.js";
import { IdentityService } from "../identity/identity.service.js";
import { type CvTemplate, cvFileName, isCvTemplate, renderCv } from "./cv.js";
import { type ProfileInput, profileSchema, templateSchema } from "./profile.schemas.js";
import { type Profile, ProfileError, ProfileService, type SharedProfile, toShared } from "./profile.service.js";

export const PROFILE_FEATURE = "PER-001";

interface PdfReply {
  setHeader(name: string, value: string): unknown;
  send(body: Buffer): unknown;
}

/**
 * PER-001 Professional Profile.
 * /v1/profile/* is the signed-in owner's own profile, always taken from the session.
 * /v1/shared-profiles/:token is the read-only copy a share link opens, with only the shared sections.
 */
@Controller()
export class ProfileController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(CapabilityService) private readonly caps: CapabilityService,
    @Inject(IdentityService) private readonly identity: Pick<IdentityService, "accountName">,
  ) {}

  @Get("v1/profile")
  async get(@CurrentPrincipal() me: Principal): Promise<Profile> {
    return this.profiles.get(await this.space(me), person(me));
  }

  /** Saves the whole profile in one go. Send `updatedAt` from the last read to guard against overwriting a newer save. */
  @Put("v1/profile")
  async save(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    const space = await this.space(me);
    const input = parseProfile(body);
    const seen = body && typeof body === "object" && "updatedAt" in body ? ((body as { updatedAt: unknown }).updatedAt as string | null) : undefined;
    await this.profiles.save(space, me.accountId, input, typeof seen === "string" || seen === null ? seen : undefined).catch(toHttp);
    return this.profiles.get(space, person(me));
  }

  /** Creates the share link, or replaces it so the old one stops working. */
  @Post("v1/profile/share")
  @HttpCode(200)
  async share(@CurrentPrincipal() me: Principal) {
    const space = await this.space(me);
    await this.profiles.newShareLink(space, me.accountId);
    return this.profiles.get(space, person(me));
  }

  @Delete("v1/profile/share")
  async unshare(@CurrentPrincipal() me: Principal) {
    const space = await this.space(me);
    await this.profiles.removeShareLink(space, me.accountId);
    return this.profiles.get(space, person(me));
  }

  /** Chooses the CV design used for every download of this profile. */
  @Put("v1/profile/template")
  async template(@CurrentPrincipal() me: Principal, @Body() body: unknown) {
    const space = await this.space(me);
    await this.profiles.setCvTemplate(space, me.accountId, parse(templateSchema, body).template);
    return this.profiles.get(space, person(me));
  }

  /**
   * The owner's CV: every section, whatever its visibility. Email appears only if they chose to show it.
   * ?template= previews another design without changing the saved choice.
   */
  @Get("v1/profile/cv.pdf")
  async cv(@CurrentPrincipal() me: Principal, @Query("template") template: string | undefined, @Res() res: PdfReply) {
    const full = await this.profiles.get(await this.space(me), person(me));
    await sendPdf(res, toShared(full), isCvTemplate(template) ? template : full.cvTemplate);
  }

  @Public()
  @Get("v1/shared-profiles/:token")
  async shared(@Param("token") token: string): Promise<SharedProfile> {
    return this.sharedProfile(token);
  }

  @Public()
  @Get("v1/shared-profiles/:token/cv.pdf")
  async sharedCv(@Param("token") token: string, @Res() res: PdfReply) {
    const { shared, template } = await this.sharedWithTemplate(token);
    await sendPdf(res, shared, template);
  }

  // -------------------------------------------------------------------------------------------

  /** The caller's space, once the Professional Profile is confirmed usable for it. */
  private async space(me: Principal): Promise<string> {
    if (!me.scopeId) throw new ForbiddenException({ error: "no_space", message: "This session has no Personal space." });
    const cap = await this.caps.check(me.scopeId, PROFILE_FEATURE, true);
    if (!cap.usable) throw new ForbiddenException({ error: "feature_off", message: "Professional Profile isn't available on your plan.", denial: cap.denial });
    return me.scopeId;
  }

  /** A link that is wrong, turned off, or whose owner can no longer use the feature all look the same: not found. */
  private async sharedProfile(token: string): Promise<SharedProfile> {
    return (await this.sharedWithTemplate(token)).shared;
  }

  private async sharedWithTemplate(token: string): Promise<{ shared: SharedProfile; template: CvTemplate }> {
    const notFound = () => new NotFoundException({ error: "not_found", message: "This profile link isn't active." });
    const space = await this.profiles.spaceForToken(token);
    if (!space) throw notFound();
    const [account, cap] = await Promise.all([this.identity.accountName(space), this.caps.check(space, PROFILE_FEATURE, true)]);
    if (!account || !cap.usable) throw notFound();
    const full = await this.profiles.get(space, account);
    return { shared: toShared(full), template: full.cvTemplate };
  }
}

const person = (me: Principal) => ({ firstName: me.firstName ?? null, lastName: me.lastName ?? null, email: me.email });

/**
 * Checks the whole profile. Each problem is reported against its exact place, such as
 * "basics.headline" or "entries.experience.2.end", so the editor can point at the right field.
 */
function parseProfile(body: unknown): ProfileInput {
  const r = profileSchema.safeParse(body);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const path = issue.path.filter((p) => p !== "data");
    const key = path[0] === "skills" ? "skills" : path.join(".") || "form";
    fields[key] ??= issue.message;
  }
  throw new BadRequestException({ error: "invalid_input", message: "Some details need fixing before your profile can be saved.", fields });
}

async function sendPdf(res: PdfReply, p: SharedProfile, template: CvTemplate) {
  const pdf = await renderCv(p, template);
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `attachment; filename="${cvFileName(p)}"`);
  res.setHeader("cache-control", "private, no-store");
  res.send(pdf);
}

function toHttp(e: unknown): never {
  if (e instanceof ProfileError) throw new HttpException({ error: "conflict", message: e.message }, e.status);
  throw e;
}
