import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../shared/schema.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile =
  process.env.DATABASE_URL?.replace(/^sqlite:\/\//, "") || "./maraai.sqlite";
console.log("[db.ts] Using dbFile:", dbFile);
const sqlite = new Database(dbFile);
export const db = drizzle(sqlite, { schema });

// Run migrations automatically at startup so tables always exist.
// The migrations folder is relative to the project root (one level up from server/).
try {
  migrate(db, { migrationsFolder: path.resolve(__dirname, "..", "migrations") });
} catch (err) {
  console.warn("[db.ts] Migration warning (non-fatal):", (err as Error).message);
}
