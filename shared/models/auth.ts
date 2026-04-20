import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = sqliteTable(
  'sessions',
  {
    sid: text('sid').primaryKey(),
    sess: text('sess').notNull(),
    expire: integer('expire', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('IDX_session_expire').on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .default(sql`lower(hex(randomblob(16)))`),
  email: text('email').unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  displayName: text('display_name'),
  bio: text('bio'),
  profileImageUrl: text('profile_image_url'),
  coverImageUrl: text('cover_image_url'),
  location: text('location'),
  website: text('website'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// Local email/password credentials for development auth mode.
export const localAuthCredentials = sqliteTable('local_auth_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// Linked external identities (Google, Facebook, ...). A single platform user
// may have multiple OAuth accounts attached; we key by (provider,
// providerUserId) for stable re-login even if the email on the provider side
// changes later. Email is stored for reference / support only.
export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`CURRENT_TIMESTAMP`,
    ),
  },
  (table) => [
    index('oauth_accounts_user_id').on(table.userId),
    // Unique so a single Google (or Facebook) identity can only be linked to
    // one local user. Mirrors CREATE UNIQUE INDEX in migration 0008.
    uniqueIndex('oauth_accounts_provider_puid').on(table.provider, table.providerUserId),
  ],
);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
