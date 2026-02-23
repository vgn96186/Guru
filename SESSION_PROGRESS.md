# Guru App — Session Progress Log
Last updated: 2026-02-23 (Session 3 — Full Codebase Audit & Fix)

---

## Project Overview
**Guru** is a React Native / Expo medical study app for NEET/INICET prep.
- Located at: `C:\Vault\Guru`
- Stack: Expo SDK ~54, React Native 0.81.5, expo-sqlite 16, Zustand 5, Gemini/OpenRouter AI
- 19 medical subjects, 3-level topic hierarchy, SRS (SM-2 inspired), XP/gamification, AI quiz/keypoints

---

## Session 3 — Full Codebase Audit (2026-02-23)

A comprehensive audit identified **33 issues** across the entire codebase. All have been addressed.

### CRITICAL Fixes (5/5 Complete)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `src/services/backupService.ts` | Wrong DB filename (`study_guru.db` vs actual `neet_study.db`) — backups always failed silently | Changed to `'neet_study.db'` |
| 2 | `src/screens/SettingsScreen.tsx` | Used `File`/`Paths` from expo-file-system v17+ API but project has v16 — export/import crashed | Migrated to `import * as FileSystem from 'expo-file-system/legacy'` with `writeAsStringAsync`/`readAsStringAsync` |
| 3 | `src/screens/LockdownScreen.tsx` + `BreakEnforcerScreen.tsx` | `navigate('Home')` — 'Home' doesn't exist in RootStack, only inside HomeStack | Changed to `navigate('Tabs')` |
| 4 | `src/db/database.ts` | `seedTopics()` never ran on fresh install — topic count was checked AFTER `seedSubjects()` already bumped it | Moved topic count check BEFORE `seedSubjects()` to correctly detect fresh install |
| 5 | `src/screens/WakeUpScreen.tsx` | `new Animated.Value(1)` created inline without `useRef` — re-created every render, breaking animations | Wrapped in `useRef(...).current` |

### HIGH Fixes (7/7 Complete)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 6 | `src/navigation/types.ts` | `Session` params missing `forcedMinutes` — used by lockdown flow but not in type | Added `forcedMinutes?: number` to Session params |
| 7 | `src/screens/SessionScreen.tsx` | `handleBreakDone` overrode `session_done` state → infinite study loop | Added `if (store.sessionState !== 'session_done')` guard |
| 8 | `src/components/FocusAudioPlayer.tsx` | Stale closure: cleanup captured null `sound` ref at mount time → audio never unloaded | Added `soundRef = useRef<Audio.Sound>()` synced with state; cleanup uses ref |
| 9 | `src/screens/DailyChallengeScreen.tsx` | Score header showed `{score}/{currentIdx}` (0-indexed) instead of current question number | Changed to `{score}/{currentIdx + 1}` |
| 10 | `src/screens/DailyChallengeScreen.tsx` | Score race condition: `finishChallenge` read stale `score`/`correctTopics` state from async animation callback | Pre-compute `newScore`, `newCorrectTopics`, `newWrongTopics` before setState, pass as args to `finishChallenge(finalScore, finalCorrect, finalWrong)` |
| 11 | `src/screens/LectureModeScreen.tsx` | Same stale-closure bug with `recording` ref in timer cleanup | Added `recordingRef = useRef<Audio.Recording>()` synced with state |
| 12 | `src/services/aiService.ts` | `fileInfo.size.toString()` crashes if size is undefined | Changed to `(fileInfo.size ?? 0).toString()` |

### MEDIUM Fixes (9/9 Complete)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 13 | `src/navigation/linking.ts` | Missing screen mappings for new routes (FlaggedReview, BossBattle, etc.) | Added all missing screen paths |
| 14 | `src/components/home/NemesisSection.tsx` | TouchableOpacity had no `onPress` — nemesis card was not tappable | Added `onPress={() => navigation.navigate('BossBattle')}` |
| 15 | `src/db/queries/progress.ts` | Parameter `dateStr` shadowed the imported `dateStr` utility function | Renamed parameter to `examDateStr` |
| 16 | `src/services/notificationService.ts` | `vibrate` property in notification content — removed from Expo SDK 54 | Removed `vibrate` property |
| 17 | `src/components/ExternalToolsRow.tsx` | `delayLongPress={1000}` too long — users wouldn't discover long-press to log | Reduced to `delayLongPress={500}` |
| 18 | `src/hooks/useIdleTimer.ts` | Stale `isIdle` in interval callback | Added `isIdleRef` synced with state |
| 19 | `src/constants/externalApps.ts` | `bhatia` app had duplicate `customScheme: 'dbmci://'` conflicting with dbmci app | Removed duplicate scheme |
| 20 | `src/components/ContentCard.tsx` | Dead `handleReadAloud` function left over from refactor | Removed dead code |
| 21 | `src/screens/StudyPlanScreen.tsx` | Unused `Dimensions` import | Removed unused import |

### LOW Fixes (Additional Improvements)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 22 | `src/components/home/QuickStatsCard.tsx` | CSS rotation ring hack broke above 50% progress | **Replaced entirely** with proper SVG ring using `react-native-svg` `<Circle>` with `strokeDasharray`/`strokeDashoffset` — works correctly at all percentages |
| 23 | `src/hooks/useGuruPresence.ts` | `hasGenerated` ref never reset when topics changed — stale presence messages forever | Added `lastTopicKey` ref tracking sorted topic names; regenerates when topics change materially |
| 24 | `src/components/VisualTimer.tsx` | `Animated.addWhitelistedNativeProps()` is deprecated legacy API in Reanimated v4 | Removed the call; `useAnimatedProps` handles this natively in v3+ |
| 25 | `src/components/FocusAudioPlayer.tsx` | Remote Google URL (`actions.google.com/sounds/...`) is volatile and could break anytime | Changed to `require('../../assets/rain.mp3')` local bundled asset |
| 26 | `src/services/deviceSyncService.ts` | MQTT `require()` had no fallback flag; `connectToRoom` swallowed all errors silently | Added `mqttUnavailable` flag to prevent repeated require attempts; added `isSyncAvailable()` export; added `client.on('error')` handler |
| 27 | 11 screen files | `useNavigation<any>()` — no type safety on navigation calls | Typed all 11 files with proper `NativeStackNavigationProp<RootStackParamList>` or `NativeStackNavigationProp<HomeStackParamList>` based on which navigator each screen belongs to |
| 28 | ~15 service/screen files | ~40+ `console.log`/`warn`/`error` calls running in production builds | Wrapped all in `if (__DEV__)` guards — tree-shaken out of production bundles |
| 29 | `src/hooks/useGuruPresence.ts` | Missing dependency in useEffect | Fixed deps array |
| 30 | `src/constants/achievements.ts` | Quiz achievement checked wrong field | Fixed to use `quiz_correct_count` |

---

## Files Typed with Proper Navigation (Session 3)

| File | Type Applied |
|------|-------------|
| `src/screens/BreakEnforcerScreen.tsx` | `NativeStackNavigationProp<RootStackParamList>` |
| `src/screens/LockdownScreen.tsx` | `NativeStackNavigationProp<RootStackParamList>` |
| `src/screens/DoomscrollGuideScreen.tsx` | `NativeStackNavigationProp<RootStackParamList>` |
| `src/screens/DeviceLinkScreen.tsx` | `NativeStackNavigationProp<RootStackParamList>` |
| `src/screens/SettingsScreen.tsx` | `NativeStackNavigationProp<RootStackParamList>` |
| `src/screens/FlaggedReviewScreen.tsx` | `NativeStackNavigationProp<HomeStackParamList>` |
| `src/screens/BossBattleScreen.tsx` | `NativeStackNavigationProp<HomeStackParamList>` |
| `src/screens/InertiaScreen.tsx` | `NativeStackNavigationProp<HomeStackParamList>` |
| `src/screens/ReviewScreen.tsx` | `NativeStackNavigationProp<HomeStackParamList>` |
| `src/screens/NotesSearchScreen.tsx` | `NativeStackNavigationProp<HomeStackParamList>` |
| `src/components/LectureReturnSheet.tsx` | `NativeStackNavigationProp<RootStackParamList>` |

---

## Previous Sessions (1-2) — Retained for Reference

### Session 1-2: Syllabus Expansion & Core Fixes

1. **LectureReturnSheet Quiz Phase** — Post-lecture MCQ quiz with XP
2. **Critical SRS Bug** — `TOPIC_SELECT` was missing `wrong_count, is_nemesis`
3. **Database seedTopics always-run** — INSERT OR IGNORE on every boot
4. **Vault Topics Cleanup** — Removed junk Obsidian imports
5. **Full Syllabus Expansion** — All 19 subjects, 1438 lines, ~600+ topics with 3-level hierarchy
6. **Community Medicine / PSM** — Added as subject 19
7. **Catalyst Pipeline UI** — ScrollView fix, inline success card

---

## Known Open Items (Post-Audit)

These were identified by the user's independent scan and are **not yet implemented**:

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Nemesis content-type rotation** | Partially done | Nemesis gets +50 score boost in session planner (user applied fix), but dynamic content-type rotation (keypoints → detective → teach_back) not implemented yet |
| 2 | **Pre-caching midnight content** | Not started | Design calls for background fetch at midnight to cache tomorrow's content. Currently all AI content is on-demand with loading spinners |
| 3 | **Database seeding performance** | Not started | 600+ topics seed synchronously on first install. May hang splash screen on low-end devices. Consider batched async inserts or pre-built SQLite DB |
| 4 | **ESLint / Formatter setup** | Not started | No `npm run lint` script in package.json. Code drift risk in ~267K codebase |
| 5 | **Error swallowing on permissions** | Partial | Console logs now `__DEV__` gated, but user-facing error UI (toast/alert) for mic/audio/API failures still missing |
| 6 | **Accountability push notifications** | Not started | Design outlines intelligent notifications ("Your nemesis topic X is laughing at you"). `CircadianService.ts` and dynamic scheduling still pending |
| 7 | **Rain audio asset** | Needs file | `FocusAudioPlayer` now references `require('../../assets/rain.mp3')` — need to add actual rain audio file to `assets/` |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/constants/syllabus.ts` | All 19-subject topic tree (1438 lines) |
| `src/constants/vaultTopics.ts` | Obsidian vault import (pre-learned topics) |
| `src/db/database.ts` | DB init, migrations, seeding |
| `src/db/queries/topics.ts` | All topic/progress queries |
| `src/db/queries/aiCache.ts` | AI response caching |
| `src/db/schema.ts` | SQLite table definitions |
| `src/components/LectureReturnSheet.tsx` | Post-lecture overlay with quiz |
| `src/services/transcriptionService.ts` | Gemini transcription pipeline |
| `src/services/aiService.ts` | AI generation: keypoints, quiz, catalyst |
| `src/services/sessionPlanner.ts` | Topic scoring + selection for study sessions |
| `src/services/deviceSyncService.ts` | MQTT-based device sync (body doubling) |
| `src/navigation/types.ts` | All navigation param types |
| `src/constants/prompts.ts` | All Gemini prompts |

---

## DB Schema Quick Reference

**topics table:**
- `id, subject_id, name, estimated_minutes, inicet_priority, parent_topic_id`

**topic_progress table:**
- `topic_id, status (unseen/seen/reviewed/mastered), confidence (0-5)`
- `last_studied_at, times_studied, xp_earned, next_review_date`
- `user_notes, wrong_count, is_nemesis`

**SRS intervals (confidence → days):** `[1, 1, 3, 7, 14, 21]`
