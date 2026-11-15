import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/business.ts",
  out: "./migrations/business",
  migrations: { table: "__migrations", schema: "public" },
});
