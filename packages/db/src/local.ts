/**
 * Local development database without Docker: an embedded Postgres (PGlite) stored in a folder,
 * migrated on start. Used only when no database URL is set and NODE_ENV is not production.
 * After migrating it switches to the velaq_app role, so row level security and grants apply
 * locally exactly as they do on the hosted database.
 */
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { type Database, type Queryable, type TxRunner, migrationsFolder } from "./index.js";

export async function localDatabase(db: Database, dir: string): Promise<TxRunner & { close(): Promise<void> }> {
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await migrate(drizzle(pg), { migrationsFolder: migrationsFolder(db), migrationsTable: "__migrations", migrationsSchema: "public" });
  await pg.exec("SET ROLE velaq_app");
  return {
    query: (s, p) => pg.query(s, p as unknown[]) as never,
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) =>
      pg.transaction((t) => fn({ query: (s, p) => t.query(s, p as unknown[]) as never })),
    close: () => pg.close(),
  };
}
