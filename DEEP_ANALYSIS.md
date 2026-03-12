# Deep Codebase Analysis — File by File, Line by Line

Generated from full `npm run typecheck` + `npm run lint`. **TypeScript: 0 errors.** **ESLint: 0 errors, 292 warnings.**

---

## Executive summary

| Category | Count | Severity |
|----------|--------|----------|
| setState in effect (cascading renders) | 4 | **High** |
| Unused imports / variables | 80+ | Low |
| `any` types | 90+ | Medium |
| Missing hook dependencies | 50+ | Medium |
| Empty catch/block | 10+ | Low |
| Control regex / useless escape | 6 | Low |

---

## 1. Critical / runtime-relevant issues

### 1.1 `react-hooks/set-state-in-effect` — synchronous setState in useEffect

**ContentCard.tsx (54–58)**  
- **Line 56:** `setFlagged(false)` is called synchronously in the effect when `!topicId`.  
- **Impact:** Can cause extra renders; React docs recommend deriving state or moving to event/callback.  
- **Fix:** Derive `flagged` when `!topicId` (e.g. `const effectiveFlagged = topicId ? flagged : false`) or set in a microtask: `queueMicrotask(() => setFlagged(false))`.

**FlaggedReviewScreen.tsx (30–32)**  
- **Line 32:** `useEffect(() => { load(); }, [load]);` — `load()` calls `setItems` inside the effect.  
- **Impact:** Linter flags synchronous setState inside effect (load → setItems).  
- **Fix:** Keep load in effect but ensure `load` is stable (useCallback with deps), or run load in a short timeout so setState is async.

**ManualLogScreen.tsx (40–44)**  
- **Line 42:** `setSubjectTopics([])` in the `else` branch of useEffect.  
- **Impact:** Same pattern as ContentCard; synchronous setState in effect.  
- **Fix:** Derive or use `queueMicrotask(() => setSubjectTopics([]))`.

**ManualLogScreen.tsx (77)**  
- **Line 77:** `selectedApp` is assigned but never used — dead code.

---

### 1.2 Database & schema alignment

**db/database.ts**  
- **11, 18:** `global as any` — weak typing for `__GURU_DB__`.  
- **91:** `topicCountAfterRes` assigned, never used (logging commented out).  
- **189:** `priority`, `minutes` destructured in seed loop, never used.  
- **231, 234:** `ignored`, `inserted` in seedVaultTopics, never used.

**services/lecture/persistence.ts**  
- **5:** Imports `updateSessionTranscriptionStatus`, `updateSessionNoteEnhancementStatus` but never use them (status updates live in lectureSessionMonitor). Unused imports.  
- **45:** UPDATE uses `transcription_status` (correct per schema).  
- **55–56:** `getFailedTranscriptions` uses `transcription_status` and `returned_at` (correct).

**db/queries/externalLogs.ts**  
- **getFailedOrPendingTranscriptions** (183–219): Filters `returned_at IS NOT NULL`, `recording_path IS NOT NULL`, and transcription_status / lecture_note_id. Aligned with schema and usage.

---

### 1.3 Lecture flow — logic check

**services/lectureSessionMonitor.ts**  
- **15:** Duplicate import: `getRecordingInfo` from `./lecture/transcription` (line 14 and 15).  
- **44:** `logId` destructured in `transcribeLectureWithRecovery` but never used (only passed through to runFullTranscriptionPipeline for status updates).  
- **70–86:** `retryFailedTranscriptions(groqKey)` — passes groqKey into pipeline; when missing, Groq path fails and local Whisper is not used by `transcribeLectureWithRecovery` (it only uses local if Groq throws and useLocalWhisper is true). So retry without key may always fail unless callers pass key (e.g. useAppBootstrap does pass profile.groqApiKey).  
- **117–125:** `runFullTranscriptionPipeline` does not pass `useLocalWhisper` / `localWhisperPath` into `transcribeLectureWithRecovery` — so retries always use Groq only.  
- **153, 160:** `any` for opts and analysis in saveLectureAnalysisQuick and enhanceNoteInBackground.  
- **Unused:** `updateSessionPipelineTelemetry`, `notifyTranscriptionRecovered` imported but not used in this file (telemetry/recovery may be used elsewhere; recovery is done in retryFailedTranscriptions by counting).

**services/transcription/matching.ts**  
- **2:** `getDb` imported, never used (updateTopicProgress uses getDb internally).  
- **27:** `let match` — never reassigned; use `const`.  
- **94–106:** `applyLectureProgressToTopic` calls `updateTopicProgress(topicId, status, confidence, 0)`. topics.updateTopicProgress uses getDb() internally; same process, so no db instance mismatch.

**services/lecture/persistence.ts**  
- **3:** Imports `markTopicsFromLecture` from `../transcription/matching` (path correct from `lecture/persistence.ts`).  
- **20–21:** Calls `markTopicsFromLecture(db, analysis.topics, analysis.estimatedConfidence, analysis.subject)`. matching expects `(db, topics, confidence, subjectName?)` — correct.

---

## 2. File-by-file lint and logic (by path)

### components/ErrorBoundary.tsx  
- **22:** `error` in catch param unused → use `_error` or omit.

### components/ExternalToolsRow.tsx  
- **18:** `any` type → replace with a proper type.

### components/GuruChatOverlay.tsx  
- **33:** useEffect missing dependency `pulseAnim`.

### components/LectureReturnSheet.tsx  
- **103:** useEffect missing dependency `runTranscription`.  
- **183, 266:** `any` types.

### components/LoadingOrb.tsx  
- **49:** useEffect missing deps `opacity`, `scale`.

### components/StartButton.tsx  
- **52:** useEffect missing deps `glow`, `scale`.

### components/SubjectCard.tsx  
- **59:** useEffect missing deps `progressAnim`, `scaleAnim`.

### components/Toast.tsx  
- **92:** useEffect missing deps (onDone, opacity, payload, translateY).

### components/VisualTimer.tsx  
- **3:** `Path` unused.  
- **10:** `useAnimatedStyle` unused.  
- **44:** useEffect missing dep `progress`.

### constants/prompts.ts  
- **1:** `TopicWithProgress` unused.  
- **134:** `subjectName` param unused.

### db/database.ts  
- **11, 18:** `any` for global.  
- **91:** `topicCountAfterRes` unused.  
- **189:** `priority`, `minutes` unused in seed.  
- **231, 234:** `ignored`, `inserted` unused.

### db/queries/topics.ts  
- **2:** `Topic` unused.  
- **120, 234:** `any` in getFirstAsync.  
- **185:** `today` unused (getSubjectCoverage or similar).

### hooks/useAppBootstrap.ts  
- **71:** useEffect missing deps loadProfile, refreshProfile, setDailyAvailability.

### hooks/useGuruPresence.ts  
- **59:** useEffect missing dep `presencePulse`.

### hooks/useHomeDashboardData.ts  
- **28:** `any` in catch.

### hooks/useLectureTranscription.ts  
- **25, 29, 30, 37:** Unused types/consts (TranscriptSegment, DEFAULT_*_CONFIG, MODEL_REGISTRY).  
- **93:** Ref cleanup warning (recorderRef.current in cleanup).

### hooks/useResponsive.ts  
- **27:** `any` in type.

### navigation/TabNavigator.tsx  
- **99, 109:** `any` types.

### navigation/navigationRef.ts  
- **3:** `any` type.

### screens/BedLockScreen.tsx  
- **26:** `progressAnim` unused.  
- **82, 95:** useEffect deps pulseAnim, shakeAnim.

### screens/BossBattleScreen.tsx  
- **24:** `profile` unused.

### screens/BreakEnforcerScreen.tsx  
- **2:** View, AppState, TouchableOpacity unused.  
- **56:** useEffect deps.

### screens/BreakScreen.tsx  
- **84:** useEffect dep `onDone`.  
- **136:** `isSelectedOption` unused.

### screens/CheckInScreen.tsx  
- **64:** useEffect dep `fadeIn`.

### screens/ContentCard.tsx  
- **56:** setState in effect (see Critical).  
- **126:** `CONFIDENCE_LABELS` unused.  
- **345:** `e` unused in catch.

### screens/DailyChallengeScreen.tsx  
- **33:** `profile` unused.  
- **61:** useEffect dep `progressAnim`.

### screens/DoomscrollInterceptor.tsx  
- **14, 15:** DOOMSCROLL_APPS, CHECK_INTERVAL unused.  
- **50, 118:** useEffect deps.

### screens/FlaggedReviewScreen.tsx  
- **32:** setState in effect via load() (see Critical).  
- **51, 82:** `any` types.

### screens/GuruChatScreen.tsx  
- **89:** `dots` array makes effect deps change every render → useMemo.  
- **290:** copyMessage in useCallback deps → move inside or wrap in useCallback.

### screens/HomeScreen.tsx  
- **4, 6, 8:** ActivityIndicator, Pressable, Haptics, Ionicons unused.  
- **26:** saveTranscriptToFile unused.  
- **44, 47, 53, 55, 56:** refreshProfile, dueTopics, reviewDue, uploadTranscript, showTranscriptModal unused or any.  
- **69, 77, 111:** any / useEffect dep navigation.

### screens/InertiaScreen.tsx  
- **33, 37, 44, 48–50, 54:** Several unused vars (width, POSITION_CHECK_DURATION, topic, positionVerified, positionProgress, setPositionProgress, isLyingDown, setIsLyingDown, positionAnim).  
- **61, 136:** useEffect deps, unused `e`.

### screens/LectureModeScreen.tsx  
- **75, 92, 184, 367:** useEffect deps; any.

### screens/LocalModelScreen.tsx  
- **83, 85, 129:** useEffect deps; any.

### screens/LockdownScreen.tsx  
- **2:** View, AppState unused.  
- **39:** useEffect dep navigation.

### screens/ManualLogScreen.tsx  
- **15, 16:** any.  
- **42:** setState in effect (see Critical).  
- **77:** selectedApp unused.

### screens/MockTestScreen.tsx  
- **15:** MAX_QUESTIONS unused.  
- **30:** revealed, setRevealed unused.  
- **79:** useEffect dep navigation.

### screens/NotesSearchScreen.tsx  
- **305:** `idx` param unused.

### screens/PunishmentMode.tsx  
- **47, 113:** useEffect deps.

### screens/ReviewScreen.tsx  
- **39:** profile unused.  
- **68, 84, 94:** useEffect deps.

### screens/SessionScreen.tsx  
- **2:** Dimensions unused.  
- **11:** getTodaysAgendaWithTimes, TodayTask unused.  
- **108, 165, 177, 183, 185:** useEffect deps; startPlanning in deps.  
- **205:** any.  
- **402–404:** mins, secs, progressPercent unused.

### screens/SettingsScreen.tsx  
- **3, 4:** TextInput, Switch, ActivityIndicator, Linking unused.  
- **95, 98:** examSyncMeta, saveError unused.  
- **188, 223, 239:** useEffect deps; any.

### screens/SleepModeScreen.tsx  
- **15:** width, height unused.  
- **41, 86, 106, 110, 111, 138:** any; useEffect dep triggerAlarm.

### screens/StatsScreen.tsx  
- **24:** any.  
- **42:** useEffect dep loadStats.

### screens/StudyPlanScreen.tsx  
- **44:** useCallback dep refreshPlan.

### screens/SyllabusScreen.tsx  
- **117:** useEffect dep loadData.  
- **150, 161, 165–166, 169–170, 174:** any; runDiagnostics unused.  
- **231:** useEffect deps countAnim, progressAnim.

### screens/TopicDetailScreen.tsx  
- **302:** useEffect deps countAnim, progressAnim.

### screens/TranscriptHistoryScreen.tsx  
- **6:** useMemo unused.

### screens/WakeUpScreen.tsx  
- **2:** Easing unused.  
- **30:** breatheCycle, setBreatheCycle unused.  
- **66:** useEffect dep breatheAnim.

---

### services/ai/chat.ts  
- **77, 80, 82:** Thrown errors without `cause` (preserve-caught-error).

### services/ai/content.ts  
- **23, 24:** any.

### services/ai/generate.ts  
- **23:** preferCloud unused.

### services/ai/jsonRepair.ts  
- **90, 99–101, 107:** Control character in regex (e.g. `\x00`) — no-control-regex.

### services/ai/llmRouting.ts  
- **26:** any.  
- **42:** Empty block.

### services/ai/medicalSearch.ts  
- **75, 79, 81, 106, 111:** any.

### services/ai/notifications.ts  
- **2:** SYSTEM_PROMPT unused.

### services/appLauncher.ts  
- **9:** canDrawOverlays, requestOverlayPermission unused.  
- **76, 78:** err unused; any; empty catch.

### services/backgroundTasks.ts  
- **19, 20, 27:** any.

### services/backupService.ts  
- **92:** Empty catch.  
- **93:** any.  
- **122:** validationError unused.

### services/deviceSyncService.ts  
- **15, 17:** any.  
- **48, 62:** Prefer @ts-expect-error over @ts-ignore.  
- **76:** Empty block.  
- **113, 125, 137:** any.

### services/examDateSyncService.ts  
- **69:** Unnecessary escapes in regex (\/, \,).  
- **176:** sourceUrl param unused.

### services/fsrsService.ts  
- **1:** State unused.

### services/imageService.ts  
- **14, 43:** catch param `e` unused.

### services/jsonBackupService.ts  
- **46:** BackupMetadata unused.  
- **51:** isRecord unused.  
- **172, 217–220, 223, 231, 239, 241, 243, 245:** any.  
- **291, 292:** e unused; empty catch.

### services/lecture/persistence.ts  
- **5:** updateSessionTranscriptionStatus, updateSessionNoteEnhancementStatus unused.  
- **8, 58:** any.

### services/lectureSessionMonitor.ts  
- **11:** updateSessionPipelineTelemetry unused.  
- **17:** notifyTranscriptionRecovered unused.  
- **29, 44:** any; logId unused.  
- **153, 160:** any.

### services/localModelBootstrap.ts  
- **84, 98, 122, 123:** any.

### services/offlineQueue.ts  
- **132:** Empty catch.  
- **137:** Use const for processorRegistry.  
- **176:** any.

### services/offlineTranscription (batchTranscriber, realtimeTranscriber, etc.)  
- Multiple unused vars and any types; see lint output.

### services/studyPlanner.ts  
- **529:** totalMinutesScheduled unused.

### services/syncCrypto.ts  
- **67, 75:** any.

### services/transcription/analysis.ts  
- **54:** err unused in catch.

### services/transcription/engines.ts  
- **38:** any.

### services/transcription/matching.ts  
- **2:** getDb unused.  
- **27:** use const for match.

### services/transcription/noteGeneration.ts  
- **27:** e unused in catch.

### services/xpService.ts  
- **68:** newTotal unused.

### types/react-native-community__datetimepicker.d.ts  
- **2:** any.

---

## 3. Unit test files

- **transcriptionService.unit.test.ts, aiService.unit.test.ts, deviceSyncService.unit.test.ts, etc.:** Multiple `any` and mock types; acceptable in tests but can be tightened.
- **Jest + expo-sqlite:** Some tests fail with ESM parse error (expo-sqlite); needs transformIgnorePatterns or resolver config, not a line-by-line code bug.

---

## 4. Recommendations (priority order)

1. **High:** Fix the 4 set-state-in-effect sites (ContentCard, FlaggedReviewScreen, ManualLogScreen) to avoid cascading renders and align with React guidance.  
2. **Medium:** Add proper types for the most-used `any` (e.g. lecture opts, analysis, catch errors).  
3. **Medium:** In lectureSessionMonitor, pass `useLocalWhisper` / `localWhisperPath` into `transcribeLectureWithRecovery` when retrying so retries can fall back to local Whisper.  
4. **Low:** Remove or prefix unused imports/vars (`_`), use `const` where applicable, and fix the two `prefer-const`/fixable lint items.  
5. **Low:** Replace @ts-ignore with @ts-expect-error in deviceSyncService; add `cause` to rethrown errors in ai/chat.ts.  
6. **Config:** Fix Jest config for expo-sqlite so unit tests that depend on it can run.

---

## 5. TypeScript and ESLint summary

- **tsc --noEmit:** 0 errors.  
- **ESLint:** 0 errors, 292 warnings (no blocking failures).  
- This document is the deep, file-by-file, line-by-line analysis of those results plus logic and schema checks.
