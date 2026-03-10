# Guru — Master Implementation Plan

> Generated 10 March 2026 from the seven audit documents in `android/`.
> Every item was **verified against the codebase** before inclusion.

---

## Priority Legend

| Tag | Meaning | Timeframe |
|-----|---------|-----------|
| **P0** | Critical — data loss, crashes, or security holes | This week |
| **P1** | High — measurable perf / UX wins | Next 2 weeks |
| **P2** | Medium — quality-of-life, DX, maintainability | Next month |
| **P3** | Low — nice-to-have, future vision | Backlog |

---

## Phase 1 — Critical Foundations (P0)

### 1.1 Database Indexes  _(PERFORMANCE_AUDIT §1, FEATURE_ENHANCEMENT_ROADMAP §3)_

**Status:** Zero custom indexes exist in `src/db/schema.ts`.

**Problem:** Every spaced-repetition query (`getTopicsDueForReview`), AI cache lookup, and lecture-note fetch does a full table scan. As data grows past ~2 000 rows the Home screen will freeze on mount.

**Implementation:**

1. Open `src/db/schema.ts`.
2. Append the following after the last `CREATE TABLE` statement inside the `initializeDatabase()` / schema-execution block:

```sql
-- Spaced repetition lookups (HomeScreen agenda)
CREATE INDEX IF NOT EXISTS idx_tp_status_review
  ON topic_progress(status, next_review_date);

-- AI cache content fetches
CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup
  ON ai_cache(topic_id, content_type);

-- Lecture notes chronological listing
CREATE INDEX IF NOT EXISTS idx_lecture_notes_created
  ON lecture_notes(created_at DESC);

-- External app session "active" check (returned_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_ext_logs_active
  ON external_app_logs(returned_at);

-- Sessions by date for StatsScreen
CREATE INDEX IF NOT EXISTS idx_sessions_date
  ON sessions(created_at DESC);

-- Topic tree traversal (parent lookups)
CREATE INDEX IF NOT EXISTS idx_topics_parent
  ON topics(parent_topic_id);

-- Topic-to-subject join
CREATE INDEX IF NOT EXISTS idx_topics_subject
  ON topics(subject_id);
```

3. Verify with `EXPLAIN QUERY PLAN` in a debug build that the heavy queries now use covering indexes.

**Files touched:** `src/db/schema.ts`
**Risk:** None — `IF NOT EXISTS` is safe for existing installs.
**Acceptance:** Home screen mount time < 200 ms on SM-X820 with ≥5 000 topic_progress rows.

---

### 1.2 MQTT Payload Encryption  _(FEATURE_ENHANCEMENT_ROADMAP §2.2, FULL_SYSTEM_AUDIT §5)_

**Status:** `deviceSyncService.ts` sends plain-text JSON over a public MQTT broker (`broker.emqx.io`). Transport is WSS (TLS), but anyone with the sync code can read/spoof messages.

**Problem:** Study habits, doomscroll events, and break enforcements are visible to any subscriber on the same topic.

**Implementation:**

1. Install `react-native-quick-crypto` (or use the built-in `expo-crypto` for `getRandomValues`).
2. Create `src/services/syncCrypto.ts`:

```typescript
import { pbkdf2, aesGcmEncrypt, aesGcmDecrypt } from './cryptoHelpers';

const SALT = 'guru-sync-v1'; // static, non-secret
const ITERATIONS = 100_000;
const KEY_LEN = 256; // bits

export function deriveKey(syncCode: string): CryptoKey {
  return pbkdf2(syncCode, SALT, ITERATIONS, KEY_LEN);
}

export function encryptPayload(key: CryptoKey, json: object): string {
  const plaintext = JSON.stringify(json);
  const { ciphertext, iv, tag } = aesGcmEncrypt(key, plaintext);
  return JSON.stringify({ v: 1, iv, ct: ciphertext, tag }); // versioned envelope
}

export function decryptPayload(key: CryptoKey, envelope: string): object {
  const { iv, ct, tag } = JSON.parse(envelope);
  const plaintext = aesGcmDecrypt(key, iv, ct, tag);
  return JSON.parse(plaintext);
}
```

3. In `src/services/deviceSyncService.ts`:
   - On `connectToRoom(syncCode, cb)`: derive key once via `deriveKey(syncCode)`, store in module scope.
   - On publish: wrap every `JSON.stringify(msg)` ➜ `encryptPayload(key, msg)`.
   - On subscribe callback: wrap every `JSON.parse(raw)` ➜ `decryptPayload(key, raw)`.
   - Gracefully handle decryption failure (log + ignore — means foreign/stale message).

4. Bump the MQTT topic prefix to `guru/v2/` so older unencrypted clients don't collide.

**Files touched:** new `src/services/syncCrypto.ts`, edit `src/services/deviceSyncService.ts`, `package.json`
**Risk:** Medium — must test with both devices on the same sync code simultaneously.
**Acceptance:** Wireshark/MQTT Explorer shows opaque base64 payloads; study buddy features still work.

---

### 1.3 Lecture Return File Validation Window  _(LECTURE_PIPELINE_AUDIT §4, FULL_SYSTEM_AUDIT §2)_

**Status:** `checkForReturnedSession` in `HomeScreen.tsx` retries 3× with 200 ms delays (600 ms total). Long recordings may still be flushing from native cache.

**Problem:** Valid 1-hour lectures silently discarded → data loss.

**Implementation:**

1. In `HomeScreen.tsx`, locate the retry loop inside `checkForReturnedSession`.
2. Change from fixed 3×200 ms to exponential backoff polling up to 5 seconds:

```typescript
const MAX_RETRIES = 8;
const BASE_DELAY = 300; // ms

for (let i = 0; i < MAX_RETRIES; i++) {
  const exists = await FileSystem.getInfoAsync(recordingPath);
  if (exists.exists && exists.size > 1024) break; // valid file
  await new Promise(r => setTimeout(r, BASE_DELAY * Math.pow(1.5, i)));
}
```

3. If the file still doesn't exist after the loop, show a user-visible toast/alert: _"Recording file not ready — it may appear next time you open the app."_ Save the path to a `pending_recordings` key in AsyncStorage so it can be retried on next launch.

**Files touched:** `src/screens/HomeScreen.tsx`
**Risk:** Low — worst case is a slightly longer delay before the LectureReturnSheet appears.
**Acceptance:** A 60-minute recording that takes ~2 s to flush is correctly picked up.

---

### 1.4 Audio Chunking Memory Fix  _(LECTURE_PIPELINE_AUDIT §1)_

**Status:** `processLongRecording` in `lectureSessionMonitor.ts` loads entire 20 MB+ base64 audio into JS string memory, causing OOM on low-end devices.

**Problem:** UI freeze + OOM crash during post-lecture processing.

**Implementation:**

1. In `src/services/lectureSessionMonitor.ts`, replace the JS-side base64 decode/encode loop with `expo-file-system` streaming:

```typescript
import * as FileSystem from 'expo-file-system';

async function splitRecording(filePath: string, chunkSizeBytes: number): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(filePath);
  if (!info.exists) throw new Error('Recording file not found');

  const totalSize = info.size;
  const chunks: string[] = [];
  let offset = 0;

  while (offset < totalSize) {
    const length = Math.min(chunkSizeBytes, totalSize - offset);
    const chunkPath = `${FileSystem.cacheDirectory}chunk_${offset}.m4a`;
    // Use native file copy with range (or read base64 in small slices)
    const base64Chunk = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length,
    });
    await FileSystem.writeAsStringAsync(chunkPath, base64Chunk, {
      encoding: FileSystem.EncodingType.Base64,
    });
    chunks.push(chunkPath);
    offset += length;
  }
  return chunks;
}
```

2. Process each chunk file path individually through `transcribeWithGroq()` (which already accepts file paths).
3. Delete chunk temp files after transcription.

**Files touched:** `src/services/lectureSessionMonitor.ts`
**Risk:** Medium — must test with actual 20+ min recordings on a low-RAM device.
**Acceptance:** Peak JS heap during processing stays < 150 MB (profile with Hermes).

---

## Phase 2 — High-Impact Performance & UX (P1)

### 2.1 HomeScreen Mount Optimization  _(FULL_SYSTEM_AUDIT §2, UI_UX_AUDIT §4)_

**Status:** `HomeScreen` runs 5+ heavy sync SQLite queries sequentially in a single `useEffect`. Zero usage of `InteractionManager` anywhere in the codebase.

**Problem:** Visible UI stutter (~500 ms+) on every tab switch to Home.

**Implementation:**

1. Wrap the data-fetching `useEffect` body in `InteractionManager.runAfterInteractions()`:

```typescript
import { InteractionManager } from 'react-native';

useEffect(() => {
  const task = InteractionManager.runAfterInteractions(() => {
    // existing: markNemesisTopics, getWeakestTopics, getTopicsDueForReview, etc.
    loadHomeData();
  });
  return () => task.cancel();
}, []);
```

2. Show the existing loading skeleton/`LoadingOrb` until data arrives.
3. Yield between heavy queries to avoid a single long synchronous block:

```typescript
async function loadHomeData() {
  const agenda = getTodaysAgendaWithTimes();
  setAgenda(agenda);
  await yieldToUI(); // () => new Promise(r => setTimeout(r, 0))
  
  const weak = getWeakestTopics();
  setWeakTopics(weak);
  await yieldToUI();
  
  const due = getTopicsDueForReview();
  setDueTopics(due);
  // ...
}
```

**Files touched:** `src/screens/HomeScreen.tsx`
**Risk:** Low — purely additive; existing logic unchanged.
**Acceptance:** Tab-switch to Home renders shell in < 100 ms; data populates within 300 ms.

---

### 2.2 StatsScreen SQL Aggregation  _(PERFORMANCE_AUDIT §2, UI_UX_AUDIT §4)_

**Status:** `StatsScreen.tsx` calls `getAllTopicsWithProgress()` → loads 5 000+ rows into JS → `subjects.map(sub => allTopics.filter(...))` on the JS thread.

**Problem:** Screen freeze / crash on older devices; GC pressure.

**Implementation:**

1. Add a new query in `src/db/queries/topics.ts`:

```typescript
export function getSubjectBreakdown(): SubjectBreakdownRow[] {
  const db = getDb();
  return db.getAllSync<SubjectBreakdownRow>(`
    SELECT
      s.id,
      s.name,
      s.color_hex   AS colorHex,
      COUNT(t.id)   AS total,
      SUM(CASE WHEN p.status != 'unseen' THEN 1 ELSE 0 END) AS covered,
      SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) AS mastered,
      ROUND(AVG(CASE WHEN p.confidence > 0 THEN p.confidence ELSE NULL END), 1) AS avgConfidence
    FROM subjects s
    LEFT JOIN topics t ON s.id = t.subject_id
    LEFT JOIN topic_progress p ON t.id = p.topic_id
    GROUP BY s.id
    ORDER BY s.name
  `);
}
```

2. Replace the JS-side map/filter chain in `StatsScreen.tsx` `loadStats()` with a single call to `getSubjectBreakdown()`.
3. Similarly, add SQL aggregates for `getWeeklyXpSeries()` and `getStudyMinutesByDay()` to avoid pulling raw session rows.

**Files touched:** `src/db/queries/topics.ts`, `src/screens/StatsScreen.tsx`
**Risk:** Low — read-only queries; old code can be kept as fallback behind a flag.
**Acceptance:** StatsScreen loads in < 200 ms with 10 000 topic_progress rows.

---

### 2.3 LLM Context Release on Background  _(LECTURE_PIPELINE_AUDIT §3, PERFORMANCE_AUDIT §3)_

**Status:** `aiService.ts` calls `llamaContext.release()` only on completion/error inside generation functions. No AppState listener. The 200 MB+ context stays in RAM when app is backgrounded.

**Problem:** Android OOM-kills the app while in background; user returns to a cold restart.

**Implementation:**

1. In `src/services/aiService.ts`, add an AppState listener at module scope:

```typescript
import { AppState, AppStateStatus } from 'react-native';

let appStateSubscription: any;

function setupAppStateListener() {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', async (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      await releaseLlamaContext();
    }
  });
}

async function releaseLlamaContext() {
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (_) { /* already released */ }
    llamaContext = null;
  }
}

// Call during module init or first use
setupAppStateListener();
```

2. In each generation function, lazily re-initialize the context if it was released:

```typescript
if (!llamaContext && profile.useLocalModel && profile.localModelPath) {
  llamaContext = await initLlamaContext(profile.localModelPath);
}
```

3. Same pattern for Whisper context in `transcriptionService.ts` if `whisper.rn` is also holding RAM.

**Files touched:** `src/services/aiService.ts`, optionally `src/services/transcriptionService.ts`
**Risk:** Medium — must handle race conditions where a generation is in-flight while app backgrounds. Guard with a `contextInUse` semaphore.
**Acceptance:** After switching to another app for 10 s, `adb shell dumpsys meminfo <pid>` shows ≥200 MB freed.

---

### 2.4 Error Swallowing → User-Visible Feedback  _(FULL_SYSTEM_AUDIT §2, §4)_

**Status:** Multiple silent `catch` blocks that swallow errors: lecture return path, AI generation failures, session screen fallbacks.

**Problem:** Users experience "nothing happened" — lost lectures, missing flashcards, broken flows.

**Implementation:**

Create a lightweight toast utility (`src/components/Toast.tsx` or use `react-native-toast-message`):

| Location | Current Behavior | New Behavior |
|----------|-----------------|--------------|
| `HomeScreen` `checkForReturnedSession` catch | `console.warn` only | Toast: "Couldn't process your lecture recording. Tap to retry." + save to retry queue |
| `SessionScreen` `generateJSONWithRouting` catch | Raw error text in-place | Styled error card with "Retry" and "Study Without Notes" buttons |
| `ReviewScreen` `expo-speech` overlap | No handling | `Audio.setAudioModeAsync({ staysActiveInBackground: false })` + catch TTS errors |
| `StudyPlanScreen` mode change | Full re-render block | Show spinner overlay during recalc |

**Files touched:** new `src/components/Toast.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/SessionScreen.tsx`, `src/screens/ReviewScreen.tsx`, `src/screens/StudyPlanScreen.tsx`
**Risk:** Low — additive UI changes.
**Acceptance:** No user action silently fails; every error has a visible UI response.

---

### 2.5 Face Tracking Frame Throttle  _(LECTURE_PIPELINE_AUDIT §2)_

**Status:** `OverlayService.kt` processes every CameraX frame via ML Kit. Uses `STRATEGY_KEEP_ONLY_LATEST` (implicit backpressure) but no explicit throttle.

**Problem:** Battery drain during 2-hour lectures; device overheats.

**Implementation:**

1. In `OverlayService.kt`, add a timestamp-based frame skip inside the `ImageAnalysis.Analyzer`:

```kotlin
private var lastAnalysisTime = 0L
private val ANALYSIS_INTERVAL_MS = 2000L // 1 frame every 2 seconds

override fun analyze(imageProxy: ImageProxy) {
    val now = System.currentTimeMillis()
    if (now - lastAnalysisTime < ANALYSIS_INTERVAL_MS) {
        imageProxy.close()
        return
    }
    lastAnalysisTime = now
    // existing ML Kit face detection logic...
}
```

2. Add `setTargetResolution(Size(320, 240))` to the `ImageAnalysis.Builder()` — this is more than enough for face presence detection and drastically reduces GPU load.

3. Add a user-facing toggle in OverlayService to disable face tracking when battery is low (read `BatteryManager.EXTRA_LEVEL` and auto-disable below 20%).

**Files touched:** `modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt`
**Risk:** Low — face tracking is a secondary feature; degrading gracefully is fine.
**Acceptance:** Battery drain during 2-hour recording < 15% (vs current ~30%+).

---

## Phase 3 — Quality of Life & DX (P2)

### 3.1 Centralized Theme System  _(UI_UX_AUDIT §2)_

**Status:** Zero centralized theme. Colors like `#0F0F14`, `#6C63FF`, `#1A1A24` are hardcoded across every screen.

**Implementation:**

1. Create `src/constants/theme.ts`:

```typescript
export const theme = {
  colors: {
    background: '#0F0F14',
    surface: '#1A1A24',
    surfaceLight: '#252536',
    primary: '#6C63FF',
    primaryLight: '#8B83FF',
    accent: '#FF6B6B',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#EF4444',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0B0',
    textMuted: '#666680',
    border: '#2A2A3C',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  typography: {
    h1: { fontSize: 26, fontWeight: '900' as const },
    h2: { fontSize: 20, fontWeight: '800' as const },
    h3: { fontSize: 16, fontWeight: '700' as const },
    body: { fontSize: 14, fontWeight: '400' as const },
    caption: { fontSize: 12, fontWeight: '400' as const },
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
  },
} as const;
```

2. Migrate screens incrementally (one per PR):
   - Start with `HomeScreen.tsx` and `SettingsScreen.tsx` (highest-traffic screens).
   - Find/replace hardcoded hex values → `theme.colors.*`.
   - Replace magic padding/margin numbers → `theme.spacing.*`.

3. Wire up `useResponsive` scaling:
   - In each migrated screen, import `{ useResponsive }` and wrap font sizes:
     ```typescript
     const { f } = useResponsive();
     // In dynamic styles:
     title: { fontSize: f(theme.typography.h1.fontSize), ... }
     ```

**Files touched:** new `src/constants/theme.ts`, then incremental edits to every screen
**Migration order:** HomeScreen → SettingsScreen → StatsScreen → SessionScreen → SyllabusScreen → remaining screens
**Risk:** Low — purely cosmetic refactor; no logic changes.
**Acceptance:** `grep -r '#0F0F14\|#6C63FF\|#1A1A24' src/screens/` returns zero hits after full migration.

---

### 3.2 Accessibility Pass  _(UI_UX_AUDIT §1)_

**Status:** Zero `accessibilityRole` or `accessibilityLabel` usage in `HomeScreen.tsx` or virtually any screen.

**Implementation:**

1. **Audit scope:** Every `TouchableOpacity`, `Pressable`, and custom button component across `src/screens/` and `src/components/`.

2. **Standard pattern:**
```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Start study session"
  accessibilityHint="Opens the session planning screen"
  {...otherProps}
>
```

3. **Priority screens** (by user traffic):
   - `HomeScreen.tsx` — ~15 interactive elements
   - `SessionScreen.tsx` — content type buttons, timer controls
   - `SyllabusScreen.tsx` — topic list items, subject cards
   - `SettingsScreen.tsx` — toggles, API key inputs
   - `CheckInScreen.tsx` — mood buttons, time options (partially done per audit, needs `accessibilityState`)

4. Add `accessibilityState={{ selected }}` to all toggle/radio buttons (mood selector, time selector, plan mode).

5. Test with TalkBack on Android device.

**Files touched:** All screen files in `src/screens/`, all interactive components in `src/components/`
**Risk:** None — purely additive props.
**Acceptance:** TalkBack can navigate and announce every interactive element on the 5 priority screens.

---

### 3.3 ESLint + Prettier + Pre-commit Hooks  _(DX_AUDIT §4)_

**Implementation:**

1. Install tooling:
```bash
npx expo install -- --save-dev eslint@^8 eslint-config-expo prettier husky lint-staged
```

2. Create config files:

**`.eslintrc.js`:**
```javascript
module.exports = {
  extends: ['expo', 'prettier'],
  rules: {
    'no-unused-vars': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
```

**`.prettierrc`:**
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

3. Add to `package.json`:
```json
{
  "scripts": {
    "lint": "eslint src/ --ext .ts,.tsx",
    "format": "prettier --write 'src/**/*.{ts,tsx}'"
  },
  "lint-staged": {
    "src/**/*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

4. Initialize Husky:
```bash
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

5. Run initial format pass: `npx prettier --write 'src/**/*.{ts,tsx}'` (one big commit).

**Files touched:** new `.eslintrc.js`, `.prettierrc`, `.husky/pre-commit`; edit `package.json`
**Risk:** Low — formatting-only initial commit; lint rules are warnings.
**Acceptance:** `npm run lint` exits 0; pre-commit hook runs on commit.

---

### 3.4 Unit Test Foundation  _(TESTING_STRATEGY §2)_

**Status:** Zero unit tests. All 13 test files are E2E/Detox only.

**Implementation:**

1. **Setup Jest for unit tests** (separate from Detox):

Create `jest.config.unit.js`:
```javascript
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*)',
  ],
  setupFiles: ['./jest.setup.unit.js'],
};
```

Create `jest.setup.unit.js`:
```javascript
// Mock expo-sqlite with in-memory DB
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => {
    const Database = require('better-sqlite3');
    return new Database(':memory:');
  },
}));
```

2. **Add `test:unit` script** to `package.json`:
```json
"test:unit": "jest --config jest.config.unit.js"
```

3. **Write the 5 critical test suites** (in priority order):

| # | Test File | What It Tests | Key Assertions |
|---|-----------|---------------|----------------|
| 1 | `__tests__/services/fsrsService.test.ts` | FSRS scheduling math | Next review date > now for Easy; interval doubles on Good; Again resets |
| 2 | `__tests__/db/queries/progress.test.ts` | `addXp`, `checkinToday`, streak logic | XP increments, level-up boundary, streak reset on skip |
| 3 | `__tests__/services/aiService.test.ts` | JSON repair pipeline | Broken JSON → valid parse; truncated JSON → repaired; Zod validation fallback |
| 4 | `__tests__/services/studyPlanner.test.ts` | Plan generation | Deterministic plan for mock data; respects available minutes; no impossible days |
| 5 | `__tests__/services/transcriptionService.test.ts` | `markTopicsFromLecture` matching | Exact match, LIKE match, reverse contains, cross-subject fallback all work |

4. **Example test (fsrsService):**

```typescript
// __tests__/services/fsrsService.test.ts
import { updateTopicFsrs } from '../../src/services/fsrsService';

describe('FSRS Service', () => {
  const baseProgress = {
    timesStudied: 0,
    status: 'unseen' as const,
    confidence: 0,
    fsrsStability: null,
    fsrsDifficulty: null,
    lastReviewedAt: null,
    nextReviewDate: null,
  };

  it('schedules next review in the future for Easy rating', () => {
    const result = updateTopicFsrs(baseProgress, 3);
    expect(result.nextReviewDate).toBeGreaterThan(Date.now());
    expect(result.status).toBe('reviewed');
  });

  it('schedules shorter interval for Again rating', () => {
    const easy = updateTopicFsrs(baseProgress, 3);
    const again = updateTopicFsrs(baseProgress, 0);
    expect(again.nextReviewDate).toBeLessThan(easy.nextReviewDate);
  });

  it('increases stability on successive Good ratings', () => {
    const first = updateTopicFsrs(baseProgress, 2);
    const second = updateTopicFsrs(first, 2);
    expect(second.fsrsStability).toBeGreaterThan(first.fsrsStability);
  });
});
```

**Files touched:** new `jest.config.unit.js`, `jest.setup.unit.js`, `__tests__/` directory tree, edit `package.json`
**Risk:** Low — isolated test infra; doesn't affect production code.
**Acceptance:** `npm run test:unit` passes all 5 suites; can run in < 10 s.

---

### 3.5 Native Module Documentation  _(DX_AUDIT §2)_

**Status:** `modules/app-launcher/index.ts` exports are undocumented — a React developer must read Kotlin to understand parameters.

**Implementation:**

Add comprehensive JSDoc to every export in `modules/app-launcher/index.ts`:

```typescript
/**
 * Launch an external app by Android package name.
 * @param packageName - e.g. "com.marrowmed.marrow"
 * @throws If the app is not installed or the intent fails.
 */
export function launchApp(packageName: string): void;

/**
 * Start recording audio from the target app (internal audio via MediaProjection on Android 10+,
 * falls back to microphone).
 * @param targetPackage - Package name of the app to capture audio from.
 *   Used for audio playback UID filtering on Android 10+.
 * @returns void — call stopRecording() to get the file path.
 * @requires requestMediaProjection() must have been called and granted first.
 */
export function startRecording(targetPackage: string): void;

/**
 * Stop the active recording and flush the audio buffer.
 * @returns Absolute path to the .m4a recording file in app's internal storage.
 * @note File may take 1–3 seconds to finalize for long recordings (60+ min).
 */
export function stopRecording(): string;

// ... etc for all exports
```

**Files touched:** `modules/app-launcher/index.ts`
**Risk:** None.
**Acceptance:** Every export has a JSDoc block visible in IDE hover tooltips.

---

### 3.6 Settings Screen Refactor  _(FULL_SYSTEM_AUDIT §5)_

**Status:** `SettingsScreen.tsx` is a single enormous scrollable list. Users must scroll significantly to find "Clear Cache" or "Backup".

**Implementation:**

1. Create a `SettingsStack` navigator inside `SettingsTab`:

```
SettingsMain (list of sections as tappable rows)
├── SettingsAIModels    (local model paths, API keys, routing prefs)
├── SettingsDataBackup  (backup, restore, clear cache, export)
├── SettingsStudyPrefs  (exam date, study mode, break intervals)
├── SettingsDeviceSync  (existing DeviceLinkScreen)
└── SettingsAbout       (version, credits, data safety)
```

2. `SettingsMain` renders a flat list of category cards with icons — single tap navigates to sub-screen.
3. Each sub-screen extracts its section from the current monolithic `SettingsScreen.tsx`.

**Files touched:** new `src/screens/settings/` directory with 5 sub-screens; refactor `src/screens/SettingsScreen.tsx`; edit `src/navigation/TabNavigator.tsx`
**Risk:** Medium — navigation changes; must update all `navigation.navigate('Settings')` deep links.
**Acceptance:** Settings is navigable in ≤ 2 taps to any setting; no single screen > 300 lines.

---

## Phase 4 — Architectural Improvements (P2–P3)

### 4.1 Offline AI Request Queue  _(FEATURE_ENHANCEMENT_ROADMAP §2.1)_

**Status:** No offline queue exists. Network failure = lost request.

**Implementation:**

1. Add table to `src/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS offline_ai_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type TEXT NOT NULL,  -- 'transcribe' | 'generate_json' | 'generate_text'
  payload TEXT NOT NULL,       -- JSON blob of function args
  status TEXT DEFAULT 'pending', -- 'pending' | 'processing' | 'failed'
  attempts INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  error_message TEXT
);
```

2. Create `src/services/offlineQueue.ts`:
   - `enqueueRequest(type, payload)` — insert into queue.
   - `processQueue()` — pop pending items, attempt execution, mark success or increment attempts.
   - `MAX_ATTEMPTS = 5`.

3. In `aiService.ts`, wrap `fetchContent` and cloud routing calls:
```typescript
try {
  return await generateJSONWithRouting(prompt, schema);
} catch (e) {
  if (isNetworkError(e)) {
    enqueueRequest('generate_json', { prompt, schemaName });
    showToast('Saved for later — will retry when online');
    return null;
  }
  throw e;
}
```

4. Register an `AppState` listener that calls `processQueue()` when app foregrounds.
5. Optionally register with `expo-background-fetch` for periodic retry (every 15 min).

**Files touched:** edit `src/db/schema.ts`, new `src/services/offlineQueue.ts`, edit `src/services/aiService.ts`, edit `src/services/transcriptionService.ts`
**Risk:** Medium — must avoid duplicate processing; use optimistic locking (`status = 'processing'` before attempt).
**Acceptance:** Airplane mode → request content → go online → content appears within 60 s.

---

### 4.2 Study Planner SQL Optimization  _(FULL_SYSTEM_AUDIT §3, PERFORMANCE_AUDIT §2)_

**Status:** `generateStudyPlan` in `studyPlanner.ts` calls `getAllTopicsWithProgress()` and does multiple O(N) JS iterations.

**Implementation:**

1. Add bucketed query in `src/db/queries/topics.ts`:

```typescript
export function getTopicBuckets(): { due: Topic[]; weak: Topic[]; remaining: Topic[] } {
  const db = getDb();
  const due = db.getAllSync(`
    SELECT t.*, p.*, s.name as subject_name
    FROM topics t
    JOIN topic_progress p ON t.id = p.topic_id
    JOIN subjects s ON t.subject_id = s.id
    WHERE p.next_review_date IS NOT NULL AND p.next_review_date <= ?
    ORDER BY p.next_review_date ASC
  `, [Date.now()]);

  const weak = db.getAllSync(`
    SELECT t.*, p.*, s.name as subject_name
    FROM topics t
    JOIN topic_progress p ON t.id = p.topic_id
    JOIN subjects s ON t.subject_id = s.id
    WHERE p.confidence <= 1 AND p.status != 'unseen'
    ORDER BY p.confidence ASC, t.inicet_priority DESC
  `);

  const remaining = db.getAllSync(`
    SELECT t.*, p.*, s.name as subject_name
    FROM topics t
    JOIN topic_progress p ON t.id = p.topic_id
    JOIN subjects s ON t.subject_id = s.id
    WHERE p.status = 'unseen'
    ORDER BY t.inicet_priority DESC
  `);

  return { due, weak, remaining };
}
```

2. Refactor `generateStudyPlan` to use `getTopicBuckets()` instead of filtering in JS.
3. Add a spinner/loading overlay to `StudyPlanScreen` during calculation (currently freezes without feedback).

**Files touched:** `src/db/queries/topics.ts`, `src/services/studyPlanner.ts`, `src/screens/StudyPlanScreen.tsx`
**Risk:** Medium — plan algorithm is core; must ensure identical output.
**Acceptance:** Plan generation < 100 ms for 5 000+ topics.

---

### 4.3 CI/CD Pipeline  _(TESTING_STRATEGY §3)_

**Status:** No CI/CD configuration exists whatsoever.

**Implementation:**

1. Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint

  unit-tests:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  build-android:
    runs-on: ubuntu-latest
    needs: unit-tests
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ hashFiles('android/gradle/wrapper/gradle-wrapper.properties') }}
      - run: cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
        env:
          NODE_ENV: development
```

2. Add branch protection rules on `main`: require `lint-and-typecheck` + `unit-tests` to pass.

**Files touched:** new `.github/workflows/ci.yml`
**Risk:** None — purely additive; doesn't affect local development.
**Acceptance:** PR to `main` shows green check marks for lint + unit tests.

---

### 4.4 CheckIn Screen Flash Fix  _(FULL_SYSTEM_AUDIT §1)_

**Status:** `RootNavigator` uses async `useEffect` to determine if check-in should auto-skip. The `CheckInScreen` briefly flashes before redirecting.

**Implementation:**

1. Compute the auto-skip state **synchronously** before rendering the navigator:

```typescript
function RootNavigator() {
  const shouldSkipCheckIn = useMemo(() => {
    const db = getDb();
    const today = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM daily_log WHERE date = date('now')`
    );
    if (today?.count > 0) return true;
    
    const quickStarts = db.getFirstSync<{ count: number }>(
      `SELECT quick_start_streak FROM user_profile WHERE id = 1`
    );
    return (quickStarts?.count ?? 0) >= 3;
  }, []);

  return (
    <Stack.Navigator initialRouteName={shouldSkipCheckIn ? 'Tabs' : 'CheckIn'}>
      {/* ... */}
    </Stack.Navigator>
  );
}
```

2. Remove the async `useEffect` that was previously doing this check after mount.

**Files touched:** `src/navigation/RootNavigator.tsx`
**Risk:** Low — sync SQLite is already the pattern used throughout.
**Acceptance:** Zero visual flash of CheckIn screen when auto-skip is active.

---

## Phase 5 — Aspirational / Future (P3)

### 5.1 Granular Study Analytics with Charts  _(FEATURE_ENHANCEMENT_ROADMAP §1)_

- Add "Weekly XP Trend" line chart and "Subject Weakness Radar" to `StatsScreen` using already-installed `react-native-chart-kit`.
- Requires the SQL aggregation queries from §2.2 above.
- Design: dark-themed charts matching `theme.colors.background` / `theme.colors.primary`.

### 5.2 Session & Note CRUD Completion  _(FEATURE_ENHANCEMENT_ROADMAP §2)_

- Add edit/delete actions to `NotesHubScreen` and `NotesSearchScreen`.
- Add `SessionHistoryScreen` with swipe-to-delete on session entries.
- Wire up to existing DB delete queries (or add `deleteSession(id)` / `deleteLectureNote(id)`).

### 5.3 Collaborative Study Mode  _(FEATURE_ENHANCEMENT_ROADMAP §3.1)_

- Extend MQTT sync to support multiple friends' status topics.
- New `friends` table; subscribe to `guru/v2/<friendCode>/status`.
- "Focus Ping" push notification via `expo-notifications`.
- **Prerequisite:** §1.2 (MQTT encryption) must be done first.

### 5.4 AI-Curated Grand Mock Exams  _(FEATURE_ENHANCEMENT_ROADMAP §3.2)_

- Weighted 200-question exam generator: 60% high-yield unseen, 20% FSRS due, 20% weak.
- Batch-queue missing questions to local model overnight via `expo-task-manager`.
- Full exam UI with timer, question navigator, review mode.

### 5.5 Background Transcription Worker  _(PERFORMANCE_AUDIT §4)_

- Save recording file paths to a job queue table on completion.
- Use `expo-background-fetch` + `react-native-background-actions` to process transcription without blocking UI.
- **Prerequisite:** §1.4 (memory fix) must be done first.

### 5.6 LockdownScreen Emergency Exit  _(FULL_SYSTEM_AUDIT §6)_

- Add a hidden 10-second long-press escape hatch to `LockdownScreen`.
- User must type a 6-word phrase confirming they want to quit.
- Logs the escape to `sessions` as an "early exit" with XP penalty.

---

## Implementation Order (Dependency Graph)

```
Week 1 (P0):
  1.1 DB Indexes ──────────────────────┐
  1.3 Lecture File Validation           │
  1.4 Audio Chunking Memory Fix        │
                                        │
Week 2 (P0 + P1 start):               │
  1.2 MQTT Encryption                   │
  2.1 HomeScreen Mount Opt ◄────────────┘ (benefits from indexes)
  2.4 Error Feedback (Toast)

Week 3 (P1):
  2.2 StatsScreen SQL ◄──────────────── (depends on indexes)
  2.3 LLM Context Release
  2.5 Face Tracking Throttle

Week 4–5 (P2):
  3.1 Theme System
  3.3 ESLint + Prettier
  3.4 Unit Test Foundation
  3.5 Native Module Docs

Week 5–6 (P2):
  3.2 Accessibility Pass ◄────────────── (easier after theme system)
  3.6 Settings Refactor
  4.4 CheckIn Flash Fix

Week 7–8 (P2–P3):
  4.1 Offline AI Queue
  4.2 Planner SQL Optimization
  4.3 CI/CD Pipeline ◄────────────────── (needs unit tests from 3.4)

Backlog (P3):
  5.1 Charts
  5.2 CRUD Completion
  5.3 Collaborative Study ◄───────────── (needs 1.2 MQTT encryption)
  5.4 Grand Mock Exams
  5.5 Background Transcription ◄──────── (needs 1.4 memory fix)
  5.6 Lockdown Escape
```

---

## Appendix: Quick Reference of Factual Corrections

| Audit Claim | Actual State |
|-------------|-------------|
| UI_UX_AUDIT says "Expo SDK 54" | App uses **Expo SDK 52** (`app.json`) |
| DX_AUDIT mentions Docker | Not applicable — local-first mobile app |
| TESTING_STRATEGY mentions `npm run test:unit` | Script does **not** yet exist; must be created |

---

_This plan is a living document. Update task statuses as work progresses._
