import { users } from "../../../shared/models/auth.js";
import { db } from "../../db.js";
import { eq, sql } from "drizzle-orm";
class AuthStorage {
  initialized = false;

  async ensureAuthTables() {
    if (this.initialized) return;
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        first_name TEXT,
        last_name TEXT,
        display_name TEXT,
        bio TEXT,
        profile_image_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.initialized = true;
  }

  async getUser(id) {
    await this.ensureAuthTables();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async upsertUser(userData) {
    await this.ensureAuthTables();
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
}
export const authStorage = new AuthStorage();
