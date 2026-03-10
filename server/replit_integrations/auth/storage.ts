import {
  users,
  localAuthCredentials,
  type User,
  type UpsertUser,
} from "../../../shared/models/auth.js";
import { db } from "../../db.js";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createLocalUserAccount(input: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User>;
  verifyLocalUserCredentials(input: {
    email: string;
    password: string;
    comparePassword: (password: string, hash: string) => Promise<boolean>;
  }): Promise<User | undefined>;
}

class AuthStorage implements IAuthStorage {
  private initialized = false;

  private async ensureAuthTables() {
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

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS local_auth_credentials (
        user_id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    this.initialized = true;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.ensureAuthTables();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await this.ensureAuthTables();
    const normalized = this.normalizeEmail(email);
    const [user] = await db.select().from(users).where(eq(users.email, normalized));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
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

  async createLocalUserAccount(input: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    await this.ensureAuthTables();
    const normalized = this.normalizeEmail(input.email);

    const existing = await this.getUserByEmail(normalized);
    if (existing) {
      throw new Error("Email already exists");
    }

    const userId = randomUUID();
    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: normalized,
        firstName: input.firstName || "",
        lastName: input.lastName || "",
        displayName: [input.firstName, input.lastName].filter(Boolean).join(" ") || null,
      })
      .returning();

    await db.insert(localAuthCredentials).values({
      userId,
      email: normalized,
      passwordHash: input.passwordHash,
    });

    return user;
  }

  async verifyLocalUserCredentials(input: {
    email: string;
    password: string;
    comparePassword: (password: string, hash: string) => Promise<boolean>;
  }): Promise<User | undefined> {
    await this.ensureAuthTables();
    const normalized = this.normalizeEmail(input.email);
    const [cred] = await db
      .select()
      .from(localAuthCredentials)
      .where(eq(localAuthCredentials.email, normalized));

    if (!cred) return undefined;
    const isValid = await input.comparePassword(input.password, cred.passwordHash);
    if (!isValid) return undefined;

    return this.getUser(cred.userId);
  }
}

export const authStorage = new AuthStorage();
