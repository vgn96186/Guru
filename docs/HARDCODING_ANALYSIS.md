# Deep Analysis: Hardcodings and Better Implementations

Analysis of the codebase for hardcoded values that should be centralized, config-driven, or derived from existing constants. Reference: `src/config/appConfig.ts`, `src/constants/theme.ts`, `src/constants/gamification.ts`.

---

## 1. Time and Duration Constants

### 1.1 Problem

Millisecond literals and repeated time math appear in many files:

| Literal / Pattern                                       | Occurrences | Files (examples)                                                                                                                                                                        |
| ------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `86400000` (ms per day)                                 | 10+         | progress.ts, TopicDetailScreen, StudyPlanScreen, sessionPlanner, studyPlanner, CheckInScreen, NotesHubScreen, database.ts, notificationService                                          |
| `1000` (1 second)                                       | 20+         | SessionScreen, LockdownScreen, SleepModeScreen, LectureModeScreen, BedLockScreen, MockTestScreen, PunishmentMode, DoomscrollInterceptor, offlineQueue, VisualTimer, BreakEnforcerScreen |
| `5 * 60 * 1000`, `60 * 1000`, `7 * 24 * 60 * 60 * 1000` | several     | PunishmentMode, offlineQueue, LectureModeScreen                                                                                                                                         |
| `4 * 60 * 60 * 1000` (4 hours)                          | 1           | LectureModeScreen (state hydration TTL)                                                                                                                                                 |
| `48 * 60 * 60 * 1000` (2 days)                          | 1           | progress.ts                                                                                                                                                                             |
| `10 * 60 * 1000` (10 min)                               | 1           | PunishmentMode (guilt screen delay)                                                                                                                                                     |

### 1.2 Recommendation

Add **`src/constants/time.ts`** (or extend `appConfig`):

```ts
/** Milliseconds per second / minute / hour / day. Use for clarity and single source of truth. */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Common intervals used across the app. */
export const INTERVALS = {
  ONE_SECOND: MS_PER_SECOND,
  ONE_MINUTE: MS_PER_MINUTE,
  FIVE_MINUTES: 5 * MS_PER_MINUTE,
  TEN_MINUTES: 10 * MS_PER_MINUTE,
  FOUR_HOURS: 4 * MS_PER_HOUR,
  TWO_DAYS: 2 * MS_PER_DAY,
  SEVEN_DAYS: 7 * MS_PER_DAY,
} as const;
```

Then replace raw literals with these constants (e.g. `MS_PER_DAY` instead of `86400000`, `INTERVALS.FIVE_MINUTES` instead of `5 * 60 * 1000`). Date-diff logic can stay inline but use the named constants.

---

## 2. Content Type Labels (Duplication)

### 2.1 Problem

Two separate maps define the same concept with slight wording differences:

- **SessionScreen.tsx** (lines 715–723): `CONTENT_LABELS` — "Teach", "Hunt", "Case"
- **FlaggedReviewScreen.tsx** (lines 13–21): `CONTENT_TYPE_LABELS` — "Teach Back", "Error Hunt", "Detective"

ContentType is defined in types/schemas; the display labels should be in one place.

### 2.2 Recommendation

Add **`src/constants/contentTypes.ts`** (or add to an existing constants file):

```ts
import type { ContentType } from '../types';

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  keypoints: 'Key Points',
  quiz: 'Quiz',
  story: 'Story',
  mnemonic: 'Mnemonic',
  teach_back: 'Teach Back',
  error_hunt: 'Error Hunt',
  detective: 'Detective',
  manual: 'Manual',
};
```

- SessionScreen: remove local `CONTENT_LABELS`, import `CONTENT_TYPE_LABELS`, and use for tabs (optionally shorten "Teach Back" → "Teach" in UI only via a helper if desired).
- FlaggedReviewScreen: remove local `CONTENT_TYPE_LABELS`, import from constants.

---

## 3. Confidence Level Labels

### 3.1 Problem

Confidence 1/2/3 is labeled in multiple places:

- **TranscriptHistoryScreen.tsx**: `CONFIDENCE_LABELS`: 1 → 'Introduced', 2 → 'Understood', 3 → 'Can explain'
- **LectureReturnSheet.tsx**: Same three levels with emoji variants ('🌱 Introduced', '🌿 Understood', '🌳 Can explain') and override copy

DB and AI use 1–3; UI should use one canonical map.

### 3.2 Recommendation

Add to **`src/constants/gamification.ts`** (or a small **`confidence.ts`**):

```ts
export const CONFIDENCE_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Introduced',
  2: 'Understood',
  3: 'Can explain',
};

export const CONFIDENCE_LABELS_WITH_EMOJI: Record<1 | 2 | 3, string> = {
  1: '🌱 Introduced',
  2: '🌿 Understood',
  3: '🌳 Can explain',
};
```

- TranscriptHistoryScreen: import `CONFIDENCE_LABELS` and use for badge.
- LectureReturnSheet: import both; use emoji version in selector, plain in override note.

---

## 4. Default Profile / Study Defaults

### 4.1 Problem

Default values for profile-derived settings are repeated as magic numbers:

| Meaning                          | Current usage                                                                                     | Suggested constant                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Default daily goal (minutes)     | `profile.dailyGoalMinutes \|\| 120` (HomeScreen, StudyPlanScreen, PunishmentMode, SettingsScreen) | e.g. `appConfig.DEFAULT_DAILY_GOAL_MINUTES` or in schema default           |
| Default session length (minutes) | `profile?.preferredSessionLength ?? 45` (SessionScreen)                                           | `DEFAULT_SESSION_LENGTH_MINUTES`                                           |
| Default break duration (minutes) | `profile?.breakDurationMinutes ?? 5` (SessionScreen, LectureModeScreen, SettingsScreen)           | `DEFAULT_BREAK_DURATION_MINUTES`                                           |
| Streak minimum minutes           | `mins >= 20`, `durationMin >= 20` (ManualLogScreen, LectureScreen)                                | Already in gamification: **`STREAK_MIN_MINUTES`** — use it instead of `20` |

### 4.2 Recommendation

- **Use existing:** Replace every `mins >= 20` / `durationMin >= 20` for streak with `STREAK_MIN_MINUTES` from `constants/gamification.ts`.
- **Extend appConfig (or schema default):** Add `DEFAULT_DAILY_GOAL_MINUTES = 120`, `DEFAULT_SESSION_LENGTH_MINUTES = 45`, `DEFAULT_BREAK_DURATION_MINUTES = 5`. Use these when `profile?.…` is null/undefined so defaults live in one place and can be tuned or localized later.

---

## 5. Query and List Limits

### 5.1 Problem

Limits passed to data functions are magic numbers scattered across screens and services:

| Call                           | Limits used                          | Location                                                                                                     |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `getTopicsDueForReview(n)`     | 20, 3, 5, 1000                       | ReviewScreen, DailyChallengeScreen, useHomeDashboardData, StudyPlanScreen, studyPlanner, notificationService |
| `getWeakestTopics(n)`          | 5, 3                                 | DailyChallengeScreen, TodayPlanCard, useHomeDashboardData, notificationService                               |
| `getAllCachedQuestions()`      | —                                    | BossBattleScreen, MockTestScreen (then filter/slice)                                                         |
| `searchLectureNotes(query, n)` | 25 (default 20 in fn)                | NotesSearchScreen 25; aiCache default 20                                                                     |
| `getChatHistory(topicName, n)` | 20                                   | GuruChatScreen                                                                                               |
| `getLegacyLectureNotes(n)`     | 3                                    | lectureSessionMonitor                                                                                        |
| BossBattleScreen               | subjectQs.length < 5, slice(0, 15)   | Inline                                                                                                       |
| MockTestScreen                 | MAX_QUESTIONS = 20, selectedCount 20 | Local constant                                                                                               |

### 5.2 Recommendation

Add **`src/config/limits.ts`** (or a section in `appConfig.ts`):

```ts
/** Max topics to load for review queue (e.g. session planner, study plan). */
export const REVIEW_QUEUE_LIMIT = 1000;

/** Default number of due topics to show on home / daily challenge. */
export const DUE_TOPICS_PREVIEW = 5;

/** Default number of weak topics to show on home / today plan. */
export const WEAK_TOPICS_PREVIEW = 5;

/** Review screen queue size. */
export const REVIEW_SCREEN_QUEUE_SIZE = 20;

/** Mock test / boss battle. */
export const MOCK_TEST_MAX_QUESTIONS = 20;
export const BOSS_BATTLE_MIN_QUESTIONS = 5;
export const BOSS_BATTLE_QUESTIONS_PER_FIGHT = 15;

/** Search / history. */
export const LECTURE_SEARCH_LIMIT = 25;
export const CHAT_HISTORY_LIMIT = 20;
```

Then replace inline numbers with these constants so limits can be tuned in one place and stay consistent (e.g. search limit 20 vs 25).

---

## 6. Alert and Error Copy

### 6.1 Problem

User-facing strings are inline in components and services:

- **Alert.alert:** e.g. 'Success', 'Error', 'Leave session?', 'Not enough questions', 'Transcription Complete', 'Recording Error', 'Microphone Access', 'Delete transcript?', 'Sync failed', 'Invalid Duration', 'Not supported', etc.
- **throw new Error:** e.g. 'No usable lecture content was detected in this recording.', 'Download failed', 'Guru couldn't respond: …'
- **Console:** Many `console.error` / `console.warn` with ad-hoc messages.

### 6.2 Recommendation

- **Phase 1:** Add **`src/constants/copy.ts`** (or `errors.ts`) with keys for common alerts and errors, e.g. `ALERT_SUCCESS`, `ALERT_ERROR`, `ERROR_NO_LECTURE_CONTENT`, `ERROR_DOWNLOAD_FAILED`. Use these in Alert.alert and throw new Error so copy can be changed or localized in one place.
- **Phase 2:** Optionally add a small `logger` helper that prefixes `[ScreenName]` and respects `__DEV__` so console usage is consistent and can be toggled.

---

## 7. Vibration Patterns

### 7.1 Problem

Vibration patterns are raw arrays in multiple screens:

- **PunishmentMode.tsx:** `[0, 1000, 300, 1000, 300, 1000]` (level 2)
- **DoomscrollInterceptor.tsx:** `Vibration.vibrate([0, 1000, 500, 1000, 500, 1000])`
- **LectureModeScreen.tsx:** `Vibration.vibrate([0, 500, 200, 500, 200, 1000])`, `Vibration.vibrate(1000)`

### 7.2 Recommendation

Add **`src/constants/haptics.ts`** (or under `constants/`):

```ts
/** Vibration pattern: [pause, vibrate, pause, vibrate, ...] in ms. */
export const VIBRATION_PATTERNS = {
  /** Doomscroll / punishment warning. */
  WARNING_LONG: [0, 1000, 500, 1000, 500, 1000] as const,
  /** Proof-of-life / lecture alert. */
  ALERT_MEDIUM: [0, 500, 200, 500, 200, 1000] as const,
  /** Single short pulse. */
  TAP: 1000,
} as const;
```

Use these constants in PunishmentMode, DoomscrollInterceptor, and LectureModeScreen so patterns are consistent and easy to adjust.

---

## 8. Layout and Styling Numbers

### 8.1 Problem

- **theme.ts** already defines `spacing`, `typography`, `borderRadius`, and `colors`, but many StyleSheets still use raw numbers (e.g. `padding: 16`, `fontSize: 14`, `borderRadius: 12`). Grep shows hundreds of such usages across screens and components.
- Inconsistent values for the same intent (e.g. card padding 12 vs 14 vs 16, radius 8 vs 10 vs 12).

### 8.2 Recommendation

- **Incremental migration:** When touching a file, replace layout numbers with `theme.spacing`, `theme.typography`, `theme.borderRadius` where they match intent (e.g. `padding: 16` → `theme.spacing.lg`, `fontSize: 14` → `theme.typography.bodySmall`).
- **No new constants needed:** Prefer theme over a second set of layout constants. Document in theme.ts that new styles should use theme; leave one-off values (e.g. specific icon size) as-is if they don’t fit a token.

---

## 9. Remaining Hex Colors

### 9.1 Problem

Roughly **400+** hex/rgba literals remain in `src` (excluding theme.ts and syllabus). Highest density: TranscriptHistoryScreen, StatsScreen, LectureModeScreen, MockTestScreen, TopicDetailScreen, NotesHubScreen, DailyChallengeScreen, ContentCard, StudyPlanScreen, etc. Many are backgrounds, borders, or semantic colors that already exist in theme.

### 9.2 Recommendation

- Continue replacing with `theme.colors.*` when the intent is background/surface/border/primary/success/warning/error/text.
- For one-off tints (e.g. `primary + '22'`), consider adding `primaryTintSoft`-style tokens if a pattern repeats; otherwise leave as theme + alpha.
- Keep theme as the single source of truth; avoid introducing a parallel “legacy hex” map.

---

## 10. Feature-Specific Magic Numbers

### 10.1 Already localized (good)

- **BOSS_HP = 100**, **MAX_QUESTIONS = 20** in BossBattleScreen and MockTestScreen.
- **HARASSMENT_INTERVAL**, **GUILT_CHECK_INTERVAL** in PunishmentMode.
- **RECORDING_RETRY_DELAY**, **STATE_SAVE_THROTTLE** in LectureModeScreen.
- **DEDUPE_WINDOW_MS**, **RETRY_BASE_DELAY** in offlineQueue.
- **STREAK_MIN_MINUTES** in gamification (underused — see §4).

### 10.2 Could be centralized

- **Projected score formula:** StatsScreen uses `Math.min(300, Math.round(50 + (highYieldPercent * 2.5)))`. Could move to a small `projectedScoreFromHighYieldPercent(percent: number): number` in a stats util or config, with 300 and 50 and 2.5 as named constants if you want to tune the formula later.
- **INICET score max:** 300 appears in StatsScreen and possibly elsewhere; could be `appConfig.INICET_MAX_SCORE` if you ever support different exam norms.
- **Proof-of-life / break countdown:** 3 (e.g. “3s auto-start”) in LectureModeScreen could be `RESUME_COUNTDOWN_SECONDS` next to other timing constants.
- **Slice limits in UI:** e.g. `.slice(0, 3)` for “first 3 topics” in multiple places. If this is a design rule (“show at most 3”), a constant like `MAX_PREVIEW_ITEMS = 3` in limits or copy can help.

---

## 11. Suggested Implementation Order

| Priority | Item                                                                     | Effort  | Impact                             |
| -------- | ------------------------------------------------------------------------ | ------- | ---------------------------------- |
| 1        | Time constants (`MS_PER_DAY`, etc.)                                      | Low     | Clarity, fewer magic numbers       |
| 2        | Single `CONTENT_TYPE_LABELS` and use everywhere                          | Low     | No duplicate content-type copy     |
| 3        | `CONFIDENCE_LABELS` in constants, use in Transcript + LectureReturnSheet | Low     | Single source for confidence UI    |
| 4        | Use `STREAK_MIN_MINUTES` everywhere instead of `20`                      | Low     | Consistency with gamification      |
| 5        | Default profile defaults in appConfig (daily goal, session, break)       | Low     | One place to tune defaults         |
| 6        | Limits config (review queue, search, chat history, mock/boss)            | Medium  | Consistent limits, easy tuning     |
| 7        | Alert/error copy constants                                               | Medium  | Enables future i18n and copy edits |
| 8        | Vibration patterns constant                                              | Low     | Consistent haptics                 |
| 9        | Theme migration (hex → theme.colors)                                     | Ongoing | Visual consistency, theming        |
| 10       | Layout migration (raw numbers → theme.spacing/typography)                | Ongoing | Design-system consistency          |

---

## 12. Files to Touch (by change type)

- **Time constants:** `src/db/queries/progress.ts`, `src/screens/TopicDetailScreen.tsx`, `src/screens/StudyPlanScreen.tsx`, `src/screens/CheckInScreen.tsx`, `src/screens/NotesHubScreen.tsx`, `src/screens/LectureModeScreen.tsx`, `src/services/offlineQueue.ts`, `src/services/studyPlanner.ts`, `src/services/sessionPlanner.ts`, `src/db/database.ts`, `src/services/notificationService.ts`, plus any other files using 86400000 or complex time math.
- **Content type labels:** Add `src/constants/contentTypes.ts`; update `SessionScreen.tsx`, `FlaggedReviewScreen.tsx`.
- **Confidence labels:** Add to `gamification.ts` or new file; update `TranscriptHistoryScreen.tsx`, `LectureReturnSheet.tsx`.
- **STREAK_MIN_MINUTES:** `ManualLogScreen.tsx`, `LectureModeScreen.tsx`, `SessionScreen.tsx` (wherever streak threshold is checked).
- **Default profile values:** `appConfig.ts`; then `HomeScreen`, `StudyPlanScreen`, `PunishmentMode`, `SessionScreen`, `LectureModeScreen`, `SettingsScreen` to use config defaults when profile value is missing.
- **Limits:** New `limits.ts` or appConfig section; then call sites for `getTopicsDueForReview`, `getWeakestTopics`, `searchLectureNotes`, `getChatHistory`, BossBattleScreen, MockTestScreen.
- **Copy:** New `copy.ts` or `errors.ts`; then replace Alert.alert and throw new Error strings where it adds most value (e.g. shared errors like “No usable lecture content”).
- **Vibration:** New `haptics.ts`; then PunishmentMode, DoomscrollInterceptor, LectureModeScreen.

---

## References

- **Config:** `src/config/appConfig.ts`
- **Theme:** `src/constants/theme.ts`
- **Gamification:** `src/constants/gamification.ts` (STREAK_MIN_MINUTES, MOOD_LABELS, LEVELS, XP_REWARDS)
- **Types:** `ContentType` in types/schemas; confidence 1–3 in DB and AI schemas
