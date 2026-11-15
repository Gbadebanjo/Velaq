/** Platform-wide parameters. Change here, not in feature code. */
export const OFFLINE_LEASE_HOURS_DEFAULT = 24;
export const REVOCATION_TARGET_SECONDS = 60;
export const CAPABILITY_CACHE_MAX_SECONDS = 300;
export const CLOCK_SKEW_FLAG_SECONDS = 300;
export const STALE_EVENT_APPROVAL_HOURS = 48;
export const PAYEE_COOLING_OFF_HOURS = 48;
export const FEATURE_OFF_RETENTION_DAYS = 180;
export const STATUTORY_RETENTION_YEARS = 7;
export const PRODUCTS = ["business", "personal", "marketplace"] as const;
export type Product = (typeof PRODUCTS)[number];

/** A tenant may shorten the offline lease but never extend it past the platform default. */
export function effectiveOfflineLeaseHours(tenantSetting?: number): number {
  if (tenantSetting === undefined || !Number.isFinite(tenantSetting) || tenantSetting <= 0) {
    return OFFLINE_LEASE_HOURS_DEFAULT;
  }
  return Math.min(tenantSetting, OFFLINE_LEASE_HOURS_DEFAULT);
}
