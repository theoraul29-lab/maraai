# Security — Honeypot + Tarpit + Auto-Blacklist

hellomara.net runs a three-layer defensive intrusion deterrence system.
It is **strictly passive/defensive**: it never counterattacks, never
fingerprints beyond IP + User-Agent + path, and never serves malicious or
deceptive downloadable content.

## Architecture

### 1. Honeypot routes (`server/security/honeypot.ts`)
Trap paths that no legitimate user ever requests (WordPress, PHPMyAdmin,
exposed config/credential files, shells, etc.). Any hit:
1. Logs to `honeypot_events` (IP, path, method, truncated UA — no bodies).
2. Upserts into `blacklisted_ips` using the escalation ladder.
3. Returns a tarpit response (see below).

**Honeypot form field**: a hidden `name="website"` input is available for
signup/contact endpoints. If non-empty on submit the request is silently
rejected (bot gets a fake success). Cap for form-triggered bans: 1h only.

### 2. Tarpit (`server/security/tarpit.ts`)
Streams 1 byte every 2–3 seconds for up to `SECURITY_TARPIT_MAX_SECONDS`
(default 20 s), then closes with HTTP 200 + empty body or 404.

**Self-DoS protection**: global in-process counter capped at
`SECURITY_TARPIT_MAX_CONCURRENT` (default 25). When the cap is full,
responds instantly with 404 instead of tarpitting.

### 3. Blacklist middleware (`server/security/blacklist-middleware.ts`)
Runs as one of the first middlewares after session/IP setup. Checks every
request against `blacklisted_ips` via an in-memory LRU cache (max 10k
entries, 60s TTL).

**Never blocked**: `/api/health`, `/api/health/db`, `/api/runtime`,
`/api/webhooks/stripe`, `/api/webhooks/resend`, IPs in `SECURITY_IP_ALLOWLIST`.

## Ban escalation ladder

| Offense | Default ban duration |
|---------|----------------------|
| 1st     | 1 hour               |
| 2nd     | 6 hours              |
| 3rd     | 24 hours             |
| 4th+    | 7 days               |

Configurable via `SECURITY_BAN_LADDER=1,6,24,168`.
Bans never auto-escalate to permanent — that requires admin action.

## GDPR compliance

- **Lawful basis**: Art. 6(1)(f) GDPR — legitimate interest, network and
  information security (Recital 49).
- **Data minimization**: IP, path, method, User-Agent (max 512 chars).
  No request bodies, cookies, auth tokens, or message content stored.
- **Retention**: `honeypot_events` are purged after 30 days automatically.
  Temporary bans expire per the ladder above.
- **Privacy policy**: `s9Title`/`s9Text` keys added to all 27 locales.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECURITY_HONEYPOT_ENABLED` | `true` | Master kill-switch |
| `SECURITY_TARPIT_MAX_CONCURRENT` | `25` | Max simultaneous tarpits |
| `SECURITY_TARPIT_MAX_SECONDS` | `20` | Max seconds per tarpit |
| `SECURITY_IP_ALLOWLIST` | _(empty)_ | IPs never banned (comma-separated) |
| `SECURITY_BAN_LADDER` | `1,6,24,168` | Ban ladder in hours |

## Admin API

All endpoints require admin auth (`requireAdmin` middleware).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/security/blacklist` | Paginated list (50/page, `?page=N`) |
| DELETE | `/api/admin/security/blacklist/:ip` | Manual unban |
| POST | `/api/admin/security/blacklist` | Manual ban `{ip, hours?, permanent?}` |
| GET | `/api/admin/security/honeypot-events?days=7` | Recent events |

## Database tables

- `blacklisted_ips` — migration `0025_security_honeypot.sql`
- `honeypot_events` — same migration
