/**
 * Apply migrations to each product database that has an admin URL set:
 *   DATABASE_ADMIN_URL_IDENTITY, DATABASE_ADMIN_URL_BUSINESS, DATABASE_ADMIN_URL_PERSONAL, DATABASE_ADMIN_URL_MARKETPLACE
 * Pass plane names to limit the run, e.g. `pnpm db:migrate personal`.
 * The admin role is used only here; the apps connect as velaq_app.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { DATABASES, type Database, isDatabase, migrationsFolder } from "./index.js";
import { strictSsl } from "./pg.js";

export const MIGRATIONS_TABLE = { migrationsTable: "__migrations", migrationsSchema: "public" } as const;

const args = process.argv.slice(2);
const bad = args.filter((a) => !isDatabase(a));
if (bad.length) throw new Error(`Unknown database: ${bad.join(", ")}. Use ${DATABASES.join(", ")}.`);
const planes: readonly Database[] = args.length ? (args as Database[]) : DATABASES;

let ran = 0;
for (const plane of planes) {
  const url = process.env[`DATABASE_ADMIN_URL_${plane.toUpperCase()}`];
  const folder = migrationsFolder(plane);
  if (!existsSync(join(folder, "meta", "_journal.json"))) {
    console.log(`${plane}: no migrations yet, skipped`);
    continue;
  }
  if (!url) {
    console.log(`${plane}: DATABASE_ADMIN_URL_${plane.toUpperCase()} not set, skipped`);
    continue;
  }
  const appPassword = process.env.VELAQ_APP_PASSWORD?.trim();
  // Never the value itself: only whether it's there, so a missing setting is easy to spot in deploy logs.
  console.log(`${plane}: VELAQ_APP_PASSWORD ${appPassword ? `is set (${appPassword.length} characters)` : "is NOT set"}`);
  // A hosted database must never get the development password (and Neon refuses it anyway).
  const host = new URL(url).hostname;
  if (!appPassword && !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      `VELAQ_APP_PASSWORD is not set. ${plane} is a hosted database (${host}), so the app's database user needs a strong password. ` +
        "Add VELAQ_APP_PASSWORD to the service's environment (on Render, use Generate) and deploy again.",
    );
  }
  const client = new pg.Client({ connectionString: strictSsl(url) });
  await client.connect();
  try {
    // Hosts such as Neon refuse weak passwords, including the development one the first migration
    // uses. So when a hosted password is set, create the app role with it first; the migration then
    // finds the role and leaves it alone.
    if (appPassword) {
      const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'velaq_app'");
      if (!exists.rowCount) {
        await client.query(`CREATE ROLE velaq_app LOGIN PASSWORD ${client.escapeLiteral(appPassword)} NOSUPERUSER NOBYPASSRLS`);
        console.log(`${plane}: created the velaq_app database user`);
      }
    }
    await migrate(drizzle(client), { migrationsFolder: folder, ...MIGRATIONS_TABLE });
    // Hosted environments replace the development password on the app role.
    if (appPassword) {
      await client.query(`ALTER ROLE velaq_app WITH PASSWORD ${client.escapeLiteral(appPassword)}`);
    }
    console.log(`${plane}: up to date`);
    ran++;
  } finally {
    await client.end();
  }
}
if (ran === 0) console.log("Nothing migrated. Set DATABASE_ADMIN_URL_<PLANE> in .env.");
