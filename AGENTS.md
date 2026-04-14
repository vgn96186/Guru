# Guru — AI Context File

React Native (Expo) NEET-PG/INICET medical study app for Android.
Target user: ADHD medical student. Stack: Expo SDK 54, expo-sqlite (async), TypeScript.

---

## User — Who This App Is For

**The user is a medical student (Vishnu) preparing for NEET-PG and INICET.**

### Goals

- **Primary:** Sub-2000 rank in NEET-PG — either the upcoming attempt or next year's.
- **Secondary:** Strong rank in INICET (which serves as practice and a real exam).
- Both exams require genuine mastery of all 19 NEET-PG subjects, not just surface-level watching.

### Current Planning Assumptions (last manually updated: April 2026)

- **DBMCI One live batch:** Not yet started — 0 lectures watched. Will begin soon.
- **BTR (Back to Roots) batch:** Partially completed — several subjects done, a few remaining.
- Watching lecture videos alone is not sufficient for the rank target. Topics must go through the full mastery pipeline: **watch → quiz → review → confirm mastery**.
- The user has ADHD — motivation and consistency are variable. Some days are lazy days. The plan must adapt, not punish.

### What "Thorough" Means for Sub-2000

A topic counts as _properly learned_ only when it has gone through **all 4 stages**:

1. **Watch** — Lecture video covered (status: `seen`)
2. **Quiz** — At least one MCQ/content-card session done (confidence ≥ 1)
3. **Review** — FSRS-scheduled spaced repetition session done (status: `reviewed`)
4. **Mastered** — Confidence ≥ 3, FSRS stability high (status: `mastered`)

Seeing a topic = 0 points toward the exam. Mastering it = 1 point.

### Planning Philosophy

- The dynamic plan must be **exam-date-driven**: work backwards from INICET / NEET-PG to assign a daily pace that is actually achievable.
- When the user falls behind (lazy day, missed sessions), the plan **redistributes** the backlog over remaining days — it never just drops missed work silently.
- Review backlog (overdue FSRS topics) takes priority over new topics. When the overdue pile exceeds ~4 days of capacity, new-topic intake is automatically throttled.
- The lecture schedule (DBMCI One or BTR) determines **which subject's new topics appear first** in the queue — the plan stays in sync with live classes so the user can watch a lecture and immediately do the associated quiz/review in Guru.
- On lazy/short days, the plan should offer a **minimal-effort fallback**: quick reviews + highest-yield MCQs only. Do not demand a full session on a bad day.

### Exam Dates Context

- INICET is roughly every 6 months (January and July cycles).
- NEET-PG is annual.
- All planning horizons and urgency levels are computed from these dates.

---

## Project Structure

```
src/
  screens/          # Full-screen views
  components/       # Reusable UI pieces
  services/         # Business logic (AI, audio, sync, planning, lecture pipeline)
  db/
    schema.ts       # All CREATE TABLE statements
    database.ts     # getDb() singleton (expo-sqlite)
    migrations.ts   # Versioned migrations + migration_history audit
    queries/        # One file per domain (topics, progress, sessions, aiCache, externalLogs, brainDumps)
    repositories/   # profileRepository, dailyLogRepository — abstraction for stores
  hooks/            # Bootstrap, AppState, lecture recovery, responsive/layout hooks
  navigation/
    types.ts        # All stack param lists
    RootNavigator   # Root modal stack (overlays BedLock, Punishment, etc.)
    TabNavigator    # 4 tabs: Home, Syllabus, Chat, Menu
  store/
    useAppStore.ts  # Zustand store — profile, levelInfo, refreshProfile
  types/index.ts    # Re-exports from schemas + remaining interfaces
  schemas/          # Zod schemas — single source of truth (Mood, DailyLog, ContentType, etc.)
  config/
    appConfig.ts    # Exam dates, provider/model config, env-driven defaults
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

- **Cold start:** `src/services/appBootstrap.ts` — `runAppBootstrap()` orchestrates DB init, backup restore checks, offline queue processing, background fetch registration, confidence decay, and local model bootstrap. Called once from `App.tsx`.
- **Post-mount:** `src/hooks/useAppBootstrap.ts` — profile load, exam date sync, notification refresh, WakeUp routing, provider validation, and auto-backup checks. Used by `AppContent`.
- `src/navigation/navigationRef.ts` — shared `navigationRef` for imperative navigation (e.g. WakeUp from notification tap).

### Configuration & Schemas

- **appConfig** (`src/config/appConfig.ts`) — exam dates, provider model lists, OAuth/client IDs, and env-driven defaults. Release builds do **not** ship bundled API keys.
- **Schemas** (`src/schemas/core.ts`) — Zod schemas for Mood, ContentType, DailyLog, TopicStatus, etc. Types derived via `z.infer`. `types/index.ts` re-exports.

### AI Service Routing (`src/services/aiService.ts` and `src/services/ai/`)

- Implementation lives in `src/services/ai/` (config, types, schemas, jsonRepair, llmRouting, generate, medicalSearch, content, planning, chat, notifications, catalyze). `aiService.ts` is a thin barrel re-exporting the public API.
- **Module aliases:** LlmRouter = llmRouting, JsonRepair = jsonRepair, MedicalGrounding = medicalSearch, ContentGeneration = content.
- Local LLM: `local-llm` module with **Gemma 4 E4B** (default) or Gemma 4 E2B via `profile.localModelPath` when `profile.useLocalModel = true`.
- Default local model: **Gemma 4 E4B** (128K context, native function calling, advanced multi-step reasoning, released April 2026).
- Local Whisper: whisper.rn via `profile.localWhisperPath` when `profile.useLocalWhisper = true`.
- Cloud routing is **provider-order driven**, using `profile.providerOrder` / `disabledProviders` with a broad provider set: ChatGPT, GitHub Copilot, GitLab Duo, Poe, OpenRouter, Groq, Qwen, AgentRouter, GitHub Models, Kilo, DeepSeek, Gemini, and Cloudflare.
- Explicit model ids like `groq/...`, `chatgpt/...`, `github_copilot/...`, `gitlab_duo/...`, `poe/...`, `gemini/...`, `cf/...`, `qwen/...` short-circuit to the selected provider.
- OpenRouter still uses `profile.openrouterKey`; `profile.openrouterApiKey` is legacy-only.
- Groq still uses `profile.groqApiKey`, but release builds do not rely on bundled Groq credentials.
- `generateJSONWithRouting()` — for structured JSON output.
- `generateTextWithRouting()` — for free-text output.

### API Key Field Names

```typescript
profile.openrouterApiKey; // = legacy field (kept for backward compatibility, not actively used)
profile.openrouterKey; // = OpenRouter key for free model fallbacks
profile.groqApiKey; // = Groq API key
```

### Code conventions (exports, imports, UI primitives)

- **Imports:** Use paths relative to the current file under `src/` (e.g. `../components/...`). `tsconfig` `@/*` maps to the **repo root** for TypeScript only; Metro and Jest do **not** resolve that alias for app bundles—do not add new `@/…` imports in `src/` unless you also wire Babel + Jest the same way.
- **Screens:** Default-export screen components (`export default function FooScreen`) so navigators can pass `component={FooScreen}`.
- **Shared / leaf UI:** Prefer named exports from cohesive modules where it helps refactors; avoid deep barrel chains that hide circular imports.
- **UI primitives:** Prefer `src/components/primitives/` (`LinearText` with `variant`/`tone`, `LinearSurface`, `LinearButton`, `LinearIconButton`, `LinearTextInput`, `EmptyState`, etc.) and `ScreenHeader` for standard chrome instead of raw `Text` / `Pressable` with one-off styles. Reasonable exceptions: custom gestures, canvas/special layouts, or third-party components that require a specific host.
- **Workspace:** `.gitattributes` keeps text files normalized (LF). **PR checks:** `npm run verify:ci` (lint + unit tests + logic coverage). Optional stricter local/CI pass: `npm run verify:ci:with-format` (adds `format:check:scoped` on `src/`, `modules/`, `App.tsx`, `index.ts`). Full strict: `npm run verify:strict` (includes `typecheck`).

---

## Lecture / Audio Transcription — Two Separate Flows

### Flow A: External App Recording (background, via native module)

**Trigger:** User taps a lecture app in `ExternalToolsRow` on HomeScreen.

1. `ExternalToolsRow` → `launchMedicalApp(app.id)` in `src/services/appLauncher.ts`
2. `launchMedicalApp` → requests mic + overlay permission → `startRecording(''[, liveTranscriptionKey, insightGenerationKey])` → `launchApp(packageName)` → `showOverlay(appName, faceTracking, pomodoroEnabled, pomodoroIntervalMinutes)` → logs to `external_app_logs` via `startExternalAppSession()`
3. Native `RecordingService.kt` records audio in background as `.m4a` in `context.filesDir`
4. Native `OverlayService.kt` shows draggable floating timer bubble (purple ring = no face tracking, green/orange/red = ML Kit face states)
5. User returns to Guru → lecture recovery flow stops recording + overlay → shows `LectureReturnSheet`
6. `LectureReturnSheet` / recovery pipeline → `transcribeAudio({ audioFilePath })` from `src/services/transcriptionService.ts` → structured `LectureAnalysis` → `markTopicsFromLecture()` updates `topic_progress` DB
7. User taps "Mark as Studied" → `markTopicsFromLecture()` + `addXp()` + optional quiz via `catalyzeTranscript()`

### Flow B: In-App Recording (LectureModeScreen "Hostage Mode")

**Trigger:** User navigates to `LectureMode` screen (phone stays open, tablet runs lecture).

1. Toggle "Auto-Scribe" → starts `Audio.Recording` loop (3-minute chunks)
2. Each chunk → `processRecording()` → `transcribeAudio({ audioFilePath })` → `LectureAnalysis`
3. Calls `markTopicsFromLecture(getDb(), analysis.topics, analysis.estimatedConfidence, analysis.subject)` to update DB
4. Saves formatted note: `[Subject] summary\n• concept1\n• concept2`
5. Proof-of-Life check every 15 min — user must type what professor just said

### Key transcription files

- `src/services/transcriptionService.ts` — public barrel for `transcribeAudio()`, `analyzeTranscript()`, `markTopicsFromLecture()`
- `src/services/transcription/` — implementation for audio transcription, transcript analysis, note generation, and matching
- `src/services/aiService.ts` — barrel re-export for AI generation helpers including `catalyzeTranscript()`
- `src/db/queries/aiCache.ts` — `saveLectureNote()` / transcript persistence into `lecture_notes`

### `markTopicsFromLecture()` matching strategy (5 levels)

1. Exact match within detected subject
2. LIKE contains within subject
3. Reverse contains within subject (DB name inside AI topic string)
4. Cross-subject exact match fallback
5. Cross-subject LIKE fallback
   Also marks parent topics of matched topics as 'seen'.

---

## Native Module: `modules/app-launcher`

Selected JS API (`modules/app-launcher/index.ts`, not exhaustive):

```typescript
launchApp(packageName); // Intent-based app launch
isAppInstalled(packageName); // Check installation
getAppUid(packageName); // For audio capture filtering
requestMediaProjection(); // System dialog for internal audio capture (Android 10+)
startRecording(targetPackage, liveTranscriptionKey?, insightGenerationKey?); // Starts RecordingService
stopRecording(); // Returns .m4a path
deleteRecording(path); // Cleanup after transcription
canDrawOverlays(); // Check SYSTEM_ALERT_WINDOW
requestOverlayPermission(); // Open settings
showOverlay(appName, faceTracking, pomodoroEnabled, pomodoroIntervalMinutes); // Start OverlayService foreground
hideOverlay(); // Stop OverlayService
listPublicBackups(); // Restore/backup support
copyFileFromPublicBackup(filename, destPath); // Restore helper
hasAllFilesAccess(); // Android scoped storage helper
pickFolderAndScan(); // Manual recording import helper
```

OverlayService bubble colors: purple=neutral, green=focused, orange=drowsy/distracted, red=absent (sends notification after 15s absent).

---

## Navigation Structure

### Root Stack (modal overlays — always on top)

`RootStackParamList`: PunishmentMode, BedLock, DoomscrollInterceptor, BreakEnforcer, DoomscrollGuide, Lockdown, CheckIn, Tabs, BrainDumpReview, SleepMode, WakeUp, LocalModel, PomodoroQuiz

### Tabs (inside `Tabs` route)

HomeTab, SyllabusTab, ChatTab, MenuTab

### HomeStack (within HomeTab)

`HomeStackParamList`: Home, Session, LectureMode, MockTest, Review, BossBattle, Inertia, ManualLog, DailyChallenge, FlaggedReview, GlobalTopicSearch

### SyllabusStack

`SyllabusStackParamList`: Syllabus, TopicDetail

### MenuStack

`MenuStackParamList`: StudyPlan, Stats, Flashcards, MindMap, Settings, DeviceLink, NotesHub, NotesSearch, ManualNoteCreation, TranscriptHistory, RecordingVault, ImageVault, NotesVault, TranscriptVault, QuestionBank, FlaggedContent

---

## Database Schema Summary

- Core study tables: `subjects`, `topics`, `topic_progress`, `sessions`, `daily_log`
- AI and lecture tables: `ai_cache`, `lecture_notes`, `lecture_learned_topics`, `question_bank`, `content_fact_checks`, `user_content_flags`
- Planning and profile tables: `user_profile`, `daily_agenda`, `plan_events`, `lecture_schedule_progress`, `external_app_logs`, `brain_dumps`, `offline_ai_queue`
- Chat and media tables: `guru_chat_threads`, `guru_chat_session_memory`, `chat_history`, `generated_study_images`, `mind_maps`, `mind_map_nodes`, `mind_map_edges`

---

## Zustand Store (`src/store/useAppStore.ts`)

- `profile: UserProfile | null` — full user profile from DB
- `levelInfo` — computed from `totalXp`
- `refreshProfile()` — re-reads profile from DB into store

Always call `refreshProfile()` after XP or profile mutations so UI reflects changes.

---

## Content Types & AI Cards

`ContentType`: `keypoints | must_know | quiz | story | mnemonic | teach_back | error_hunt | detective | manual | socratic | flashcards`

- Fetched via `fetchContent(topic, contentType)` from the AI service barrel
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

## Testing

- **Strategy:** `docs/TESTING_STRATEGY.md` — Jest **logic allowlist** (`jest.unit.logic.config.js`, `npm run test:unit:coverage:logic`) + **Detox** for UI/native (`e2e/`, `npm run detox:test:critical`).
- **Genymotion Workflow (Metro + Debug):**
  1. `npm start` (Metro bundler)
  2. `npm run detox:build:android:genymotion:dev` (Build debug binaries)
  3. `npm run detox:test:critical:genymotion:dev` (Run critical tests)
- **CI-style check:** `npm run verify:ci` (lint, unit tests, logic coverage gate). Optional: `npm run verify:ci:with-format` (scoped Prettier). `npm run verify:strict` runs typecheck + the same tests and coverage gate.

---

## Self-Improving

Use `~/self-improving/` for execution-improvement memory: preferences, workflow lessons, style patterns, and corrections that should compound across tasks.

Before non-trivial work:

- Read `~/self-improving/memory.md`
- List available files from `~/self-improving/domains/` and `~/self-improving/projects/`
- Read only the smallest relevant domain or project files

When writing memory:

- Factual project history belongs in repo docs or dated notes
- Explicit corrections go to `~/self-improving/corrections.md`
- Reusable global preferences go to `~/self-improving/memory.md`
- Domain-specific lessons go to `~/self-improving/domains/<domain>.md`
- Project-only overrides go to `~/self-improving/projects/<project>.md`

---

## Known Naming Quirks / Gotchas

- `profile.openrouterApiKey` = legacy field (kept for backward compatibility, not actively used in routing).
- `profile.openrouterKey` = actual OpenRouter key for free model fallbacks.
- `src/services/transcriptionService.ts` is a barrel. New code should think in terms of `transcribeAudio()` / `analyzeTranscript()` / `markTopicsFromLecture()`.
- `external_app_logs` with `returned_at IS NULL` = user is currently in a lecture app.
- `EXTERNAL_APPS[].id` values exactly match `SupportedMedicalApp` union type keys — safe to cast `app.id as SupportedMedicalApp`.
- `saveLectureNote()` writes to `lecture_notes`, not `ai_cache`.
- DB `confidence` column (0–3 int) vs `LectureAnalysis.estimatedConfidence` (1–3 int) — compatible, pass directly.
- `useLocalWhisper` / `localWhisperPath` on profile = on-device Whisper model (whisper.rn). Separate from `useLocalModel` / `localModelPath` which is the LLM (local-llm module with Gemma 3n/4).
- Release builds do not ship bundled cloud API keys; provider access comes from user-entered keys or OAuth connections in Settings.
- The `scripts/archive/` folder contains deprecated regex-based patch scripts. All their changes are already in source. Do not run them or create new patch scripts.
