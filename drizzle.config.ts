import { defineConfig } from "drizzle-kit";

if (!process.env.TURSO_CONNECTION_URL!)
  throw new Error("Missing - TURSO_CONNECTION_URL");
if (!process.env.TURSO_AUTH_TOKEN!)
  throw new Error("Missing - TURSO_AUTH_TOKEN");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_CONNECTION_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
});
