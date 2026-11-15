import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/personal.ts",
  out: "./migrations/personal",
  migrations: { table: "__migrations", schema: "public" },
});
