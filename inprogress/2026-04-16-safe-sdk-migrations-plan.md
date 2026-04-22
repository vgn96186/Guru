# Safe SDK Migrations Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-rolled boilerplate with popular, well-maintained SDKs in areas where the migration is safe — no loss of custom functionality, no user-facing behavior change. This plan covers only the low-risk swaps identified in the SDK-audit discussion. High-risk items (full AI router replacement, TanStack Query for `aiCache`, MQTT replacement, Drizzle migration runner, `googleapis` for Drive) are **explicitly out of scope** and left custom.

**Architecture:** Five independent phases, each separately shippable and individually revertable. Phase 1 finishes the AI SDK v2 migration already in flight so subsequent phases can rely on v2. Phase 2 then deletes boilerplate that v2 makes redundant. Phases 3–5 are additive integrations (Sentry, Notifee, Deepgram prerecorded) that don't depend on each other.

**Tech Stack:** TypeScript, React Native / Expo SDK 54, Vercel AI SDK v2 (already hand-rolled under `src/services/ai/v2/`), `@sentry/react-native`, `@notifee/react-native` (optional), Deepgram Node SDK (prerecorded), Jest, Detox

---

## Pre-flight: Scope Boundaries

**In scope (SAFE migrations only):**

- Finish the partially-completed AI SDK v2 migration (builds on the existing `2026-04-15-ai-v2-migration-completion.md` plan).
- Delete `openaiSseStream.ts` and the `jsonRepair` wrapper once v2 covers their callers.
- Add Sentry for error reporting (replaces the 48-line `errorLoggingService.ts`).
- Optional: add Notifee for richer notification UI (expo-notifications stays as the base).
- Optional: add Deepgram prerecorded REST for cloud `.m4a` transcription; whisper.rn stays as the local/offline path.

**Explicitly out of scope (documented so future work doesn't re-open these):**

- ❌ TanStack Query for `aiCache.ts` — custom SQLite cache is correct for offline-first study use.
- ❌ MQTT → Ably/Supabase Realtime — self-hosted MQTT is privacy-preserving and already works.
- ❌ Drizzle migration runner — the hand-audited PRAGMA-versioned `migrations.ts` + `migration_history` audit table is domain-critical.
- ❌ `googleapis` Node SDK for Drive — RN bundling pain exceeds the 14 KB saved.
- ❌ Wholesale rip-and-replace of `llmRouting.ts` — OAuth/Copilot/Duo/Poe quirks and `providerHealth.ts` scoring have no SDK equivalent.

---

## File Map

### Phase 1 — Finish AI SDK v2 migration

Defers to the existing plan at `docs/superpowers/plans/2026-04-15-ai-v2-migration-completion.md`. Files it touches:

- Modified: `src/services/ai/llmRouting.ts`, `src/services/ai/generate.ts`, `src/services/ai/index.ts`, `src/screens/TranscriptVaultScreen.tsx`, `src/screens/NotesVaultScreen.tsx`, and three test files.

### Phase 2 — Delete SSE and jsonRepair boilerplate

- Deleted: `src/services/ai/openaiSseStream.ts`, `src/services/ai/openaiSseStream.unit.test.ts`
- Modified: any remaining callers of `readOpenAiCompatibleSse` / `consumeSseEventBlock` (grep first; should be zero after Phase 1).
- Modified: `src/services/ai/jsonRepair.ts` — collapse to a thin export of the `jsonrepair` library if no custom logic remains; otherwise leave untouched (schema-validated paths should route through AI SDK v2 `generateObject` with zod, which already performs repair internally).

### Phase 3 — Sentry integration

- New: `src/services/errorReporting.ts` (thin wrapper around Sentry with DSN gating from env).
- Modified: `src/services/errorLoggingService.ts` — keep the SQLite-backed `error_logs` table for offline capture, additionally forward to Sentry when online.
- Modified: `App.tsx` — wrap root with `Sentry.wrap(App)` and call `Sentry.init` at cold start.
- Modified: `app.config.js` — register `@sentry/react-native/expo` config plugin; add `SENTRY_DSN` / org / project env vars to `extra`.
- Modified: `scripts/generate-bundled-env.js` — add `SENTRY_DSN` to bundled env (empty string when unset so release builds don't leak).
- Modified: `package.json` — add `@sentry/react-native`.
- New: `src/services/errorReporting.unit.test.ts`.

### Phase 4 (optional) — Notifee for richer notification UI

- New: `src/services/richNotifications.ts` — Notifee wrapper for progress bars, media controls, and action buttons.
- Modified: call sites in `src/hooks/useAppBootstrap.ts`, `modules/app-launcher` JS layer (lecture face-tracking absence alerts), and any screen that currently uses `expo-notifications` scheduling where rich UI is desired.
- Modified: `package.json` — add `@notifee/react-native`.
- `expo-notifications` stays as the scheduling/permissions layer; Notifee is additive for display only.

### Phase 5 (optional) — Deepgram prerecorded for cloud `.m4a` path

- New: `src/services/transcription/deepgramPrerecorded.ts` — cloud prerecorded transcription via Deepgram Node SDK.
- Modified: `src/services/transcription/engines.ts` — add a `deepgram-prerecorded` engine alongside the existing engines; routing already chooses between local whisper.rn and cloud via `profile.useLocalWhisper`.
- Modified: `src/services/transcription/providerFallback.ts` — include Deepgram prerecorded in the cloud fallback chain ahead of whatever the current cloud default is.
- Modified: `package.json` — add `@deepgram/sdk`.
- New: `src/services/transcription/deepgramPrerecorded.unit.test.ts`.
- whisper.rn stays intact for local/offline (`useLocalWhisper = true`).

---

## Phase 1: Finish AI SDK v2 migration

**Rationale:** Phase 2 can't delete `openaiSseStream.ts` safely until every caller is off it. The existing plan already enumerates the remaining callers and the three llmRouting bug fixes that unblock them.

**Files:** see `docs/superpowers/plans/2026-04-15-ai-v2-migration-completion.md`.

### Step 1.1: Execute the existing AI v2 completion plan

- [ ] **Step 1.1.1** Follow `docs/superpowers/plans/2026-04-15-ai-v2-migration-completion.md` end to end. Do not deviate. That plan already has step-level checkboxes.
- [ ] **Step 1.1.2** After completion, run `npm run verify:ci` — must pass before proceeding to Phase 2.
- [ ] **Step 1.1.3** Move the completed AI v2 plan out of `docs/superpowers/plans/` into an archive location so it's clear the work is done.

---

## Phase 2: Delete SSE and jsonRepair boilerplate

**Rationale:** AI SDK v2 `streamText` and `streamObject` handle OpenAI-compatible SSE parsing and incremental JSON repair via zod internally. Once Phase 1 routes all callers through v2, the hand-rolled `openaiSseStream.ts` and any custom wrapper around `jsonrepair` become dead weight.

**Risk:** Low. These files are pure infrastructure with no custom business rules.

### Step 2.1: Confirm no callers remain

- [ ] **Step 2.1.1** Grep for `readOpenAiCompatibleSse` and `consumeSseEventBlock` across `src/`. Expected: zero hits (the only remaining user after Phase 1 should be the file itself + its test).
- [ ] **Step 2.1.2** If any non-test caller is found, halt Phase 2 and migrate that caller to AI SDK v2 `streamText` first. Do not force-delete.

### Step 2.2: Delete openaiSseStream files

- [ ] **Step 2.2.1** Delete `src/services/ai/openaiSseStream.ts`.
- [ ] **Step 2.2.2** Delete `src/services/ai/openaiSseStream.unit.test.ts`.
- [ ] **Step 2.2.3** Remove any barrel re-export from `src/services/ai/index.ts`.

### Step 2.3: Audit jsonRepair wrapper

- [ ] **Step 2.3.1** Read `src/services/ai/jsonRepair.ts`. Identify any logic beyond calling `jsonrepair` + parsing.
- [ ] **Step 2.3.2** If the wrapper only adds try/catch + zod validation that AI SDK v2 `generateObject` now covers at the v2 layer, grep for callers. Migrate each caller to `generateObject` directly, then delete the wrapper + its test.
- [ ] **Step 2.3.3** If the wrapper adds non-trivial logic (e.g., medical-domain-specific repair heuristics), leave it alone. Document why in a one-line comment at the top of the file.

### Step 2.4: Verify

- [ ] **Step 2.4.1** `npm run typecheck` — no unresolved imports.
- [ ] **Step 2.4.2** `npm run test:unit` — all tests pass.
- [ ] **Step 2.4.3** Boot the app on Genymotion, open Guru Chat, send a message, confirm streaming still works end-to-end.

---

## Phase 3: Sentry for error reporting

**Rationale:** `errorLoggingService.ts` writes errors to a local SQLite `error_logs` table. That's fine for offline capture but gives zero visibility into production failures. Sentry adds native crash reporting, source maps, release tracking, and breadcrumbs — all of which are painful to reimplement. The existing `error_logs` table stays as the offline buffer so we don't lose coverage when the user is mid-lecture without network.

**Risk:** Low. Additive. Disables cleanly by omitting `SENTRY_DSN`.

### Step 3.1: Install and configure Sentry

- [ ] **Step 3.1.1** `npm install @sentry/react-native`.
- [ ] **Step 3.1.2** Add the Expo config plugin entry to `app.config.js` under `plugins`: `['@sentry/react-native/expo', { organization: ..., project: ... }]`.
- [ ] **Step 3.1.3** Add `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` to `scripts/generate-bundled-env.js` and the generated bundled-env file. All three default to empty string so the release build continues to work without a DSN configured.
- [ ] **Step 3.1.4** Run `npx @sentry/wizard -i reactNative -p ios android` only if the wizard's outputs are checked in; otherwise configure manually (Android `android/app/build.gradle` sentry.gradle apply, iOS Podfile — but iOS is not a current target, so skip unless the user requests it).

### Step 3.2: Create a thin reporting wrapper

- [ ] **Step 3.2.1** Create `src/services/errorReporting.ts` with:
  - `initErrorReporting()` — called once from `App.tsx` boot, reads DSN from `Constants.expoConfig.extra.sentryDsn`, no-ops if empty.
  - `reportError(error: unknown, context?: Record<string, unknown>)` — calls `Sentry.captureException` and also writes to the existing `error_logs` table via `logErrorToDatabase`.
  - `setUserContext(userId: string)` — sets anonymized user id (never email) on Sentry scope.
  - All functions are safe to call before init (guarded by a boolean).
- [ ] **Step 3.2.2** Unit-test the wrapper with mocked Sentry — verify DSN gating and the dual-write behavior.

### Step 3.3: Wire into existing error paths

- [ ] **Step 3.3.1** In `App.tsx`, call `initErrorReporting()` inside `runAppBootstrap` and wrap the root component with `Sentry.wrap(App)`.
- [ ] **Step 3.3.2** Update `errorLoggingService.ts` — the existing `logErrorToDatabase` function stays. Add a single call to `reportError` alongside it from the top-level error boundary so SQLite + Sentry both receive the event. Do not replace `logErrorToDatabase` — the local buffer is the offline path.
- [ ] **Step 3.3.3** Find the app's root `ErrorBoundary` (or add one if missing) and route its `componentDidCatch` through `reportError`.

### Step 3.4: PII scrub

- [ ] **Step 3.4.1** Configure `Sentry.init` with `beforeSend` that strips any field named `email`, `apiKey`, `token`, `groqApiKey`, `openrouterKey`, `openrouterApiKey` recursively from the event. Medical content (transcripts, brain dumps) must also not be sent — allowlist only error message, stack, and release metadata.
- [ ] **Step 3.4.2** Add a unit test that feeds a synthetic event containing each banned key and asserts they are absent from the output.

### Step 3.5: Verify

- [ ] **Step 3.5.1** `npm run verify:ci` passes.
- [ ] **Step 3.5.2** Trigger a synthetic `throw new Error('sentry-smoke-test')` from a dev-only settings hook. Confirm it appears in the Sentry dashboard with stack + release.
- [ ] **Step 3.5.3** Build a release APK (`npm run android:apk:release:device`) with DSN empty. App must boot without errors or network attempts from Sentry.

---

## Phase 4 (optional): Notifee for richer notification UI

**Rationale:** `expo-notifications` handles scheduling and permissions well but produces plain text-only notifications. Notifee adds progress bars, media-style controls, big-picture style, and foreground-service notifications — useful for lecture recording progress, transcription progress, and the overlay absence alerts. Keep `expo-notifications` for scheduling; Notifee only renders richer UI when requested.

**Risk:** Low. Strictly additive. Skip entirely if the current notification UX is sufficient.

### Step 4.1: Install and wire

- [ ] **Step 4.1.1** `npm install @notifee/react-native`.
- [ ] **Step 4.1.2** Android manifest and gradle config via Notifee docs (no Expo config plugin required at the time of writing — verify current docs).
- [ ] **Step 4.1.3** Create `src/services/richNotifications.ts` with `showLectureProgress`, `showTranscriptionProgress`, `showAbsenceAlert` helpers. Each helper returns a notification id so it can be updated or cancelled.

### Step 4.2: Migrate selected call sites

- [ ] **Step 4.2.1** Identify every `Notifications.scheduleNotificationAsync` call in the codebase. Classify each as "scheduling" (keep expo-notifications) or "rich display" (move to Notifee).
- [ ] **Step 4.2.2** For rich-display call sites only, swap to the Notifee helper. Scheduling callers are unchanged.
- [ ] **Step 4.2.3** Face-tracking absence alert in `OverlayService.kt` currently fires after 15 s absent — that's already native. Do not move; Notifee is JS-only.

### Step 4.3: Verify

- [ ] **Step 4.3.1** Lecture recording notification shows a live progress bar and stop action.
- [ ] **Step 4.3.2** Permission flow still works (notifications permission is granted via expo-notifications, Notifee uses the same OS permission).
- [ ] **Step 4.3.3** `npm run verify:ci` passes.

---

## Phase 5 (optional): Deepgram prerecorded for cloud `.m4a` path

**Rationale:** Background-recorded lectures from the native `RecordingService` produce `.m4a` files that are currently transcribed by whisper.rn locally or (via `engines.ts`) via a cloud path. Deepgram's prerecorded REST API is faster, more accurate on medical terminology (with `keywords` and `topic` hints), and the Node SDK is well-maintained. whisper.rn remains as the offline / `useLocalWhisper = true` path.

**Risk:** Low. Added as one more engine behind the existing `providerFallback.ts`.

### Step 5.1: Install and implement

- [ ] **Step 5.1.1** `npm install @deepgram/sdk`.
- [ ] **Step 5.1.2** Create `src/services/transcription/deepgramPrerecorded.ts`:
  - Accepts `audioFilePath`, reads the file as a stream (via `expo-file-system`).
  - POSTs to Deepgram with `nova-2-medical` (or the current medical-tuned model) and `keywords` pulled from the syllabus topic list for the detected subject.
  - Returns the same shape as the existing whisper-rn transcript result so downstream `analyzeTranscript` sees no difference.
- [ ] **Step 5.1.3** Add the Deepgram API key to `profile.deepgramApiKey` — new nullable column via a migration (follow the existing versioned-migration pattern in `src/db/migrations.ts`; increment `PRAGMA user_version`). If the user has no key set, the engine is skipped by `providerFallback.ts`.

### Step 5.2: Wire into fallback chain

- [ ] **Step 5.2.1** Register the new engine in `src/services/transcription/engines.ts`.
- [ ] **Step 5.2.2** Insert it into the cloud fallback order in `src/services/transcription/providerFallback.ts` — ahead of whatever is currently the cloud default.
- [ ] **Step 5.2.3** Keep `profile.useLocalWhisper = true` short-circuiting to whisper.rn before any cloud engine is tried.

### Step 5.3: Verify

- [ ] **Step 5.3.1** Unit test `deepgramPrerecorded.ts` with a mocked fetch — verify the request shape includes `keywords` derived from the subject.
- [ ] **Step 5.3.2** Unit test `providerFallback.ts` updates — verify whisper.rn is still first when `useLocalWhisper` is true.
- [ ] **Step 5.3.3** E2E: record a short lecture, hit Mark as Studied, confirm transcript is produced with the topics field populated (same shape as before).
- [ ] **Step 5.3.4** `npm run verify:ci` passes.

---

## Testing Strategy

- Every phase ends with `npm run verify:ci` as the gate.
- Each phase has at least one end-to-end smoke test on Genymotion (AI v2 streaming in Phase 1–2, error capture in Phase 3, rich notification in Phase 4, transcript in Phase 5).
- No phase touches the database schema except Phase 5, which follows the existing versioned-migration pattern (no drizzle-kit).
- Unit tests live next to their source files per existing convention (`.unit.test.ts`).

## Rollback Plan

Each phase is individually revertable:

- **Phase 1:** revert the AI v2 completion commits; app returns to mixed v1/v2 state it's currently in.
- **Phase 2:** git revert the deletion commits; `openaiSseStream.ts` and tests return.
- **Phase 3:** remove `SENTRY_DSN` from env and the wrapper calls; `errorLoggingService.ts` SQLite path still works.
- **Phase 4:** remove Notifee calls; expo-notifications base remains.
- **Phase 5:** remove Deepgram engine from `providerFallback.ts`; whisper.rn path is unaffected.

## Priority Order

1. **Phase 1** — unblocks Phase 2 and reduces ongoing technical debt. Already partially done.
2. **Phase 3 (Sentry)** — highest user-facing value per hour spent. Production visibility.
3. **Phase 2** — pure cleanup, do after Phase 1 settles.
4. **Phase 5 (Deepgram)** — quality improvement on medical transcription accuracy. Only if current accuracy is a complaint.
5. **Phase 4 (Notifee)** — pure UX polish. Do last or skip.
