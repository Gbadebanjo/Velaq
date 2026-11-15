import { BadRequestException, Controller, Get, Inject, NotFoundException, Optional, Query } from "@nestjs/common";
import { FEATURES } from "@velaq/contracts";
import { CurrentPrincipal, Public, type Principal } from "./auth/index.js";
import { CapabilityService } from "./capability.service.js";
import { SpaceService } from "./space/space.service.js";

const personalFeatureIds = FEATURES.filter((f) => f.product === "personal").map((f) => f.id);

@Controller()
export class AppController {
  constructor(
    @Inject(CapabilityService) private readonly caps: CapabilityService,
    @Optional() @Inject(SpaceService) private readonly spaces?: SpaceService,
  ) {}

  @Public()
  @Get("health")
  health() {
    return { status: "ok", service: "velaq-api" };
  }

  /** The signed-in caller, including their Personal space. */
  @Get("v1/me")
  me(@CurrentPrincipal() principal: Principal) {
    return principal;
  }

  /** The caller's Personal space and what each Personal feature's status is for it. */
  @Get("v1/space")
  async space(@CurrentPrincipal() principal: Principal) {
    if (!this.spaces || !principal.scopeId) throw new NotFoundException();
    const space = await this.spaces.get(principal.scopeId);
    if (!space) throw new NotFoundException();
    const capabilities = await Promise.all(personalFeatureIds.map((id) => this.caps.check(space.id, id, true)));
    return { space, capabilities };
  }

  /**
   * Capability map for the caller's own scope. The scope always comes from the session,
   * never from the request. Allowed is true for a person in their own space until roles (FND-005).
   */
  @Get("v1/capabilities")
  async capabilities(@CurrentPrincipal() principal: Principal, @Query("features") features = "") {
    if (!principal.scopeId) throw new BadRequestException("This session has no scope");
    const requested = features.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const ids = requested.length ? requested : personalFeatureIds;
    const results = await Promise.all(ids.map((id) => this.caps.check(principal.scopeId!, id, true)));
    return { scopeId: principal.scopeId, capabilities: results };
  }
}
