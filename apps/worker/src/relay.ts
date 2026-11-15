import { markDispatched, pendingEvents, withTenant, type PendingEvent, type TxRunner } from "@velaq/db";

export type Publish = (tenantId: string, e: PendingEvent) => Promise<void>;

/**
 * One relay pass for a tenant: publish pending outbox events, then mark them dispatched.
 * Delivery is at-least-once: if publishing succeeds but marking fails, events are sent again,
 * so consumers must be idempotent (they are keyed by event id).
 */
export async function relayTenant(db: TxRunner, tenantId: string, publish: Publish, batch = 100): Promise<number> {
  const events = await withTenant(db, tenantId, (tx) => pendingEvents(tx, batch));
  const done: string[] = [];
  for (const e of events) {
    await publish(tenantId, e);
    done.push(e.id);
  }
  await withTenant(db, tenantId, (tx) => markDispatched(tx, done));
  return done.length;
}
