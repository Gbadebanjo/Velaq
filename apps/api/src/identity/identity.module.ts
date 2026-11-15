import { join } from "node:path";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { type Plane, type TxRunner, appDatabaseUrl, pgRunner } from "@velaq/db";
import { AuthGuard } from "../auth/auth.guard.js";
import { BREACH_CHECKER, breachCheckerFromEnv } from "./breach.js";
import { IdentityController } from "./identity.controller.js";
import { IDENTITY_CONFIG, IDENTITY_DB, type IdentityConfig, IdentityService } from "./identity.service.js";
import { MAILER, mailerFromEnv } from "./mailer.js";

const DEV_SECRET = "velaq-local-development-only";

export function identityConfigFromEnv(plane: Plane, env: NodeJS.ProcessEnv = process.env): IdentityConfig {
  const secret = env.AUTH_SECRET;
  if (!secret && env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
  return { codeSecret: secret || DEV_SECRET, product: plane };
}

/**
 * The identity database. Uses DATABASE_URL_IDENTITY (or the admin URL plus VELAQ_APP_PASSWORD).
 * Locally, with neither set, it falls back to an embedded Postgres in apps/api/.data so the API
 * runs without Docker.
 */
export async function identityDatabase(env: NodeJS.ProcessEnv = process.env): Promise<TxRunner> {
  const url = appDatabaseUrl("identity", env);
  if (url) return pgRunner(url);
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL_IDENTITY (or DATABASE_ADMIN_URL_IDENTITY) is required in production");
  const { localDatabase } = await import("@velaq/db/local");
  const dir = join(process.cwd(), ".data", "identity");
  console.log(`velaq-api: no identity database URL set, using the local one in ${dir}`);
  return localDatabase("identity", dir);
}

/** FND-001 Identity: sign-up, sign-in, email codes and sessions, plus the global session guard. */
@Global()
@Module({})
export class IdentityModule {
  static forPlane(plane: Plane): DynamicModule {
    return {
      module: IdentityModule,
      global: true,
      controllers: [IdentityController],
      providers: [
        { provide: IDENTITY_DB, useFactory: () => identityDatabase() },
        { provide: IDENTITY_CONFIG, useValue: identityConfigFromEnv(plane) },
        { provide: MAILER, useFactory: () => mailerFromEnv() },
        { provide: BREACH_CHECKER, useFactory: () => breachCheckerFromEnv() },
        IdentityService,
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [IdentityService],
    };
  }
}
