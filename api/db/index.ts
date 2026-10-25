import { drizzle } from "drizzle-orm/libsql";

if (!process.env.TURSO_CONNECTION_URL!)
  throw new Error("Missing - TURSO_CONNECTION_URL");
if (!process.env.TURSO_AUTH_TOKEN!)
  throw new Error("Missing - TURSO_AUTH_TOKEN");

export const db = drizzle({
  connection: {
    url: process.env.TURSO_CONNECTION_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
});
