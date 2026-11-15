import { Inject, Injectable } from "@nestjs/common";
import { RELEASED_FEATURE_IDS, evaluateCapability, featureById, type CapabilityResult } from "@velaq/contracts";
import type { EntitlementStore } from "./entitlements.js";

export const ENTITLEMENT_STORE = Symbol("ENTITLEMENT_STORE");

@Injectable()
export class CapabilityService {
  constructor(
    @Inject(ENTITLEMENT_STORE) private readonly store: EntitlementStore,
    private readonly released: ReadonlySet<string> = RELEASED_FEATURE_IDS,
  ) {}

  /** Allowed is supplied by the authorisation layer; until that exists, callers pass it explicitly. */
  async check(tenantId: string, featureId: string, allowed: boolean): Promise<CapabilityResult & { featureId: string }> {
    if (!featureById(featureId)) return { featureId, usable: false, denial: "not_released", enhancements: [] };
    const s = await this.store.get(tenantId, featureId);
    return {
      featureId,
      ...evaluateCapability({
        released: this.released.has(featureId),
        entitled: s.entitled,
        enabled: s.enabled,
        allowed,
      }),
    };
  }
}
