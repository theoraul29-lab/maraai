import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
