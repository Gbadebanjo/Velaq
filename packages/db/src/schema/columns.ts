import { sql } from "drizzle-orm";
import { type AnyPgColumn, customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** Encrypted bytes. Restricted values are encrypted by the application before they reach the database. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * The owning scope of a row: tenant_id in Business, space_id in Personal.
 * It defaults to the scope bound for the current transaction, and row level security
 * rejects any other value, so a row can only ever be written for the caller's own scope.
 */
export const scopeColumn = (name: "tenant_id" | "space_id", owner: () => AnyPgColumn) =>
  uuid(name).notNull().default(sql`app_scope_id()`).references(owner);

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
