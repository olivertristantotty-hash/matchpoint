import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getClient() {
  if (!_client) {
    const connectionString = process.env.DATABASE_URL!;
    _client = postgres(connectionString, { ssl: "require" });
  }
  return _client;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    if (!_db) {
      _db = drizzle(getClient());
    }
    return (_db as any)[prop];
  },
});
