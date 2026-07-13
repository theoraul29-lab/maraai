# Pre-generated mission translations

Each `<lang>.json` file in this directory is a **committed translation bundle**
for the mission catalogue authored in Romanian at `../missions.json`.

These bundles are seeded into the `mission_translations` table at server
startup (see `../../seed.ts` → `seedMissionTranslations()`), so missions render
in the user's chosen language **without any live LLM call at runtime** —
deterministic, zero latency, zero per-request cost.

## Why bundles instead of live translation

The runtime `translateMissions()` in `../../engine.ts` calls the LLM on demand
and caches the result. If no LLM provider is configured (or it errors/times
out), it silently falls back to the original Romanian — which is why missions
could appear untranslated even after the user picked another language. Shipping
the translations as committed data removes that dependency for the static
catalogue. The runtime LLM path remains only as a fallback for AI-generated,
per-user personalized missions (which cannot be pre-translated).

## How to (re)generate

Run the generator with a valid `ANTHROPIC_API_KEY`:

```bash
# All languages (skips bundles already up to date):
ANTHROPIC_API_KEY=sk-ant-... node scripts/translate-missions.mjs

# Only specific languages:
ANTHROPIC_API_KEY=sk-ant-... node scripts/translate-missions.mjs de es fr

# Force re-translate everything (ignore hash freshness):
ANTHROPIC_API_KEY=sk-ant-... node scripts/translate-missions.mjs --force
```

Then commit the resulting `<lang>.json` files.

## Staleness / editing

Every bundle entry stores a `source_hash` derived from the Romanian source
(identical to `missionContentHash()` in `../../content.ts`). If you edit a
mission's text in `missions.json`, its hash changes and the matching bundle
entry becomes **stale**: the seed skips it (so users never see a translation
that no longer matches the source), and the runtime LLM fallback regenerates it
if a provider is available. Re-run the generator and re-commit to refresh.

Human-reviewed rows in the DB (`reviewed = 1`) are never overwritten by either
the bundle seed or the machine LLM path.

## Format

```jsonc
{
  "lang": "de",
  "lang_name": "German",
  "generated_at": "2026-...T...Z",
  "model": "claude-sonnet-4-6",
  "missions": {
    "disc-001": {
      "title": "...",
      "description": "...",
      "proof_prompt": "...",
      "steps": ["...", "..."],
      "reflection": "..." ,
      "source_hash": "abc123..."
    }
  }
}
```
