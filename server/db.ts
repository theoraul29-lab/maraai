import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../shared/schema.js";

const dbFile =
  process.env.DATABASE_URL?.replace(/^sqlite:\/\//, "") || "./maraai.sqlite";
console.log("[db.ts] Using dbFile:", dbFile);
const sqlite = new Database(dbFile);
export const db = drizzle(sqlite, { schema });
