import { sql } from "drizzle-orm";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as business from "./schema/business.js";
import * as personal from "./schema/personal.js";
import { assertUuid } from "./index.js";

export { business, personal };

export type BusinessDb = NodePgDatabase<typeof business>;
export type PersonalDb = NodePgDatabase<typeof personal>;

/** Typed Drizzle client for velaq_business. Connect as velaq_app so row level security applies. */
export function businessDb(connectionString: string): BusinessDb {
  return drizzle(new pg.Pool({ connectionString }), { schema: business });
}

/** Typed Drizzle client for velaq_personal. Connect as velaq_app so row level security applies. */
export function personalDb(connectionString: string): PersonalDb {
  return drizzle(new pg.Pool({ connectionString }), { schema: personal });
}

/** The transaction type a Drizzle database hands to its transaction callback. */
type TxOf<D> = D extends { transaction: (fn: (tx: infer X) => Promise<any>, ...rest: any[]) => Promise<any> } ? X : never;

/**
 * Typed version of withScope: one Drizzle transaction with the caller's scope bound.
 * Example: inScope(db, spaceId, (tx) => tx.select().from(personal.featureEntitlements))
 */
export async function inScope<D extends { transaction: (...args: any[]) => Promise<any> }, T>(
  db: D,
  scopeId: string,
  fn: (tx: TxOf<D>) => Promise<T>,
): Promise<T> {
  assertUuid(scopeId);
  return db.transaction(async (tx: TxOf<D> & { execute: (q: unknown) => Promise<unknown> }) => {
    await tx.execute(sql`SELECT set_config('app.scope_id', ${scopeId}, true)`);
    return fn(tx);
  });
}
