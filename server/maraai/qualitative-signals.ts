// Qualitative signal detector — injects investigator context into Mara's
// system prompt when a user hits a critical moment:
//
//   1. mission_abandoned  — started a mission 24h+ ago, still in progress
//   2. returning_user     — hasn't chatted in 3+ days
//   3. not_activated      — signed up 30 min–48 h ago, no mission started yet
//
// The returned string is appended to the system instruction (internal note,
// never shown to the user). Mara uses it to ask naturally — no pressure.

import { rawSqlite } from '../db.js';

const ABANDON_HOURS = 24;
const RETURNING_DAYS = 3;
const ACTIVATION_WINDOW_MIN_H = 0.5; // 30 minutes
const ACTIVATION_WINDOW_MAX_H = 48;

interface Signal {
  context: string;
}

function missionAbandonedSignal(userId: string): Signal | null {
  try {
    const row = rawSqlite
      .prepare(
        `SELECT m.title, um.started_at
         FROM user_missions um
         JOIN missions m ON m.id = um.mission_id
         WHERE um.user_id = ?
           AND um.status = 'active'
           AND um.started_at < unixepoch() - ?
         ORDER BY um.started_at DESC
         LIMIT 1`,
      )
      .get(userId, ABANDON_HOURS * 3600) as
      | { title: string; started_at: number }
      | undefined;

    if (!row) return null;

    const hoursAgo = Math.round((Date.now() / 1000 - row.started_at) / 3600);
    return {
      context: `Userul a început misiunea "${row.title}" acum ${hoursAgo} de ore și nu a finalizat-o. Dacă contextul conversației o permite, întreabă natural și empatic ce s-a întâmplat — fără presiune, cu înțelegere.`,
    };
  } catch {
    return null;
  }
}

function returningUserSignal(userId: string): Signal | null {
  try {
    const row = rawSqlite
      .prepare(
        `SELECT MAX(created_at) as last_chat
         FROM chat_messages
         WHERE user_id = ? AND sender = 'user'`,
      )
      .get(userId) as { last_chat: number | null } | undefined;

    if (!row?.last_chat) return null;

    const daysSince = (Date.now() / 1000 - row.last_chat) / 86400;
    if (daysSince < RETURNING_DAYS) return null;

    const days = Math.round(daysSince);
    return {
      context: `Userul nu a mai vorbit cu Mara de ${days} zile. Salută-l cu căldură, cu bucurie că s-a întors — fără reproș, fără întrebări despre absență dacă nu le deschide el.`,
    };
  } catch {
    return null;
  }
}

function notActivatedSignal(userId: string): Signal | null {
  try {
    const userRow = rawSqlite
      .prepare('SELECT created_at FROM users WHERE id = ?')
      .get(userId) as { created_at: number | null } | undefined;

    if (!userRow?.created_at) return null;

    // created_at is stored as Unix seconds in SQLite
    const hoursSinceSignup = (Date.now() / 1000 - userRow.created_at) / 3600;
    if (
      hoursSinceSignup < ACTIVATION_WINDOW_MIN_H ||
      hoursSinceSignup > ACTIVATION_WINDOW_MAX_H
    )
      return null;

    const hasMission = rawSqlite
      .prepare('SELECT 1 FROM user_missions WHERE user_id = ? LIMIT 1')
      .get(userId);
    if (hasMission) return null;

    const window =
      hoursSinceSignup < 1
        ? 'câteva minute'
        : `${Math.round(hoursSinceSignup)} ore`;
    return {
      context: `Userul s-a înscris pe Mara acum ${window} și nu a început nicio misiune. Dacă vine natural în conversație, invită-l cald să-și aleagă prima misiune — e un pas mic dar semnificativ.`,
    };
  } catch {
    return null;
  }
}

/**
 * Returns an optional block to append to the system instruction.
 * Empty string if no signal fires.
 */
export function getInvestigatorContext(userId: string): string {
  const signals: string[] = [];

  const returning = returningUserSignal(userId);
  if (returning) signals.push(returning.context);

  const abandoned = missionAbandonedSignal(userId);
  if (abandoned) signals.push(abandoned.context);

  const notActivated = notActivatedSignal(userId);
  if (notActivated) signals.push(notActivated.context);

  if (signals.length === 0) return '';

  return `\n# SEMNAL INTERN MARA (nu afișa utilizatorului)\n${signals.join('\n')}`;
}
