import { assertNoRestrictedKeys } from "@velaq/contracts";
import type { Queryable } from "./index.js";

export interface NewEvent {
  id: string;
  type: string;
  idempotencyKey: string;
  dataClass: "public" | "internal" | "confidential";
  replayable?: boolean;
  version?: number;
  payload: Record<string, unknown>;
}

/**
 * Write an event in the same transaction as the business change (transactional outbox).
 * The owning tenant or space comes from the scope bound to the transaction.
 * Duplicate idempotency keys are ignored, so retries are safe. Works in every product database.
 */
export async function enqueueEvent(tx: Queryable, e: NewEvent): Promise<boolean> {
  assertNoRestrictedKeys(e.payload);
  const r = await tx.query(
    `INSERT INTO outbox_events (id, type, version, idempotency_key, data_class, replayable, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [e.id, e.type, e.version ?? 1, e.idempotencyKey, e.dataClass, e.replayable ?? true, JSON.stringify(e.payload)],
  );
  return r.rows.length > 0;
}

export interface PendingEvent { id: string; type: string; version: number; payload: Record<string, unknown>; occurred_at: string }

export async function pendingEvents(tx: Queryable, limit = 100): Promise<PendingEvent[]> {
  const r = await tx.query<PendingEvent>(
    `SELECT id, type, version, payload, occurred_at FROM outbox_events
     WHERE dispatched_at IS NULL ORDER BY occurred_at LIMIT $1`, [limit]);
  return r.rows;
}

export async function markDispatched(tx: Queryable, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.query(`UPDATE outbox_events SET dispatched_at = now() WHERE id = ANY($1::uuid[]) AND dispatched_at IS NULL`, [ids]);
}
