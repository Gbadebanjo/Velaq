import "./env.js";
import { appDatabaseUrl, isPlane, pgRunner } from "@velaq/db";
import { relayTenant } from "./relay.js";

// One worker per product database, like the API.
const plane = process.env.PLANE ?? "personal";
if (!isPlane(plane)) throw new Error(`PLANE must be business, personal or marketplace, not "${plane}"`);
const url = appDatabaseUrl(plane);
if (!url) throw new Error(`DATABASE_URL_${plane.toUpperCase()} is required`);
const db = pgRunner(url);
// Tenants (Business) or spaces (Personal) to relay for. A registry-driven list replaces this later.
const scopes = (process.env.RELAY_SCOPES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// Placeholder publisher: the BullMQ/Redis fan-out is wired here in the next step.
const publish = async (scopeId: string, e: { id: string; type: string }) => {
  console.log(JSON.stringify({ msg: "event", plane, scopeId, id: e.id, type: e.type }));
};

console.log(`velaq-worker (${plane}) relaying for ${scopes.length} scope(s)`);
setInterval(() => {
  for (const s of scopes) relayTenant(db, s, publish).catch((err) => console.error("relay failed", s, err));
}, 2000);
