# Guru — Codebase Audit TODO

## CRITICAL (fix immediately)

- [x] **#1 FSRS confidence-to-rating scale is wrong** — `src/services/fsrsService.ts:17-22`
  App confidence is 0–3 but `mapConfidenceToRating` maps as if 1–5. `Rating.Good` and `Rating.Easy` are never returned — FSRS always schedules Again/Hard. Spaced repetition is broken for every user.

- [x] **#2 Base64 concatenation corrupts chunked WAV files** — `src/services/lectureSessionMonitor.ts:305-306`
  `chunkHeader + pcmBase64` concatenates two independently base64-encoded strings. Header padding chars (`=`) corrupt the combined data. All recordings >24 MB (~30+ min) produce invalid WAV files.

- [x] **#3 DailyChallenge confidence=4 out of range** — `src/screens/DailyChallengeScreen.tsx:151`
  `updateTopicProgress(topicId, 'reviewed', 4, XP_PER_CORRECT)` passes confidence `4`, but schema defines 0–3.

- [x] **#4 Public MQTT broker with zero auth** — `src/services/deviceSyncService.ts:9`
  `broker.emqx.io` used with no authentication or message signing. Anyone can intercept/inject sync messages.

> **Note:** Hardcoded Groq API key (`src/services/aiService.ts:19`) — intentionally left as-is per user request.

---

## HIGH

- [x] **#5 `getLlamaContext` has no mutex** — `src/services/aiService.ts:108-117`
  Two concurrent callers both see `null`, both call `initLlama`, first context leaks (~hundreds of MB native memory).

- [x] **#6 Whisper context leaked on transcription error** — `src/services/aiService.ts:975-985`
  `whisperContext.release()` not in `try/finally`. If `transcribe()` throws, context is never freed.

- [x] **#7 Recording not stopped on app launch failure** — `src/services/appLauncher.ts:148-150`
  Only `stopRecordingHealthCheck()` called in catch, never `stopRecording()` from native module. RecordingService runs indefinitely.

- [x] **#8 `cancelAllNotifications()` nukes all pending notifications** — `src/services/notificationService.ts:146,183,251,285`
  Four functions nuke ALL notifications before scheduling their own. Doomscroll detection wipes accountability notifications.

- [x] **#9 Stale DB references after backup import** — `src/services/backupService.ts:82-96`
  After `db.closeSync()`, components with old `db` reference crash. No forced restart. Rollback deleted immediately with no schema validation.

- [x] **#10 No guard against concurrent transcription** — `src/components/LectureReturnSheet.tsx:83-96`
  Auto-transcription `useEffect` can re-fire and run `runTranscription()` in parallel — duplicate DB writes, double XP.

- [x] **#11 Idle timer resets every render** — `src/hooks/useIdleTimer.ts:24-30`
  `resetTimer` dep array includes `onIdle`/`onActive`. If parent creates these inline, timer resets every render, idle callback never fires.

- [x] **#12 Animated loop not stopped on unmount** — `src/hooks/useGuruPresence.ts:49-57`
  `Animated.loop(...)` has no cleanup return in `useEffect`, causing memory leak.

---

## MEDIUM

- [x] **#13 WAV temp files never deleted** — `src/services/transcriptionService.ts:210-230`
  `convertToWav` creates 50–200 MB files that accumulate over many lectures.

- [x] **#14 `extractBalancedJson` treats single-quotes as delimiters** — `src/services/aiService.ts:355`
  JSON doesn't use single quotes; apostrophe in LLM output corrupts bracket-tracking.

- [x] **#15 Module-level `llamaContext` never released** — `src/services/aiService.ts:108`
  No `releaseLlamaContext()` export or AppState listener to free hundreds of MB native memory.

- [x] **#16 Legacy `transcribeWithGroqCloud` hardcodes `language: 'hi'`** — `src/services/aiService.ts:960`
  Forces Hindi for Hinglish lectures; divergent from `transcriptionService.ts` auto-detection.

- [x] **#17 No debounce/mutex on `launchMedicalApp`** — `src/services/appLauncher.ts:60-135`
  Double-tap starts two overlapping recordings and overlays.

- [x] **#18 Partial download accepted as valid model** — `src/services/localModelBootstrap.ts:65`
  Any file >1 KB treated as complete. Failed partial download saved as `localModelPath`, crashes `initLlama`.

- [x] **#19 `FileSystem.downloadAsync` doesn't support resume** — `src/services/localModelBootstrap.ts:75`
  Failed 90% download of ~2 GB model restarts from zero.

- [x] **#20 `connectToRoom` cleanup races with async connect** — `src/services/deviceSyncService.ts:45-79`
  If cleanup called before mqtt `.then()` resolves, `client` is null and connection leaks.

- [x] **#21 All MQTT errors silently swallowed** — `src/services/deviceSyncService.ts:61`
  Connection failures, auth errors, network drops invisible to user.

- [x] **#22 Module-level regex with `/g` flag shares `lastIndex`** — `src/services/examDateSyncService.ts:90`
  Can skip matches or produce duplicates under concurrent execution.

- [x] **#23 Third-party proxy `r.jina.ai` leaks browsing intent** — `src/services/examDateSyncService.ts:175`
  Also downgrades HTTPS to HTTP in the proxy URL.

- [x] **#24 Unbounded chat history sent to LLM** — `src/components/GuruChatOverlay.tsx:49`
  No sliding window or token limit. Long conversations exceed context limits.

- [x] **#25 Chat message `role: 'guru'` invalid LLM role** — `src/screens/GuruChatScreen.tsx:58`
  APIs expect `'assistant'`. Unless remapped, degrades response quality.

- [x] **#26 `getAllSubjects()` runs on every render** — `src/screens/NotesSearchScreen.tsx:36`
  Synchronous SQLite query not memoized; each keystroke re-executes.

- [x] **#27 `generateGuruPresenceMessages` duplicate parameter** — `src/hooks/useGuruPresence.ts:41`
  `(topicNames, topicNames)` — second arg likely intended to be something else.

- [x] **#28 Health check `setInterval` continues in background** — `src/services/lectureSessionMonitor.ts:166-197`
  Never stopped on force-kill; survives until JS context destroyed.

---

## LOW

- [x] **#29 `transcript.slice(0, 12000)` cuts mid-word** — `src/services/transcriptionService.ts:280`
- [x] **#30 `supportsLectureCapture` always `true`** — `src/services/appLauncher.ts:80` (dead code)
- [x] **#31 ErrorBoundary has no recovery button** — `src/components/ErrorBoundary.tsx`
- [x] **#32 Search debounce timeout not cleared on unmount** — `src/screens/TranscriptHistoryScreen.tsx:177`
- [x] **#33 `handleRefresh` spinner never shows** — `src/screens/TranscriptHistoryScreen.tsx:189-193`
- [x] **#34 PunishmentMode animated loops no cleanup** — `src/screens/PunishmentMode.tsx`
- [x] **#35 DoomscrollInterceptor uses `Math.random()` mock** — `src/screens/DoomscrollInterceptor.tsx`
- [x] **#36 `.apkm` file committed in navigation dir** — `src/navigation/`

---

## DB LAYER

- [x] **#37 `getTopicsDueForReview` query uses `t.*` missing FSRS columns** — `src/db/queries/topics.ts:168-185`
  `mapTopicRow` receives null for FSRS fields, review priority silently ignored.

- [x] **#38 `getNemesisTopics` declared `async` but sync-only** — `src/db/queries/topics.ts:262`
  Returns `Promise<TopicWithProgress[]>` unnecessarily.

---

## SUMMARY

| Severity | Count |
|----------|-------|
| Critical | 4 (1 skipped: API key) |
| High     | 8     |
| Medium   | 16    |
| Low      | 8     |
| DB       | 2     |
| **Total**| **38**|
