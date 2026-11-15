import pg from "pg";
import type { Queryable, TxRunner } from "./index.js";

// Calendar dates (Postgres "date") come back as "YYYY-MM-DD" text, never as a JavaScript Date. A Date
// is a moment in the server's time zone: on a Lagos-time machine, 1 November becomes 31 October 23:00 UTC,
// which moved entries a day back and budgets a month back. Text is also what the test database returns.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

/** Production adapter over a pg Pool. Use the velaq_app role, never a superuser, so row level security applies. */
export function pgRunner(connectionString: string): TxRunner & { close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString });
  return {
    query: (sql: string, params?: unknown[]) => pool.query(sql, params) as never,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: (sql: string, params?: unknown[]) => client.query(sql, params) as never });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  } as TxRunner & { close(): Promise<void> };
}
