# Critical issues analysis

Deep pass over the codebase for security, data integrity, crashes, and correctness. **Canonical context:** `CLAUDE.md` and `REPO_MAP.md`.

---

## Summary

| Severity | Count | Notes                                                                                                                                           |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | 1     | API key in client bundle — **accepted for personal use** (key in env, multi-device)                                                             |
| High     | 2     | ~~SQL interpolation~~ **fixed**; ~~offline queue dedupe~~ **fixed**                                                                             |
| Medium   | 3     | ~~Level race~~ **fixed**; ~~LIKE wildcards~~ **fixed**; ~~ErrorBoundary reset~~ **fixed**                                                       |
| Low      | 2     | ~~JSON key order~~ (same fix as dedupe); ~~redundant refreshProfile~~ (already skipped when loading); DB_EVENT logging **fixed** (**DEV** only) |

---

## Critical

### 1. Bundled Groq API key is shipped in client (EXPO*PUBLIC*)

**Where:** `src/config/appConfig.ts` — `BUNDLED_GROQ_KEY` from `process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY`.

**Issue:** In Expo, `EXPO_PUBLIC_*` vars are inlined into the JS bundle. If a real Groq key is set in `.env` or EAS env, it is visible to anyone who inspects the app binary or bundle.

**Mitigation:**

- Use `BUNDLED_GROQ_KEY` only for a **dev/free-tier** key or leave empty in production.
- Prefer user-supplied key in Settings (`profile.groqApiKey`); treat bundled key as fallback for first-run only.
- Document in README / CLAUDE: "Do not set a production Groq key in EXPO_PUBLIC_BUNDLED_GROQ_KEY."

---

## High

### 2. ~~SQL string interpolation in `markTopicsFromLecture`~~ **FIXED**

**Where:** `src/services/transcription/matching.ts`

**Fix applied:** Parent topic query now uses parameterized `IN (${placeholders})` with `ids` as params. LIKE pattern uses `escapeLikePattern()` and `ESCAPE '\\'` so `%`/`_` in topic names don’t over-match.

---

### 3. ~~Offline queue dedupe can miss duplicates~~ **FIXED**

**Where:** `src/services/offlineQueue.ts`

**Fix applied:** `canonicalPayloadString(payload)` (sorted keys) is used for both the duplicate check and the INSERT, so stored payload and dedupe comparison always match.

---

## Medium

### 4. ~~`addXp` level can be briefly wrong under concurrency~~ **FIXED**

**Where:** `src/db/queries/progress.ts`

**Fix applied:** In one transaction: (1) `UPDATE total_xp = total_xp + ?`, (2) `SELECT total_xp`, (3) compute `newLevel` from that value, (4) `UPDATE current_level = ?`. Level is always derived from the post-increment total.

---

### 5. ~~LIKE matching in lecture topic names can over-match~~ **FIXED**

**Where:** `src/services/transcription/matching.ts`

**Fix applied:** `escapeLikePattern(name)` escapes `%` and `_`; LIKE uses `ESCAPE '\\'` so those characters are literal in topic names.

---

### 6. ErrorBoundary “Reset View” leaves children in broken state

**Where:** `src/components/ErrorBoundary.tsx` — when `reloadAsync` is unavailable, retry sets `hasError: false` without remounting children.

**Issue:** Child tree may still be in a bad state (e.g. stale refs, inconsistent state). User sees UI again but actions can crash or behave incorrectly.

**Fix:** When not calling `reloadAsync`, remount children (e.g. use a `key` that changes on retry) or show a “Restart required” message instead of pretending the view was reset.

---

## Low

### 7. Redundant / concurrent `refreshProfile` calls

**Where:** `src/store/useAppStore.ts` — `refreshProfile` sets `loading: true` but does not skip when already loading; multiple callers (e.g. DB events, AppState, screens) can trigger overlapping refreshes.

**Issue:** Extra DB load and possible flicker; last write wins. No data corruption.

**Fix (optional):** Debounce or skip if `loading` is true (e.g. return early or queue a single refresh).

---

### 8. ~~`notifyDbUpdate` logs every event~~ **FIXED**

**Where:** `src/services/databaseEvents.ts`

**Fix applied:** Log is wrapped in `if (__DEV__)`.

---

## What was checked and is OK

- **Bootstrap order:** `App` waits for `runAppBootstrap()` (including `initDatabase()`) before setting `isReady`; no screen calls `getDb()` before init.
- **Migrations:** Versioned; duplicate column is handled; integrity repairs run after migrations; `migration_history` insert is best-effort.
- **Transactions:** `seedTopics`, `seedVaultTopics`, `updateTopicProgress`, `addXp`, `resetStudyProgress` use BEGIN/COMMIT/ROLLBACK; XP update uses atomic `total_xp = total_xp + ?`.
- **resetStudyProgress:** Invoked from Settings only after user confirmation (Alert).
- **API keys:** Not logged; `getApiKeys` uses profile or bundled key as designed. Only the bundling of `EXPO_PUBLIC_BUNDLED_GROQ_KEY` is critical (see above).
- **Lecture flow:** `markTopicsFromLecture` receives topic IDs from our DB; no user-controlled SQL. Parameterized queries used except for the `IN (${ids})` case.

---

## Recommended order of fixes

1. Document / restrict use of `EXPO_PUBLIC_BUNDLED_GROQ_KEY` (critical).
2. Parameterize `IN (...)` in `matching.ts` and canonicalize offline queue payload JSON (high).
3. ~~Level race, LIKE escaping, ErrorBoundary remount, event logging~~ — all fixed.
