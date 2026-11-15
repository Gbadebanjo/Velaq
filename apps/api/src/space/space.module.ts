import { join } from "node:path";
import { Global, Module } from "@nestjs/common";
import { type TxRunner, appDatabaseUrl, pgRunner } from "@velaq/db";
import { PERSONAL_DB, SpaceService } from "./space.service.js";

/**
 * The Personal database. Uses DATABASE_URL_PERSONAL (or the admin URL plus VELAQ_APP_PASSWORD).
 * Locally, with neither set, it falls back to an embedded Postgres in apps/api/.data.
 */
export async function personalDatabase(env: NodeJS.ProcessEnv = process.env): Promise<TxRunner> {
  const url = appDatabaseUrl("personal", env);
  if (url) return pgRunner(url);
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL_PERSONAL (or DATABASE_ADMIN_URL_PERSONAL) is required in production");
  const { localDatabase } = await import("@velaq/db/local");
  const dir = join(process.cwd(), ".data", "personal");
  console.log(`velaq-api: no personal database URL set, using the local one in ${dir}`);
  return localDatabase("personal", dir);
}

/** FND-002: one Personal space per person, bound to every Personal request. */
@Global()
@Module({
  providers: [{ provide: PERSONAL_DB, useFactory: () => personalDatabase() }, SpaceService],
  exports: [PERSONAL_DB, SpaceService],
})
export class SpaceModule {}
