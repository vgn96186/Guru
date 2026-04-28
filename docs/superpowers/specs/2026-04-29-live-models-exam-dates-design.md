# Live-First Model Catalogs + Exam Dates

## Context / Problem

Guru currently includes large provider model catalog arrays and hardcoded exam date defaults in `src/config/appConfig.ts`. Even though live model fetching exists for some providers, stale/deprecated models and stale exam “defaults” still leak into:

- UI model pickers (fallback lists show old ids)
- Routing defaults (fallbacks get used when live fetch fails)
- Forced model selections (single-provider forced mode can hard-fail if model id is removed)
- Exam date sync (sync only overwrites if the stored date matches a small “hardcoded defaults” whitelist)

Goal: prefer the most up-to-date model IDs and exam dates possible, while staying resilient offline and avoiding regressions on fresh installs.

Non-goals:

- Rebuilding provider routing architecture
- Cross-platform parity work (Android-only is fine)
- Adding complex remote-config infra if live provider APIs can be used directly

## Goals

- Models shown in Settings/chat are “as live as possible”.
- If a user-saved model becomes invalid, the app self-heals without breaking chat.
- Exam dates are auto-updated from online sources unless the user explicitly pins them.
- Cached “last known good” catalogs/dates survive offline and survive backups/restores.

## Proposed Approach (Recommended)

### 1) Model catalogs: live-first, cached, minimal static fallback

Single source of truth remains `src/services/ai/liveModelCatalog.ts`, but expanded:

- Add live listing where possible (DeepSeek, AgentRouter best-effort).
- Persist last-known-good catalog to local storage so offline fallbacks are not stale.
- Reduce reliance on large static arrays in `appConfig.ts` to small emergency lists only.

#### Providers

- Already live:
  - Groq (`/openai/v1/models`)
  - OpenRouter (`/api/v1/models`)
  - Gemini (SDK list → REST list fallback)
  - Cloudflare (`/ai/models/search`)
  - Kilo (`/api/gateway/models`)
  - ChatGPT (backend-api models)
  - GitHub Copilot (`/models`)

- To add live:
  - DeepSeek: `GET https://api.deepseek.com/models` (Bearer auth) (docs: https://api-docs.deepseek.com/api/list-models)
  - AgentRouter: best-effort `GET https://agentrouter.org/v1/models` (OpenAI-compatible convention). If unsupported, keep minimal fallback list.

- Remaining static-only (unless/until an endpoint exists):
  - GitLab Duo, Poe (keep fallback lists; treat them as “connected-only”)

#### Persistence

Persist `LiveGuruChatModelIds` plus metadata:

- `lastFetchedAt` (ms epoch)
- per-provider `source` (`live` | `fallback` | `cache`)
- per-provider `error` (string, optional)

Storage choice:

- Preferred: SQLite table (backup-safe)
- Alternate: AsyncStorage (fast, but metadata can drift across restores)

### 2) Self-healing forced model selection

Problem today: forced provider selection + stale model id can remove the fallback chain and cause chat failure.

Change:

- When a forced model request fails with a “model not found / invalid model” signal, retry once using:
  - best live model from that provider (first id in live list), else
  - `'auto'` routing

Additionally:

- If the app detects the user’s saved `guruChatDefaultModel` is invalid (not in available models) it should coerce to `'auto'` and persist that correction.

This matches “do what’s best” behavior: keep the app working and keep the UI consistent.

### 3) Exam dates: “source-aware” defaults

Problem today: exam sync overwrites only when profile date matches a hardcoded list (which grows over time).

Change exam date storage to include the reason/source:

- `inicetDateSource`: `'default' | 'synced' | 'user'`
- `neetDateSource`: `'default' | 'synced' | 'user'`

Rules:

- If source is `'user'`, never overwrite automatically.
- If source is `'default'` or `'synced'`, allow sync to overwrite when verified online sources provide a new date.
- Any manual Settings edit sets source to `'user'`.
- A “Reset to auto” action (optional) sets source back to `'default'`.

Persist exam sync meta to SQLite as well (lastCheckedAt, lastSuccessAt, sources, lastError) so it survives backup/restore.

## User Experience

- Settings model picker shows current live models (or last-known-good cache when offline).
- If the chosen model is removed upstream:
  - Chat continues by falling back.
  - The saved preference is corrected to `'auto'` so the UI doesn’t keep pointing at a dead id.
- Exam dates stay current without needing new app builds, unless the user explicitly pins custom dates.

## Data Model Changes

- Add table (preferred):
  - `provider_model_catalog`
    - `id` (pk, fixed = 1)
    - `catalog_json` (stringified `LiveGuruChatModelIds`)
    - `meta_json` (sources/errors/lastFetchedAt)
    - `updated_at` (ms epoch)

- Add columns to `user_profile`:
  - `inicet_date_source` text default `'default'`
  - `neet_date_source` text default `'default'`
  - Optional: `exam_sync_meta_json` text default `'{}'` (if not creating a separate table)

Migrations required.

## Implementation Notes / Integration Points

- Live catalog fetch flow stays in `useLiveGuruChatModels` but gains “load cached catalog immediately, then refresh live”.
- `appConfig.ts` keeps small emergency fallbacks only (so app can operate with zero connectivity and zero API keys).
- Exam sync logic changes in `examDateSyncService.ts` to use date-source columns instead of string whitelist comparisons.

## Error Handling

- Provider list endpoints can fail (401, 403, 429, 5xx, network). Cache usage must be safe and never block UI.
- Never log API keys.
- Avoid spamming list endpoints: add cooldown/TTL (e.g. 24h) and allow manual refresh from Settings.

## Testing

- Unit tests:
  - DeepSeek list parsing (`/models`)
  - AgentRouter list parsing (`/v1/models`) graceful fallback
  - “stale forced model” fallback retry logic
  - Exam date source rules (user-pinned vs default/synced)
- Logic coverage gate via `npm run test:unit:coverage:logic`.

## Open Questions

- Whether to store provider model catalogs in SQLite (recommended) vs AsyncStorage (lighter).
- Whether to add a small UI hint: “last verified/fetched at” for models and exam dates.
