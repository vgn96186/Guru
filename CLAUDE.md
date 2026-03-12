# Guru — AI Context File

React Native (Expo) NEET-PG/INICET medical study app for Android.
Target user: ADHD medical student. Stack: Expo SDK 52, expo-sqlite (sync), TypeScript.

---

## Project Structure

```
src/
  screens/          # Full-screen views
  components/       # Reusable UI pieces
  services/         # Business logic (AI, audio, sync, planning)
  db/
    schema.ts       # All CREATE TABLE statements
    database.ts     # getDb() singleton (expo-sqlite)
    migrations.ts   # Versioned migrations + migration_history audit
    queries/        # One file per domain (topics, progress, sessions, aiCache, externalLogs, brainDumps)
    repositories/   # profileRepository, dailyLogRepository — abstraction for stores
  hooks/            # useAppInitialization, useAppBootstrap, useGuruPresence, useResponsive, useFaceTracking, useIdleTimer
  navigation/
    types.ts        # All stack param lists
    RootNavigator   # Root modal stack (overlays BedLock, Punishment, etc.)
    TabNavigator    # 5 tabs: Home, Syllabus, Plan, Stats, Settings
  store/
    useAppStore.ts  # Zustand store — profile, levelInfo, refreshProfile
  types/index.ts    # Re-exports from schemas + remaining interfaces
  schemas/          # Zod schemas — single source of truth (Mood, DailyLog, ContentType, etc.)
  config/
    appConfig.ts    # Exam dates, AI model lists, env vars (DEFAULT_INICET_DATE, GROQ_MODELS)
  constants/
    prompts.ts      # All LLM prompts
    syllabus.ts     # Seeded NEET-PG topic tree
    externalApps.ts # EXTERNAL_APPS array (id matches SupportedMedicalApp keys)
modules/
  app-launcher/     # Custom Expo Module (Android only)
    index.ts        # JS API surface
    android/src/main/java/expo/modules/applauncher/
      AppLauncherModule.kt   # Native function bindings
      OverlayService.kt      # Floating timer bubble + ML Kit face tracking
      RecordingService.kt    # Mic / internal audio (MediaProjection) recording
```

---

## Key Architectural Rules

### Database
- DB access via `expo-sqlite` (`getDb()` from `src/db/database.ts`).
- **Async-only** — prefer `db.runAsync`, `db.getFirstAsync`, `db.getAllAsync` to keep the UI responsive. Sync methods have been removed.
- **Versioned migrations** — `src/db/migrations.ts` uses PRAGMA user_version; `migration_history` table (v59+) provides an audit trail.
- **Repository layer** — `src/db/repositories/` decouples Zustand stores from persistence. Use `profileRepository` and `dailyLogRepository` instead of importing queries directly.
- `nowTs()` from `database.ts` = `Date.now()` (milliseconds epoch).
- `topic_progress` is the central progress table. `status` = `'unseen' | 'seen' | 'reviewed' | 'mastered'`.
- `confidence` (0–3) maps to estimatedConfidence (1–3) from AI.

### App Bootstrap (replaces scripts/ patching)
- **Cold start:** `src/services/appBootstrap.ts` — `runAppBootstrap()` orchestrates DB init, offline queue, background fetch, confidence decay, local model download. Called once from `App.tsx`.
- **Post-mount:** `src/hooks/useAppBootstrap.ts` — profile load, exam date sync, accountability notifications, WakeUp notification routing, AppState listeners. Used by `AppContent`.
- `src/navigation/navigationRef.ts` — shared `navigationRef` for imperative navigation (e.g. WakeUp from notification tap).

### Configuration & Schemas
- **appConfig** (`src/config/appConfig.ts`) — `DEFAULT_INICET_DATE`, `DEFAULT_NEET_DATE` (env: `EXPO_PUBLIC_DEFAULT_*`), `OPENROUTER_FREE_MODELS`, `GROQ_MODELS`, `BUNDLED_GROQ_KEY`. Used by schema, migrations, progress, SettingsScreen, ai/config.
- **Schemas** (`src/schemas/core.ts`) — Zod schemas for Mood, ContentType, DailyLog, TopicStatus, etc. Types derived via `z.infer`. `types/index.ts` re-exports.

### AI Service Routing (`src/services/aiService.ts` and `src/services/ai/`)
- Implementation lives in `src/services/ai/` (config, types, schemas, jsonRepair, llmRouting, generate, medicalSearch, content, planning, chat, notifications, catalyze). `aiService.ts` is a thin barrel re-exporting the public API.
- **Module aliases:** LlmRouter = llmRouting, JsonRepair = jsonRepair, MedicalGrounding = medicalSearch, ContentGeneration = content.
- Local LLM: llama.rn / Qwen via `profile.localModelPath` when `profile.useLocalModel = true`.
- Default local model: **Qwen-2.5-3B** (reliable JSON, good medical reasoning).
- Local Whisper: whisper.rn via `profile.localWhisperPath` when `profile.useLocalWhisper = true`.
- Cloud fallback chain: **Groq** (fastest, bundled key) → OpenRouter free models.
- Groq: `profile.groqApiKey` or bundled `BUNDLED_GROQ_KEY`. Models: llama-3.3-70b-versatile, llama-3.1-8b-instant.
- OpenRouter: free models via `profile.openrouterKey` (Llama 3.3, Qwen 2.5, DeepSeek, Mistral).
- Routing order: **cloud first** (Groq → OpenRouter), then local fallback. Groq is the primary AI backend.
- `generateJSONWithRouting()` — for structured JSON output.
- `generateTextWithRouting()` — for free-text output.

### API Key Field Names
```typescript
profile.openrouterApiKey  // = legacy field (kept for backward compatibility, not actively used)
profile.openrouterKey     // = OpenRouter key for free model fallbacks
profile.groqApiKey        // = Groq API key (falls back to BUNDLED_GROQ_KEY if empty)
```

---

## Lecture / Audio Transcription — Two Separate Flows

### Flow A: External App Recording (background, via native module)
**Trigger:** User taps a lecture app in `ExternalToolsRow` on HomeScreen.
1. `ExternalToolsRow` → `launchMedicalApp(app.id)` in `src/services/appLauncher.ts`
2. `launchMedicalApp` → requests MediaProjection or mic permission → `startRecording(packageName)` → `launchApp(packageName)` → `showOverlay(appName)` → logs to `external_app_logs` via `startExternalAppSession()`
3. Native `RecordingService.kt` records audio in background as `.m4a` in `context.filesDir`
4. Native `OverlayService.kt` shows draggable floating timer bubble (purple ring = no face tracking, green/orange/red = ML Kit face states)
5. User returns to Guru → `HomeScreen` AppState listener fires → `checkForReturnedSession()` → stops recording + overlay → shows `LectureReturnSheet`
6. `LectureReturnSheet` → `transcribeWithGroq()` or `transcribeWithLocalWhisper()` from `src/services/transcriptionService.ts` → structured `LectureAnalysis` → `markTopicsFromLecture()` updates `topic_progress` DB
7. User taps "Mark as Studied" → `markTopicsFromLecture()` + `addXp()` + optional quiz via `catalyzeTranscript()`

### Flow B: In-App Recording (LectureModeScreen "Hostage Mode")
**Trigger:** User navigates to `LectureMode` screen (phone stays open, tablet runs lecture).
1. Toggle "Auto-Scribe" → starts `Audio.Recording` loop (3-minute chunks)
2. Each chunk → `processRecording()` → `transcribeWithGroq()` or local Whisper → `LectureAnalysis`
3. Calls `markTopicsFromLecture(getDb(), analysis.topics, analysis.estimatedConfidence, analysis.subject)` to update DB
4. Saves formatted note: `[Subject] summary\n• concept1\n• concept2`
5. Proof-of-Life check every 15 min — user must type what professor just said

### Key transcription files
- `src/services/transcriptionService.ts` — `transcribeWithGroq()`, `transcribeWithLocalWhisper()`, `transcribeWithOpenAI()`, `markTopicsFromLecture()`
- `src/services/aiService.ts` — `transcribeAndSummarizeAudio()` (legacy, returns plain text only — do NOT use for knowledge base updates), `catalyzeTranscript()` (structured analysis from transcript text)
- `src/db/queries/aiCache.ts` — `saveLectureNote()` (saves raw note text)

### `markTopicsFromLecture()` matching strategy (5 levels)
1. Exact match within detected subject
2. LIKE contains within subject
3. Reverse contains within subject (DB name inside AI topic string)
4. Cross-subject exact match fallback
5. Cross-subject LIKE fallback
Also marks parent topics of matched topics as 'seen'.

---

## Native Module: `modules/app-launcher`

JS API (`modules/app-launcher/index.ts`):
```typescript
launchApp(packageName)           // Intent-based app launch
isAppInstalled(packageName)      // Check installation
getAppUid(packageName)           // For audio capture filtering
requestMediaProjection()         // System dialog for internal audio capture (Android 10+)
startRecording(targetPackage)    // Starts RecordingService (mic or internal)
stopRecording()                  // Returns .m4a path
deleteRecording(path)            // Cleanup after transcription
canDrawOverlays()                // Check SYSTEM_ALERT_WINDOW
requestOverlayPermission()       // Open settings
showOverlay(appName, faceTracking) // Start OverlayService foreground
hideOverlay()                    // Stop OverlayService
```

OverlayService bubble colors: purple=neutral, green=focused, orange=drowsy/distracted, red=absent (sends notification after 15s absent).

---

## Navigation Structure

### Root Stack (modal overlays — always on top)
`RootStackParamList`: PunishmentMode, BedLock, DoomscrollInterceptor, BreakEnforcer, DeviceLink, DoomscrollGuide, Lockdown, CheckIn, Tabs, BrainDumpReview, SleepMode, WakeUp, LocalModel

### Tabs (inside `Tabs` route)
HomeTab, SyllabusTab, PlanTab, StatsTab, SettingsTab

### HomeStack (within HomeTab)
`HomeStackParamList`: Home, Session, LectureMode, MockTest, Review, NotesSearch, BossBattle, Inertia, ManualLog, StudyPlan, DailyChallenge, FlaggedReview

### SyllabusStack
`SyllabusStackParamList`: Syllabus, TopicDetail

---

## Database Schema Summary

| Table | Purpose |
|-------|---------|
| `subjects` | 19 NEET-PG subjects (seeded, static) |
| `topics` | Topic tree with `parent_topic_id`, `subject_id`, `inicet_priority` |
| `topic_progress` | Per-topic status/confidence/FSRS fields — the progress KB |
| `sessions` | Study session records with XP, mood, duration |
| `daily_log` | One row per day — minutes, XP, mood |
| `ai_cache` | Cached AI content per topic+contentType (keypoints/quiz/story/mnemonic/teach_back/error_hunt/detective) |
| `lecture_notes` | Free-text notes saved during lectures |
| `user_profile` | Single row (id=1) — all user settings and API keys |
| `brain_dumps` | Quick capture notes |
| `external_app_logs` | Records of lecture app sessions (`returned_at NULL` = active session) |

---

## Zustand Store (`src/store/useAppStore.ts`)
- `profile: UserProfile | null` — full user profile from DB
- `levelInfo` — computed from `totalXp`
- `refreshProfile()` — re-reads profile from DB into store

Always call `refreshProfile()` after XP or profile mutations so UI reflects changes.

---

## Content Types & AI Cards
`ContentType`: `keypoints | quiz | story | mnemonic | teach_back | error_hunt | detective`
- Fetched via `fetchContent(topic, contentType)` in `aiService.ts`
- Cached in `ai_cache` table (one row per topic+type)
- All schemas are Zod-validated in `aiService.ts`

---

## ADHD-specific UX Patterns
- Proof-of-Life checks every 15 min in Lecture Mode
- Doomscroll detection via AppState changes (vibrate + notification)
- Inertia screen — commitment ladder before quitting
- PunishmentMode / BedLock — strict mode lockout screens
- Body-doubling via device sync (Guru "studies alongside" the user)
- Break enforcer — mandatory breaks with quiz content
- Face tracking in overlay — drowsy/absent detection

---

## Device Sync (`src/services/deviceSyncService.ts`)
- `connectToRoom(syncCode, callback)` — subscribes to sync messages
- `sendSyncMessage(msg)` — broadcasts to paired device
- Message types: `LECTURE_STARTED`, `LECTURE_STOPPED`, `LECTURE_RESUMED`, `BREAK_STARTED`, `DOOMSCROLL_DETECTED`
- Used in HomeScreen and LectureModeScreen

---

## Known Naming Quirks / Gotchas
- `profile.openrouterApiKey` = legacy field (kept for backward compatibility, not actively used in routing).
- `profile.openrouterKey` = actual OpenRouter key for free model fallbacks.
- `transcribeAndSummarizeAudio()` in `aiService.ts` is a legacy function returning plain text — it does NOT call `markTopicsFromLecture()`. Use `transcribeWithGroq()` from `transcriptionService.ts` instead.
- `external_app_logs` with `returned_at IS NULL` = user is currently in a lecture app.
- `EXTERNAL_APPS[].id` values exactly match `SupportedMedicalApp` union type keys — safe to cast `app.id as SupportedMedicalApp`.
- `ai_cache` stores both AI-generated content cards AND lecture notes (via `saveLectureNote()`).
- DB `confidence` column (0–3 int) vs `LectureAnalysis.estimatedConfidence` (1–3 int) — compatible, pass directly.
- `useLocalWhisper` / `localWhisperPath` on profile = on-device Whisper model (whisper.rn). Separate from `useLocalModel` / `localModelPath` which is the LLM (llama.rn).
- The `scripts/archive/` folder contains deprecated regex-based patch scripts. All their changes are already in source. Do not run them or create new patch scripts.
