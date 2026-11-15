/** Test helpers: an in-process Postgres (PGlite) migrated like a real product database. */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { type Database, type Queryable, type TxRunner, migrationsFolder } from "./index.js";

export interface TestDatabase {
  /** Superuser connection, for seeding. Bypasses row level security. */
  admin: PGlite;
  /** Connection as velaq_app, subject to row level security like the real API. */
  app: TxRunner;
  /** Typed Drizzle client on the velaq_app connection. */
  orm: ReturnType<typeof drizzle>;
}

export async function testDatabase(plane: Database): Promise<TestDatabase> {
  const admin = new PGlite();
  await migrate(drizzle(admin), { migrationsFolder: migrationsFolder(plane), migrationsTable: "__migrations", migrationsSchema: "public" });
  // PGlite is a single connection, so switching role applies to every later query.
  const asApp = async () => { await admin.exec("SET ROLE velaq_app"); };
  const app: TxRunner = {
    query: async (s, p) => { await asApp(); return admin.query(s, p as unknown[]) as never; },
    transaction: async <T>(fn: (tx: Queryable) => Promise<T>) => {
      await asApp();
      return admin.transaction((t) => fn({ query: (s, p) => t.query(s, p as unknown[]) as never }));
    },
  };
  return { admin, app, orm: drizzle(admin) };
}

/** Seed as superuser, then return to the app role. */
export async function asSuperuser<T>(db: TestDatabase, fn: (admin: PGlite) => Promise<T>): Promise<T> {
  await db.admin.exec("RESET ROLE");
  try {
    return await fn(db.admin);
  } finally {
    await db.admin.exec("SET ROLE velaq_app");
  }
}
