// Smoke test for the admin chat mode (Item 1).
//
// Run as: npx tsx scripts/test-admin-chat.mts
//
// What this exercises (LLM-free, no network):
//   1. isUserAdmin() returns true when ADMIN_USER_IDS matches the user id
//   2. isUserAdmin() returns true when ADMIN_EMAILS matches the user's email
//   3. isUserAdmin() returns false when neither env var matches
//   4. buildPersonalityPrompt(_, _, true) contains the admin marker block
//      and DOES NOT contain the user-facing scaffolding markers
//   5. buildPersonalityPrompt(_, _, false) contains the user-facing markers
//
// Side effects: writes to a fresh /tmp DB, then deletes it.

import { unlinkSync } from 'node:fs';

const DB = '/tmp/maracore-admin-chat-test.sqlite';
try { unlinkSync(DB); } catch {}
process.env.DATABASE_PATH = DB;

// Ensure migrations + auto-create DDL run via the server's db module.
const { rawSqlite } = await import('../server/db.ts');

// `users` table is created by drizzle migrations from server/index.ts (not
// auto-created by db.ts). For this isolated smoke test we recreate just the
// columns that the schema model declares so drizzle's column-expansion in
// admin-check's SELECT works. Insert uses raw SQL to avoid having to seed
// every column the model declares.
rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    bio TEXT,
    profile_image_url TEXT,
    cover_image_url TEXT,
    location TEXT,
    website TEXT,
    tier TEXT NOT NULL DEFAULT 'free',
    trial_start_time INTEGER,
    trial_ends_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);

const { isUserAdmin } = await import('../server/lib/admin-check.ts');
const { buildPersonalityPrompt } = await import('../server/mara-brain/personality.ts');

function ok(msg: string) { console.log('OK:', msg); }
function fail(msg: string): never { console.error('FAIL:', msg); process.exit(1); }

// -----------------------------------------------------------------------------
// Seed three users: one for the ADMIN_USER_IDS path, one for the ADMIN_EMAILS
// path, one ordinary. Email is the only field isUserAdmin reads, but the
// schema has more required columns so we satisfy them.
// -----------------------------------------------------------------------------

const ADMIN_BY_ID = 'admin-by-id-uuid';
const ADMIN_BY_EMAIL = 'admin-by-email-uuid';
const NORMAL = 'normal-user-uuid';

const insert = rawSqlite.prepare(
  'INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)',
);
insert.run(ADMIN_BY_ID, 'someone-else@example.com');
insert.run(ADMIN_BY_EMAIL, 'TheoRaul29@gmail.com');
insert.run(NORMAL, 'trial-user@example.com');

// -----------------------------------------------------------------------------
// 1. isUserAdmin — ADMIN_USER_IDS path
// -----------------------------------------------------------------------------

console.log('\n--- isUserAdmin (ADMIN_USER_IDS) ---');

process.env.ADMIN_USER_IDS = ADMIN_BY_ID;
process.env.ADMIN_EMAILS = '';

if (!(await isUserAdmin(ADMIN_BY_ID))) fail('expected admin-by-id to be admin');
ok('admin-by-id is admin via ADMIN_USER_IDS');

if (await isUserAdmin(NORMAL)) fail('expected normal user to NOT be admin');
ok('normal user is NOT admin when only ADMIN_USER_IDS is set');

if (await isUserAdmin('')) fail('empty userId should never be admin');
ok('empty userId is never admin');

if (await isUserAdmin(null)) fail('null userId should never be admin');
ok('null userId is never admin');

// -----------------------------------------------------------------------------
// 2. isUserAdmin — ADMIN_EMAILS path (case-insensitive)
// -----------------------------------------------------------------------------

console.log('\n--- isUserAdmin (ADMIN_EMAILS) ---');

process.env.ADMIN_USER_IDS = '';
// Mixed case in env to verify lowercasing both sides
process.env.ADMIN_EMAILS = 'theoraul29@GMAIL.com, other@example.com';

if (!(await isUserAdmin(ADMIN_BY_EMAIL))) fail('expected admin-by-email to be admin (case-insensitive)');
ok('admin-by-email is admin via ADMIN_EMAILS (case-insensitive)');

if (await isUserAdmin(NORMAL)) fail('expected normal user to NOT be admin');
ok('normal user is NOT admin when only ADMIN_EMAILS is set');

// -----------------------------------------------------------------------------
// 3. isUserAdmin — neither env set → nobody admin
// -----------------------------------------------------------------------------

console.log('\n--- isUserAdmin (no env) ---');

process.env.ADMIN_USER_IDS = '';
process.env.ADMIN_EMAILS = '';

if (await isUserAdmin(ADMIN_BY_ID)) fail('no env set → must not return admin');
if (await isUserAdmin(ADMIN_BY_EMAIL)) fail('no env set → must not return admin');
ok('nobody is admin when both env vars are empty');

// -----------------------------------------------------------------------------
// 4. buildPersonalityPrompt(isAdmin=true) returns admin persona
// -----------------------------------------------------------------------------

console.log('\n--- buildPersonalityPrompt(isAdmin=true) ---');

const defaultTox = { level: 0 as const, warmthReduction: 0, consecutiveToxicMessages: 0, lastEscalation: null };
const adminPrompt = buildPersonalityPrompt(defaultTox, undefined, true);

if (!adminPrompt.includes('MOD ADMIN ACTIV')) fail('admin prompt must contain "MOD ADMIN ACTIV"');
ok('admin prompt contains MOD ADMIN ACTIV marker');

if (!adminPrompt.includes('senior engineer')) fail('admin prompt must frame Mara as senior engineer');
ok('admin prompt frames Mara as senior engineer');

if (adminPrompt.includes('# COMPORTAMENT FUNDAMENTAL')) {
  fail('admin prompt should NOT inherit user-facing COMPORTAMENT FUNDAMENTAL block');
}
ok('admin prompt drops user-facing COMPORTAMENT FUNDAMENTAL block');

if (adminPrompt.includes('# MOTIVARE')) {
  fail('admin prompt should NOT inherit MOTIVARE block (motivational language)');
}
ok('admin prompt drops MOTIVARE block');

// Toxicity must not bleed into admin prompt even if elevated
const escalatedTox = { level: 3 as const, warmthReduction: 0.7, consecutiveToxicMessages: 4, lastEscalation: new Date().toISOString() };
const escalatedAdminPrompt = buildPersonalityPrompt(escalatedTox, undefined, true);
if (escalatedAdminPrompt.includes('NIVEL TOXICITATE')) {
  fail('admin prompt should NOT surface toxicity scaffolding even when tox state is escalated');
}
ok('admin prompt ignores toxicity escalation (admin does not need protection)');

// -----------------------------------------------------------------------------
// 5. buildPersonalityPrompt(isAdmin=false) returns user-facing persona
// -----------------------------------------------------------------------------

console.log('\n--- buildPersonalityPrompt(isAdmin=false) ---');

const userPrompt = buildPersonalityPrompt(defaultTox, undefined, false);

if (!userPrompt.includes('# IDENTITY')) fail('user prompt must contain # IDENTITY');
ok('user prompt contains # IDENTITY marker');

if (!userPrompt.includes('# COMPORTAMENT FUNDAMENTAL')) {
  fail('user prompt must contain # COMPORTAMENT FUNDAMENTAL');
}
ok('user prompt contains # COMPORTAMENT FUNDAMENTAL marker');

if (userPrompt.includes('MOD ADMIN ACTIV')) {
  fail('user prompt must NOT contain admin marker');
}
ok('user prompt does NOT contain admin marker');

// Default isAdmin (omitted) should equal isAdmin=false (backwards compat)
const defaultPrompt = buildPersonalityPrompt(defaultTox, undefined);
if (defaultPrompt !== userPrompt) fail('default isAdmin must equal isAdmin=false (backwards compat)');
ok('default isAdmin parameter is backwards-compatible');

// -----------------------------------------------------------------------------

console.log('\nAll admin-chat smoke tests passed ✓');
try { unlinkSync(DB); } catch {}
process.exit(0);
