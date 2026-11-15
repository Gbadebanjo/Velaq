import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The three product databases. Credentials and tokens never span them (AR-0). */
export const PLANES = ["business", "personal", "marketplace"] as const;
export type Plane = (typeof PLANES)[number];

export function isPlane(v: unknown): v is Plane {
  return typeof v === "string" && (PLANES as readonly string[]).includes(v);
}

/**
 * Every database Velaq runs: the three products plus identity, which holds sign-in accounts and
 * sessions for all products. A session is still issued for one product only.
 */
export const DATABASES = [...PLANES, "identity"] as const;
export type Database = (typeof DATABASES)[number];

export function isDatabase(v: unknown): v is Database {
  return typeof v === "string" && (DATABASES as readonly string[]).includes(v);
}

/** Minimal query surface so the same helpers work with pg, PGlite or a transaction client. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface TxRunner extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: string, what = "scope id"): void {
  if (!UUID_RE.test(id)) throw new Error(`${what} must be a UUID`);
}

/**
 * Run work inside one transaction with the caller's scope bound: a tenant in Business, a space in Personal.
 * The binding is transaction-local (set_config(..., true)), so it cannot leak across pooled connections,
 * and it fails closed: with no scope bound, every scoped table returns no rows.
 */
export async function withScope<T>(db: TxRunner, scopeId: string, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  assertUuid(scopeId);
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.scope_id', $1, true)", [scopeId]);
    return fn(tx);
  });
}

/** Business: bind an organisation. */
export const withTenant = withScope;
/** Personal: bind a person's space. */
export const withSpace = withScope;

/** Folder of Drizzle migrations for one database. */
export function migrationsFolder(db: Database): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", db);
}

export * from "./drizzle.js";
export * from "./outbox.js";
export * from "./pg.js";
export * from "./urls.js";
