import type { Database } from "./index.js";

/**
 * Connection string the apps use for a product database, as velaq_app (row level security applies).
 * Uses DATABASE_URL_<PLANE> when set. Otherwise derives it from DATABASE_ADMIN_URL_<PLANE> by
 * swapping in velaq_app and VELAQ_APP_PASSWORD, so hosted environments only manage one URL per database.
 */
export function appDatabaseUrl(plane: Database, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = plane.toUpperCase();
  const direct = env[`DATABASE_URL_${key}`];
  if (direct) return direct;
  const admin = env[`DATABASE_ADMIN_URL_${key}`];
  const password = env.VELAQ_APP_PASSWORD;
  if (!admin || !password) return undefined;
  const u = new URL(admin);
  u.username = "velaq_app";
  u.password = password;
  return u.toString();
}
