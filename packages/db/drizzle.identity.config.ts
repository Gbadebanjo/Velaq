import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/identity.ts",
  out: "./migrations/identity",
  migrations: { table: "__migrations", schema: "public" },
});
