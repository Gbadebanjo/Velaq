import { type Queryable, type TxRunner, withTenant } from "@velaq/db";

export interface EntitlementState { entitled: boolean; enabled: boolean }
export interface EntitlementStore {
  get(tenantId: string, featureId: string): Promise<EntitlementState>;
}

/** Development store: everything off until set. */
export class InMemoryEntitlementStore implements EntitlementStore {
  private readonly rows = new Map<string, EntitlementState>();
  set(tenantId: string, featureId: string, s: EntitlementState): void {
    this.rows.set(`${tenantId}:${featureId}`, s);
  }
  async get(tenantId: string, featureId: string): Promise<EntitlementState> {
    return this.rows.get(`${tenantId}:${featureId}`) ?? { entitled: false, enabled: false };
  }
}

/** PostgreSQL store. Reads go through withTenant so row level security applies. */
export class PgEntitlementStore implements EntitlementStore {
  constructor(private readonly db: TxRunner) {}
  async get(tenantId: string, featureId: string): Promise<EntitlementState> {
    const r = await withTenant(this.db, tenantId, (tx: Queryable) =>
      tx.query<{ entitled: boolean; enabled: boolean }>(
        "SELECT entitled, enabled FROM feature_entitlements WHERE feature_id = $1", [featureId]));
    return r.rows[0] ?? { entitled: false, enabled: false };
  }
}
