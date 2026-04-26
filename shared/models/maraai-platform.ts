// MaraAI hybrid-platform schema (Phase 3).
//
// See migrations/0010_maraai_platform.sql for the on-disk shape. These
// drizzle definitions exist so server-side code can do typed reads/writes
// without dropping into raw SQL.

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Per-user GDPR consent record + selected operating mode + kill switch. */
export const consentRecords = sqliteTable('consent_records', {
  userId: text('user_id').primaryKey(),
  /** 'centralized' | 'hybrid' | 'advanced' */
  mode: text('mode').default('centralized').notNull(),
  p2pEnabled: integer('p2p_enabled').default(0).notNull(),
  bandwidthShareGbMonth: integer('bandwidth_share_gb_month').default(0).notNull(),
  backgroundNode: integer('background_node').default(0).notNull(),
  advancedAiRouting: integer('advanced_ai_routing').default(0).notNull(),
  notificationsEnabled: integer('notifications_enabled').default(0).notNull(),
  killSwitch: integer('kill_switch').default(0).notNull(),
  consentVersion: integer('consent_version').default(1).notNull(),
  acceptedTermsAt: integer('accepted_terms_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/** Registered devices participating in the P2P mesh. */
export const p2pNodes = sqliteTable(
  'p2p_nodes',
  {
    nodeId: text('node_id').primaryKey(),
    userId: text('user_id').notNull(),
    deviceLabel: text('device_label'),
    /** 'online' | 'offline' | 'killed' */
    status: text('status').default('offline').notNull(),
    score: integer('score').default(0).notNull(),
    uptimeSec: integer('uptime_sec').default(0).notNull(),
    bytesIn: integer('bytes_in').default(0).notNull(),
    bytesOut: integer('bytes_out').default(0).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [index('idx_p2p_nodes_user').on(table.userId)],
);

/** Activity log surfaced to the user via the transparency dashboard. */
export const activityLog = sqliteTable(
  'activity_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id'),
    kind: text('kind').notNull(),
    meta: text('meta').default('{}').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [index('idx_activity_log_user_time').on(table.userId, table.createdAt)],
);

/** Which route (local/central/p2p) handled each AI call. */
export const aiRouteLog = sqliteTable(
  'ai_route_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id'),
    /** 'local' | 'central' | 'p2p' */
    route: text('route').notNull(),
    module: text('module'),
    latencyMs: integer('latency_ms').default(0).notNull(),
    tokensIn: integer('tokens_in').default(0).notNull(),
    tokensOut: integer('tokens_out').default(0).notNull(),
    success: integer('success').default(1).notNull(),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [index('idx_ai_route_log_user_time').on(table.userId, table.createdAt)],
);

/** Short-lived OTP codes for email-OTP registration / login. */
export const emailOtpCodes = sqliteTable(
  'email_otp_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    /** 'register' | 'login' | 'reset' */
    purpose: text('purpose').default('register').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    consumedAt: integer('consumed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [index('idx_email_otp_email_time').on(table.email, table.createdAt)],
);

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
export type P2PNode = typeof p2pNodes.$inferSelect;
export type NewP2PNode = typeof p2pNodes.$inferInsert;
export type ActivityLogRow = typeof activityLog.$inferSelect;
export type AiRouteLogRow = typeof aiRouteLog.$inferSelect;
export type EmailOtpCode = typeof emailOtpCodes.$inferSelect;

export type MaraMode = 'centralized' | 'hybrid' | 'advanced';
export type AiRoute = 'local' | 'central' | 'p2p';

/** Default consent record for users who have not completed onboarding. */
export const DEFAULT_CONSENT: Omit<NewConsentRecord, 'userId'> = {
  mode: 'centralized',
  p2pEnabled: 0,
  bandwidthShareGbMonth: 0,
  backgroundNode: 0,
  advancedAiRouting: 0,
  notificationsEnabled: 0,
  killSwitch: 0,
  consentVersion: 1,
};

export const CURRENT_CONSENT_VERSION = 1;
