/**
 * Capability map: a feature is usable only when all five checks pass.
 *   Released -> Entitled -> Enabled -> Allowed -> (Enhancements)
 * Pure function so every service evaluates the same way.
 */
export interface CapabilityInput {
  released: boolean;
  entitled: boolean;
  enabled: boolean;
  /** Role / permission check for this principal. */
  allowed: boolean;
  /** Optional enhancement features that are also on, keyed by feature id. */
  enhancements?: Record<string, boolean>;
}
export type CapabilityDenial = "not_released" | "not_entitled" | "not_enabled" | "not_allowed";
export interface CapabilityResult {
  usable: boolean;
  denial?: CapabilityDenial;
  enhancements: string[];
}

export function evaluateCapability(i: CapabilityInput): CapabilityResult {
  const enhancements = Object.entries(i.enhancements ?? {}).filter(([, on]) => on).map(([id]) => id).sort();
  if (!i.released) return { usable: false, denial: "not_released", enhancements: [] };
  if (!i.entitled) return { usable: false, denial: "not_entitled", enhancements: [] };
  if (!i.enabled) return { usable: false, denial: "not_enabled", enhancements: [] };
  if (!i.allowed) return { usable: false, denial: "not_allowed", enhancements: [] };
  return { usable: true, enhancements };
}
