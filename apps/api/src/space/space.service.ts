import { Inject, Injectable } from "@nestjs/common";
import { FEATURES } from "@velaq/contracts";
import { type TxRunner, enqueueEvent, withSpace } from "@velaq/db";
import { uuidv7 } from "../identity/uuid.js";

export const PERSONAL_DB = Symbol("PERSONAL_DB");

export type PersonalPlan = "free" | "premium" | "hustle";

/** Features each plan switches on when a space is created or changes plan. */
export function planFeatures(plan: PersonalPlan): string[] {
  const rank: Record<string, number> = { free: 0, premium: 1, hustle: 2 };
  return FEATURES.filter((f) => f.product === "personal" && (rank[f.plan] ?? 99) <= rank[plan]!).map((f) => f.id);
}

export interface Space {
  id: string;
  plan: PersonalPlan;
  createdAt: string;
}

/**
 * FND-002 Personal spaces. Each person has exactly one space, whose id is their account id.
 * It is created on first use after sign-in, with the Free plan's features switched on.
 * Every query runs with the space bound, so row level security keeps people apart.
 */
@Injectable()
export class SpaceService {
  /** Spaces already confirmed to exist in this process, to skip the insert on later requests. */
  private readonly known = new Set<string>();

  constructor(@Inject(PERSONAL_DB) private readonly db: TxRunner) {}

  async ensure(accountId: string): Promise<string> {
    if (this.known.has(accountId)) return accountId;
    await withSpace(this.db, accountId, async (tx) => {
      const created = await tx.query(
        "INSERT INTO spaces (id, owner_user_id) VALUES ($1::uuid, $1::text) ON CONFLICT DO NOTHING RETURNING id",
        [accountId],
      );
      if (created.rows.length === 0) return;
      await tx.query(
        `INSERT INTO feature_entitlements (feature_id, entitled, enabled)
         SELECT unnest($1::text[]), true, true ON CONFLICT DO NOTHING`,
        [planFeatures("free")],
      );
      await tx.query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id) VALUES ($1, $2, 'create', 'space', $2)", [uuidv7(), accountId]);
      await enqueueEvent(tx, {
        id: uuidv7(),
        type: "personal.SpaceCreated",
        idempotencyKey: `space-created:${accountId}`,
        dataClass: "internal",
        payload: { spaceId: accountId, plan: "free" },
      });
    });
    this.known.add(accountId);
    return accountId;
  }

  async get(spaceId: string): Promise<Space | null> {
    const r = await withSpace(this.db, spaceId, (tx) =>
      tx.query<{ id: string; plan: PersonalPlan; created_at: string | Date }>("SELECT id, plan, created_at FROM spaces"),
    );
    const row = r.rows[0];
    return row ? { id: row.id, plan: row.plan, createdAt: new Date(row.created_at).toISOString() } : null;
  }
}
