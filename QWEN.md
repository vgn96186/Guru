# Guru — QWEN Context File

**React Native (Expo) NEET-PG/INICET medical study app for Android.**

---

## Project Overview

Guru is a **NEET-PG / INICET** medical entrance exam study app built for a user with ADHD. It combines lecture tracking, spaced repetition (FSRS), AI-powered study assistance, and gamification (XP, levels, streaks) to help medical students master all 19 NEET-PG subjects.

### Target User

Medical student (Vishnu) preparing for NEET-PG (sub-2000 rank) and INICET. Uses **DBMCI One** and **BTR (Back to Roots)** lecture batches. ADHD-aware design with features like proof-of-life checks, doomscroll detection, punishment mode, and adaptive daily plans.

### Technology Stack

| Layer             | Technology                                                                         |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Framework**     | Expo SDK 54, React Native 0.81.5, React 19.1.0                                     |
| **Language**      | TypeScript (~5.9.2) with strict mode                                               |
| **Database**      | `expo-sqlite` (SQLite, WAL mode, versioned migrations)                             |
| **State**         | Zustand (`src/store/useAppStore.ts`)                                               |
| **Navigation**    | React Navigation v7 (native stack + bottom tabs)                                   |
| **AI**            | Groq (primary), OpenRouter, Gemini, Cloudflare, local LLM (llama.rn with MedGemma) |
| **Speech**        | Whisper (cloud Groq/local whisper.rn)                                              |
| **Testing**       | Jest (unit), Detox (E2E)                                                           |
| **Styling**       | Custom theme (`src/theme/linearTheme.ts`) + React Native StyleSheet                |
| **Fonts**         | Inter (400–900 via @expo-google-fonts)                                             |
| **Native Module** | `modules/app-launcher` (Kotlin — floating overlay, face tracking, audio recording) |

---

## Directory Structure

```
C:\Guru\
├── App.tsx                    # Root component, bootstrap orchestration
├── index.ts                   # Entry point
├── app.json / app.config.js   # Expo configuration
├── package.json               # Dependencies, scripts, engines
├── tsconfig.json              # TypeScript config (strict, isolatedModules)
├── src/
│   ├── components/            # Reusable UI primitives
│   ├── screens/               # Full-screen views (HomeScreen, GuruChatScreen, etc.)
│   ├── services/              # Business logic (AI, transcription, planning, sync)
│   │   └── ai/                # AI submodules (chat, content, medicalSearch, llmRouting, etc.)
│   ├── db/                    # Database layer
│   │   ├── database.ts        # getDb() singleton, init, migrations, seeding
│   │   ├── schema.ts          # CREATE TABLE statements
│   │   ├── migrations.ts      # Versioned migrations (PRAGMA user_version)
│   │   ├── queries/           # One file per domain (topics, progress, sessions, aiCache)
│   │   └── repositories/      # Abstraction layer (profileRepository, dailyLogRepository)
│   ├── hooks/                 # Custom hooks (useAppBootstrap, useFaceTracking, etc.)
│   ├── navigation/            # RootNavigator, TabNavigator, types.ts
│   ├── store/                 # Zustand stores (useAppStore, useSessionStore)
│   ├── types/                 # TypeScript types (re-exports from schemas)
│   ├── schemas/               # Zod schemas (core.ts — single source of truth)
│   ├── config/                # appConfig.ts, bundledEnv.ts
│   └── constants/             # syllabus.ts, prompts.ts, externalApps.ts, theme.ts
├── modules/
│   └── app-launcher/          # Custom Expo Module (Android native Kotlin)
│       ├── index.ts           # JS API surface
│       ├── android/src/main/java/expo/modules/applauncher/
│       │   ├── AppLauncherModule.kt
│       │   ├── OverlayService.kt    # Floating timer + ML Kit face tracking
│       │   └── RecordingService.kt  # Mic / internal audio recording
├── e2e/                       # Detox E2E tests
├── scripts/                   # Build/utility scripts
└── docs/                      # Architecture, testing strategy, QA docs
```

---

## Building and Running

### Prerequisites

- **Node.js:** 20.20.1 (managed via `.nvmrc`)
- **Android SDK:** Set `ANDROID_SDK_ROOT` or `ANDROID_HOME`
- **Java JDK:** Required for Android builds

### Development

```bash
# Install dependencies
npm install

# Start Metro bundler (development)
npm start

# Start fresh (clears Metro cache)
npm run start:fresh

# Run on Android device/emulator (auto-builds dev client)
npm run android

# Start Metro + open dev client manually
npm run android:metro   # Start Metro on port 8081
npm run android:open    # Open dev client on device
```

### Building APK

```bash
# Debug APK for physical device (arm64-v8a)
npm run android:apk:device

# Debug APK for emulator (x86_64)
npm run android:apk:emu

# Release APK for physical device
npm run android:apk:release:device
```

### Testing

```bash
# Unit tests (all)
npm test
# or
npm run test:unit

# Unit tests with coverage
npm run test:unit:coverage

# Logic-only coverage (business logic subset)
npm run test:unit:coverage:logic

# E2E tests (Detox) — Genymotion
npm run detox:build:android:genymotion:dev
npm run detox:test:critical:genymotion:dev

# E2E tests — Emulator
npm run detox:build:android:emu:debug
npm run detox:test:android:emu:debug
```

### Verification

```bash
# Full CI check (lint + unit tests + logic coverage)
npm run verify:ci

# Strict (includes typecheck)
npm run verify:strict

# Individual checks
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier
npm run format:check # Prettier check
```

### Utility

```bash
# Regenerate REPO_MAP.md
npm run repo-map
```

---

## Development Conventions

### Code Style

- **TypeScript strict mode** enabled. No `any` without reason (`@typescript-eslint/no-explicit-any` is warn-level).
- **Prettier** for formatting (trailing commas, single quotes, 2-space indent).
- **ESLint** with `typescript-eslint`, `react-hooks`, and `jest` plugins.
- **Lint-staged** pre-commit hook: auto-fixes and formats staged files.
- **Unused vars:** Prefix with `_` to suppress warnings (`argsIgnorePattern: '^_'`).
- **No `require()` in TS files** — use `import` statements.

### Database Conventions

- **Async-only** — prefer `db.runAsync`, `db.getFirstAsync`, `db.getAllAsync`. Sync methods removed.
- **`nowTs()`** = `Date.now()` (milliseconds epoch).
- **`runInTransaction()`** for atomic multi-statement writes.
- **Repository layer** — use `profileRepository` and `dailyLogRepository` instead of importing queries directly.
- **`topic_progress`** is the central progress table. Status: `'unseen' | 'seen' | 'reviewed' | 'mastered'`.
- **Confidence** (0–3) maps to `estimatedConfidence` (1–3) from AI.
- **WAL checkpoint** before copying DB: `await walCheckpoint()`.

### Navigation

```typescript
// Root Stack (modal overlays — always on top)
RootStackParamList: (PunishmentMode,
  BedLock,
  DoomscrollInterceptor,
  BreakEnforcer,
  DeviceLink,
  DoomscrollGuide,
  Lockdown,
  CheckIn,
  Tabs,
  BrainDumpReview,
  SleepMode,
  WakeUp,
  LocalModel);

// Tabs (5 tabs)
TabParamList: (HomeTab, SyllabusTab, ChatTab, MenuTab);

// Home Stack (inside HomeTab)
HomeStackParamList: (Home,
  Session,
  LectureMode,
  MockTest,
  Review,
  NotesSearch,
  BossBattle,
  Inertia,
  ManualLog,
  StudyPlan,
  DailyChallenge,
  FlaggedReview);
```

- Use `navigationRef` from `src/navigation/navigationRef.ts` for imperative navigation.
- Screen route params are typed via `RouteProp<ParamList, 'ScreenName'>`.

### Zustand Store

```typescript
import { useAppStore } from '../store/useAppStore';

const profile = useAppStore((s) => s.profile);
const refreshProfile = useAppStore((s) => s.refreshProfile);
```

- **Always** call `refreshProfile()` after XP or profile mutations so UI reflects changes.
- Profile fields have optimistic update with automatic rollback on DB failure.
- `bootPhase`: `'booting' | 'calming' | 'settling' | 'done'` — controls loading overlay.

### AI Service Routing

- **Primary:** Groq (fastest, bundled key fallback). Models: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`.
- **Fallback chain:** Groq → OpenRouter free models → local LLM.
- **Local LLM:** `llama.rn` with MedGemma 4B when `profile.useLocalModel = true`.
- **API key fields on profile:**
  - `profile.groqApiKey` — Groq key (falls back to `BUNDLED_GROQ_KEY`).
  - `profile.openrouterKey` — OpenRouter key for free model fallbacks.
  - `profile.openrouterApiKey` — legacy field (not actively used).
- `generateJSONWithRouting()` — for structured JSON output.
- `generateTextWithRouting()` — for free-text output.

### Lecture Transcription — Two Flows

**Flow A: External App Recording (background)**

1. User taps lecture app in `ExternalToolsRow` → `launchMedicalApp()`
2. Native `RecordingService.kt` records audio as `.m4a`
3. Native `OverlayService.kt` shows floating timer bubble (with face tracking)
4. User returns to Guru → `LectureReturnSheet` appears
5. Transcription via `transcribeWithGroq()` or `transcribeWithLocalWhisper()`
6. `markTopicsFromLecture()` updates `topic_progress` DB

**Flow B: In-App Recording (LectureModeScreen)**

1. Toggle "Auto-Scribe" → starts `Audio.Recording` loop (3-minute chunks)
2. Each chunk → `processRecording()` → transcription → DB update
3. Proof-of-Life check every 15 min

### ADHD-Specific UX Patterns

- **Proof-of-Life** checks every 15 min in Lecture Mode
- **Doomscroll detection** via AppState changes (vibrate + notification)
- **Inertia screen** — commitment ladder before quitting
- **PunishmentMode / BedLock** — strict mode lockout screens
- **Body-doubling** via device sync (Guru "studies alongside" the user)
- **Break enforcer** — mandatory breaks with quiz content
- **Face tracking** in overlay — drowsy/absent detection (ML Kit)

### Testing Practices

- **Unit tests:** Colocated with source as `*.unit.test.ts` or `*.unit.test.tsx`.
- **Test files are permanent artifacts** — do not delete after creation.
- **Jest config:** `jest.unit.config.js` (all unit tests), `jest.unit.logic.config.js` (business logic subset).
- **Detox E2E:** Critical path tests in `e2e/critical-path.test.ts`.
- **Mock DB:** Use `better-sqlite3` for Node-based integration tests (`src/db/testing/`).

### Configuration

- **`src/config/appConfig.ts`** — exam dates, AI model lists, env-driven values.
- **`DEFAULT_INICET_DATE`** / **`DEFAULT_NEET_DATE`** — override via `EXPO_PUBLIC_DEFAULT_*`.
- **No bundled API keys** in release builds. Users enter keys in Settings after fresh install.
- **`.env`** → `scripts/generate-bundled-env.js` → `src/config/bundledEnv.ts` (dev-only).

### Git Conventions

- Run `npm run repo-map` after adding/removing source files.
- Commit messages: clear, concise, focused on "why" not "what".
- Review recent commits (`git log -n 3`) for style before committing.

---

## Key Files Quick Reference

| File                                   | Purpose                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `App.tsx`                              | Root component, bootstrap orchestration, font loading                  |
| `src/services/appBootstrap.ts`         | Cold start: DB init, offline queue, background fetch, model download   |
| `src/hooks/useAppBootstrap.ts`         | Post-mount: profile load, exam sync, notifications, AppState listeners |
| `src/db/database.ts`                   | `getDb()` singleton, `initDatabase()`, `runInTransaction()`            |
| `src/store/useAppStore.ts`             | Zustand store — profile, levelInfo, refreshProfile                     |
| `src/services/aiService.ts`            | AI service barrel — re-exports from `src/services/ai/`                 |
| `src/services/ai/medicalSearch.ts`     | Medical image search (Wikimedia, Open i, DuckDuckGo, Brave)            |
| `src/services/ai/chat.ts`              | Guru Chat streaming with grounded medical sources                      |
| `src/services/transcriptionService.ts` | Lecture transcription (Groq/Whisper/OpenAI)                            |
| `src/navigation/RootNavigator.tsx`     | Root modal stack                                                       |
| `src/navigation/TabNavigator.tsx`      | 5-tab navigator                                                        |
| `src/screens/GuruChatScreen.tsx`       | AI chat screen (largest screen, ~3300 lines)                           |
| `src/screens/HomeScreen.tsx`           | Dashboard with daily plan, quick actions                               |
| `src/screens/LectureModeScreen.tsx`    | In-app lecture recording + transcription                               |
| `src/components/ResilientImage.tsx`    | Rate-limit-resilient image component (429 retry + dedup)               |
| `modules/app-launcher/`                | Native Kotlin module (overlay, recording, face tracking)               |
| `src/config/appConfig.ts`              | Exam dates, AI model lists, env vars                                   |
| `src/constants/syllabus.ts`            | Seeded NEET-PG topic tree (19 subjects)                                |

---

## Known Quirks / Gotchas

1. **`profile.openrouterApiKey`** = legacy field (not actively used in routing).
2. **`profile.openrouterKey`** = actual OpenRouter key for free model fallbacks.
3. **`transcribeAndSummarizeAudio()`** in `aiService.ts` is legacy — returns plain text only, does NOT call `markTopicsFromLecture()`. Use `transcribeWithGroq()` from `transcriptionService.ts` instead.
4. **`external_app_logs`** with `returned_at IS NULL` = user is currently in a lecture app.
5. **`EXTERNAL_APPS[].id`** values exactly match `SupportedMedicalApp` union type keys.
6. **`ai_cache`** stores both AI-generated content cards AND lecture notes.
7. **DB `confidence`** (0–3 int) vs `LectureAnalysis.estimatedConfidence` (1–3 int) — compatible, pass directly.
8. **`useLocalWhisper` / `localWhisperPath`** = on-device Whisper model (whisper.rn). Separate from `useLocalModel` / `localModelPath` (LLM via llama.rn).
9. **`scripts/archive/`** contains deprecated regex-based patch scripts. Do not run them.
10. **Wikimedia image loading** — FIXED. The `ResilientImage` component (`src/components/ResilientImage.tsx`) handles HTTP 429 (rate limiting) via request deduplication, retry with exponential backoff (1s, 3s), and graceful fallback. Used in `ChatImagePreview`, `ImageLightbox`, and `MessageSources`.

---

## Self-Improving Memory

Use `~/self-improving/` for execution-improvement memory. Before non-trivial work:

1. Read `~/self-improving/memory.md`
2. Check `~/self-improving/domains/` and `~/self-improving/projects/`
3. Read only the smallest relevant domain or project files

## Qwen Added Memories

- Guru is a personal-use app for Vishnu only. No onboarding or first-run tutorial is needed. Skip any onboarding-related work.
