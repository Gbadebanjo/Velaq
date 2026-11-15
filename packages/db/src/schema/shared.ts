import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { bytea, scopeColumn } from "./columns.js";

type ScopeName = "tenant_id" | "space_id";
type Owner = () => AnyPgColumn;

/** Append-only audit log (FND-011). The app role may insert and read, never update or delete. */
export const auditLogTable = (scope: ScopeName, owner: Owner) =>
  pgTable(
    "audit_log",
    {
      scopeId: scopeColumn(scope, owner),
      id: uuid("id").notNull(),
      actorId: text("actor_id"),
      action: text("action").notNull(),
      entity: text("entity").notNull(),
      entityId: text("entity_id"),
      // Restricted values are stored encrypted, never in clear text.
      beforeEnc: bytea("before_enc"),
      afterEnc: bytea("after_enc"),
      occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.scopeId, t.id] })],
  );

/** Transactional outbox (FND-007). Events are written in the same transaction as the change. */
export const outboxEventsTable = (scope: ScopeName, owner: Owner) =>
  pgTable(
    "outbox_events",
    {
      scopeId: scopeColumn(scope, owner),
      id: uuid("id").notNull(),
      type: text("type").notNull(),
      version: integer("version").notNull().default(1),
      idempotencyKey: text("idempotency_key").notNull(),
      dataClass: text("data_class").notNull(),
      replayable: boolean("replayable").notNull().default(true),
      payload: jsonb("payload").notNull(),
      occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
      dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    },
    (t) => [
      primaryKey({ columns: [t.scopeId, t.id] }),
      unique("outbox_events_idempotency_uq").on(t.scopeId, t.idempotencyKey),
      index("outbox_pending_idx").on(t.occurredAt).where(sql`${t.dispatchedAt} IS NULL`),
      check("outbox_events_data_class_ck", sql`${t.dataClass} IN ('public','internal','confidential')`),
    ],
  );

/** Which features a scope is entitled to and has switched on (FND-004). */
export const featureEntitlementsTable = (scope: ScopeName, owner: Owner) =>
  pgTable(
    "feature_entitlements",
    {
      scopeId: scopeColumn(scope, owner),
      featureId: text("feature_id").notNull(),
      entitled: boolean("entitled").notNull().default(false),
      enabled: boolean("enabled").notNull().default(false),
      changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
      // When a feature is switched off, data is kept 180 days unless statutory retention applies longer.
      offSince: timestamp("off_since", { withTimezone: true }),
    },
    (t) => [primaryKey({ columns: [t.scopeId, t.featureId] })],
  );
