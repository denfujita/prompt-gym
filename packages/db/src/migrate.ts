import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for database migrations");

const client = postgres(databaseUrl, { max: 1, prepare: false });
try {
  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
  await migrate(drizzle(client), { migrationsFolder });
} finally {
  await client.end();
}
