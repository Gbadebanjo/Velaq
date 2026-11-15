/** velaq_business: one row-level-secured scope per organisation (tenant_id). */
import { sql } from "drizzle-orm";
import { check, integer, pgSchema, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bytea, createdAt, scopeColumn } from "./columns.js";
import { auditLogTable, featureEntitlementsTable, outboxEventsTable } from "./shared.js";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    // Offline lease for cached device data. Tenants may shorten it, never extend it beyond 24 hours.
    offlineLeaseHours: integer("offline_lease_hours").notNull().default(24),
    createdAt: createdAt(),
  },
  (t) => [check("tenants_offline_lease_ck", sql`${t.offlineLeaseHours} BETWEEN 1 AND 24`)],
);

export const auditLog = auditLogTable("tenant_id", () => tenants.id);
export const outboxEvents = outboxEventsTable("tenant_id", () => tenants.id);
export const featureEntitlements = featureEntitlementsTable("tenant_id", () => tenants.id);

/** FND-032 Payee Accounts: new bank details sit in a 48-hour cooling-off before they can be paid. */
export const cdmPayees = pgSchema("cdm_payees");
export const payeeAccounts = cdmPayees.table(
  "payee_accounts",
  {
    tenantId: scopeColumn("tenant_id", () => tenants.id),
    id: uuid("id").notNull(),
    personId: uuid("person_id").notNull(),
    accountEnc: bytea("account_enc").notNull(),
    accountHmac: text("account_hmac").notNull(),
    status: text("status").notNull().default("cooling_off"),
    usableAfter: timestamp("usable_after", { withTimezone: true }).notNull().default(sql`now() + interval '48 hours'`),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    check("payee_accounts_status_ck", sql`${t.status} IN ('cooling_off','active','retired')`),
  ],
);
