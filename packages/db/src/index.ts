import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export * from "./schema.js";
export * from "./repository.js";

export function createDatabase(url: string) {
  const client = postgres(url, { prepare: false, max: 10 });
  return { db: drizzle(client, { schema }), client, close: () => client.end() };
}
