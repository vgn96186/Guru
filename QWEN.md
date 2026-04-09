# Guru — QWEN Context File

**React Native (Expo) NEET-PG/INICET medical study app for Android.**

---

## Project Overview

Guru is a **NEET-PG / INICET** medical entrance exam study app built for a user with ADHD. It combines lecture recording & transcription (with AI-powered topic detection), spaced repetition (FSRS), AI study assistance, and gamification (XP, levels, streaks) to help medical students master all 19 NEET-PG subjects.

### Target User

Medical student (Vishnu) preparing for NEET-PG (sub-2000 rank) and INICET. Uses **DBMCI One** and **BTR (Back to Roots)** lecture batches. **Personal-use app — no onboarding needed.** ADHD-aware design with supportive accountability (not shame-based).

### Technology Stack

| Layer             | Technology                                                                         |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Framework**     | Expo SDK 54, React Native 0.81.5, React 19.1.0                                     |
| **Language**      | TypeScript (~5.9.2) with strict mode                                               |
| **Database**      | `expo-sqlite` (SQLite, WAL mode, versioned migrations)                             |
| **State**         | Zustand (`src/store/useAppStore.ts`)                                               |
| **Navigation**    | React Navigation v7 (native stack + bottom tabs)                                   |
| **AI**            | Groq (primary), OpenRouter, Gemini, Cloudflare, local LLM (llama.rn with MedGemma) |
| **Speech**        | Whisper (cloud Groq / local whisper.rn)                                            |
| **Testing**       | Jest (unit), Detox (E2E)                                                           |
| **Styling**       | Custom theme (`src/theme/linearTheme.ts`) — glassmorphic Linear design system      |
| **Fonts**         | Inter (400–900 via @expo-google-fonts)                                             |
| **Icons**         | Ionicons (@expo/vector-icons) — no emoji in UI                                     |
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
│   │   ├── primitives/        # Linear design system (LinearText, LinearButton, LinearSurface, etc.)
│   │   ├── home/              # Home screen sub-components
│   │   ├── settings/          # Settings sub-components
│   │   ├── dialogService.ts   # Themed dialog system (replaces Alert.alert)
│   │   └── Toast.tsx          # Toast notification system
│   ├── screens/               # Full-screen views
│   │   └── settings/sections/ # Extracted settings sections (Account, Study, Storage, AiProviders)
│   ├── services/              # Business logic (AI, audio, sync, planning)
│   │   ├── ai/                # AI submodules (chat, content, medicalSearch, llmRouting, etc.)
│   │   ├── lecture/           # Lecture pipeline (persistence, session monitor, transcription)
│   │   └── transcription/     # Transcription engines, matching, note generation
│   ├── db/                    # Database layer
│   │   ├── database.ts        # getDb() singleton, init, migrations, seeding
│   │   ├── schema.ts          # CREATE TABLE statements
│   │   ├── migrations.ts      # Versioned migrations (PRAGMA user_version)
│   │   ├── queries/           # One file per domain (topics, progress, sessions, aiCache)
│   │   └── repositories/      # Abstraction layer (profileRepository, dailyLogRepository)
│   ├── hooks/                 # Custom hooks (useAppBootstrap, useFaceTracking, useScrollRestoration, etc.)
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
│       │   ├── OverlayService.kt    # Floating timer bubble + ML Kit face tracking
│       │   └── RecordingService.kt  # Mic / internal audio recording
├── e2e/                       # Detox E2E tests
├── scripts/                   # Build/utility scripts
└── docs/                      # Architecture, testing strategy, QA docs, superpowers specs
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

# Unit tests with coverage
npm run test:unit:coverage

# Logic-only coverage (business logic subset)
npm run test:unit:coverage:logic

# E2E tests (Detox) — Genymotion
npm run detox:build:android:genymotion:dev
npm run detox:test:critical:genymotion:dev
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

---

## Development Conventions

### Code Style

- **TypeScript strict mode** enabled. No `any` without reason.
- **Prettier** for formatting (trailing commas, single quotes, 2-space indent).
- **ESLint** with `typescript-eslint`, `react-hooks`, and `jest` plugins.
- **Unused vars:** Prefix with `_` (`argsIgnorePattern: '^_'`).
- **No `require()` in TS files** — use `import` statements.

### UI Design System

- **LinearText** — All text uses `LinearText` with `variant` (display/title/sectionTitle/body/bodySmall/label/caption/chip/badge/meta) and `tone` (primary/secondary/muted/inverse/accent/warning/success/error).
- **No emoji in UI** — Use Ionicons (`@expo/vector-icons`) instead. Exceptions: notification titles, note format markers (parsed by SQL/LLM), and motivational text flavor.
- **linearTheme** — All colors from `n.colors.*`, spacing from `n.spacing.*`, typography from `n.typography.*`.
- **Dialog system** — Use `showDialog`, `showError`, `showSuccess`, `showWarning`, `showInfo`, `confirm`, `confirmDestructive` from `dialogService.ts`. **Never use `Alert.alert` directly.**

### Database Conventions

- **Async-only** — prefer `db.runAsync`, `db.getFirstAsync`, `db.getAllAsync`.
- **`nowTs()`** = `Date.now()` (milliseconds epoch).
- **`runInTransaction()`** for atomic multi-statement writes.
- **Repository layer** — use `profileRepository` and `dailyLogRepository` instead of importing queries directly.
- **`topic_progress`** is the central progress table. Status: `'unseen' | 'seen' | 'reviewed' | 'mastered'`.

### Navigation

```
Root Stack (modal overlays): PunishmentMode, BedLock, DoomscrollInterceptor, BreakEnforcer, DeviceLink, Lockdown, CheckIn, Tabs, BrainDumpReview, SleepMode, WakeUp, LocalModel
Tabs (5 tabs): HomeTab, SyllabusTab, ChatTab, MenuTab
Home Stack: Home, Session, LectureMode, MockTest, Review, NotesSearch, BossBattle, Inertia, ManualLog, StudyPlan, DailyChallenge, FlaggedReview
```

- Use `navigationRef` from `src/navigation/navigationRef.ts` for imperative navigation.

### Zustand Store

```typescript
import { useAppStore } from '../store/useAppStore';

const profile = useAppStore((s) => s.profile);
const refreshProfile = useAppStore((s) => s.refreshProfile);
```

- Always call `refreshProfile()` after XP or profile mutations.
- `bootPhase`: `'booting' | 'calming' | 'settling' | 'done'` — controls loading overlay.

### AI Service Routing

- **Primary:** Groq (fastest). Models: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`.
- **Fallback chain:** Groq → OpenRouter free models → local LLM.
- **Local LLM:** `llama.rn` with MedGemma 4B when `profile.useLocalModel = true`.
- `generateJSONWithRouting()` — for structured JSON output.
- `generateTextWithRouting()` — for free-text output.

### Lecture Transcription — Two Pipelines (Unified Architecture)

Both pipelines share `saveLectureChunk()` from `src/services/lecture/persistence.ts` with:

- 5-level topic matching (exact, LIKE, reverse, semantic, queue)
- XP awarding (`topics.length * 8`)
- Recording file preservation (renamed to descriptive identity)
- ADHD note enhancement via `generateADHDNote`
- Background backup trigger

**Pipeline A:** External app recording (background, native Kotlin) → `LectureReturnSheet` → transcription → save
**Pipeline B:** In-app LectureMode ("Hostage Mode") → Auto-Scribe 3-min chunks → transcription → save

### ADHD-Specific UX

- **Supportive accountability** — No shame-based language. Firm but warm tone (InertiaScreen is the template).
- **Proof-of-Life** checks every 15 min in Lecture Mode.
- **Doomscroll detection** via AppState changes (vibrate + notification).
- **Inertia screen** — commitment ladder (breathe → micro-win → momentum).
- **Punishment Mode** — renamed to "Nudge Mode"; vibration reminders, not harassment.
- **Break enforcer** — mandatory breaks with quiz content.
- **Face tracking** in overlay — drowsy/absent detection (ML Kit).
- **Body-doubling** via device sync.
- **Scroll/form persistence** via `useScrollRestoration` and `usePersistedInput` hooks.

---

## Known Quirks / Gotchas

1. **`profile.openrouterApiKey`** = legacy field (not actively used).
2. **`profile.openrouterKey`** = actual OpenRouter key for free model fallbacks.
3. **Note format markers** (🎯📌💡🚀📝🧠❓) are structural — parsed by `lectureManager.ts` and `aiCache.ts` SQL. Do not change.
4. **Notification titles** contain emoji — can't render Ionicons in Android notification tray. Keep as-is.
5. **`external_app_logs`** with `returned_at IS NULL` = user is currently in a lecture app.
6. **EXTERNAL_APPS[].id** values exactly match `SupportedMedicalApp` union type keys.
7. **`ai_cache`** stores both AI-generated content cards AND lecture notes.
8. **DB `confidence`** (0–3 int) vs `LectureAnalysis.estimatedConfidence` (1–3 int) — compatible, pass directly.
9. **`useLocalWhisper` / `localWhisperPath`** = on-device Whisper (whisper.rn). Separate from `useLocalModel` / `localModelPath` (LLM via llama.rn).
10. **No bundled API keys** in release builds. Users enter keys in Settings after fresh install.
11. **`scripts/archive/`** contains deprecated regex-based patch scripts. Do not run them.

---

## Self-Improving Memory

Use `~/self-improving/` for execution-improvement memory. Before non-trivial work:

1. Read `~/self-improving/memory.md`
2. Check `~/self-improving/domains/` and `~/self-improving/projects/`
3. Read only the smallest relevant domain or project files
