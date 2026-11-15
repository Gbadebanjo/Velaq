import { z } from "zod";

/** Standard envelope for every platform event. Events carry IDs and non-Restricted measures only. */
export const EventEnvelope = z.object({
  id: z.string().uuid(),
  type: z.string().regex(/^[a-z]+\.[A-Za-z]+(\.[A-Za-z]+)*$/, "use domain.EventName"),
  version: z.number().int().positive(),
  tenantId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  /** Idempotency key: consumers must tolerate at-least-once delivery. */
  idempotencyKey: z.string().min(1),
  dataClass: z.enum(["public", "internal", "confidential"]),
  /** Replayable events are kept for the tenant's life; others for 13 months. */
  replayable: z.boolean().default(true),
  payload: z.record(z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

/** Restricted values must never appear in event payloads. */
const RESTRICTED_KEYS = ["salary", "bankAccount", "accountNumber", "taxId", "nationalId", "password", "secret"];
export function assertNoRestrictedKeys(payload: Record<string, unknown>, path = ""): void {
  for (const [k, v] of Object.entries(payload)) {
    if (RESTRICTED_KEYS.some((r) => k.toLowerCase().includes(r.toLowerCase()))) {
      throw new Error(`restricted field "${path}${k}" is not allowed in an event payload`);
    }
    if (v && typeof v === "object" && !Array.isArray(v)) assertNoRestrictedKeys(v as Record<string, unknown>, `${path}${k}.`);
  }
}
