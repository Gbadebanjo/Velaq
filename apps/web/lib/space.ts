import "server-only";
import { FEATURES, type FeatureDef } from "@velaq/contracts";
import { cache } from "react";
import { api } from "./api";
import { sessionToken } from "./session";

export type PlanId = "free" | "premium" | "hustle";
export type Capability = { featureId: string; usable: boolean; denial?: string };
export interface SpaceData {
  space: { id: string; plan: PlanId; createdAt: string };
  capabilities: Capability[];
}

export const PLAN_NAME: Record<PlanId, string> = { free: "Free", premium: "Premium", hustle: "Hustle" };
const RANK: Record<string, number> = { free: 0, premium: 1, hustle: 2 };

export type FeatureState = "ready" | "soon" | "upgrade";
export interface FeatureView extends FeatureDef {
  state: FeatureState;
  label: string;
  href: string;
}

/** URL slug for a feature, e.g. "Income & Expense Tracking" -> "income-expense-tracking". */
export const featureSlug = (name: string) => name.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The signed-in person's space, fetched once per request and shared by the layout and pages. */
export const getSpace = cache(async (): Promise<SpaceData | null> => {
  const token = await sessionToken();
  if (!token) return null;
  try {
    const r = await api<SpaceData>("GET", "/v1/space", { token });
    return r.status === 200 ? r.body : null;
  } catch {
    return null;
  }
});

/**
 * Names shown to people inside Velaq Personal, where they differ from the PRD.
 * Personal stands on its own: nothing on a signed-in Personal screen mentions Velaq for Business.
 */
const GROUP_LABEL: Record<string, string> = { "Business of One": "Freelance & Side Hustle" };

/** Upgrade to Business (PER-060) is shown only to Hustle members, whose side business may be ready to become a company. */
const HUSTLE_ONLY = new Set(["PER-060"]);

/** Every Personal feature with its state for this person, grouped as in the PRD. */
export function personalFeatures(data: SpaceData | null): { group: string; features: FeatureView[] }[] {
  const plan = data?.space.plan ?? "free";
  const byId = new Map(data?.capabilities.map((c) => [c.featureId, c]));
  const shown = FEATURES.filter((f) => f.product === "personal" && (plan === "hustle" || !HUSTLE_ONLY.has(f.id)));
  const views: FeatureView[] = shown.map((f) => {
    const above = (RANK[f.plan] ?? 0) > (RANK[plan] ?? 0);
    const usable = byId.get(f.id)?.usable ?? false;
    const state: FeatureState = above ? "upgrade" : usable ? "ready" : "soon";
    const label = state === "upgrade" ? PLAN_NAME[f.plan as PlanId] : state === "ready" ? "Open" : "Soon";
    return { ...f, group: GROUP_LABEL[f.group] ?? f.group, state, label, href: `/app/${featureSlug(f.name)}` };
  });
  const groups = [...new Set(views.map((v) => v.group))];
  return groups.map((group) => ({ group, features: views.filter((v) => v.group === group) }));
}
