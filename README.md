# Guru – NEET‑PG/INICET Study App

React Native (Expo) study app for medical students preparing for NEET‑PG and INICET. Built for an ADHD learner, the app combines lecture transcription, spaced repetition (FSRS), AI‑generated content, and adaptive planning to ensure thorough topic mastery.

## Key Features

- **Lecture Pipeline** – Record lectures from external medical apps, transcribe automatically, and map detected topics to the NEET‑PG syllabus.
- **Spaced Repetition** – FSRS‑based scheduling with confidence‑driven reviews; topics progress from `unseen` → `seen` → `reviewed` → `mastered`.
- **AI‑Driven Content** – On‑demand generation of quizzes, key‑points, mnemonics, stories, and teach‑back exercises via a multi‑provider routing system (local Gemma 4, ChatGPT, Gemini, Groq, OpenRouter, etc.). Guru Chat uses the **Vercel AI SDK** with tool calling for medical search, image generation, and grounded responses.
- **Adaptive Planning** – Exam‑date‑backed daily agenda that redistributes backlog, prioritizes overdue reviews, and syncs with live lecture batches (DBMCI One, BTR).
- **ADHD‑Focused UX** – Proof‑of‑life checks, doom‑scroll detection, inertia screens, punishment/bed‑lock modes, body‑doubling via device sync, and a calming boot‑transition that morphs the loading orb into the start button.
- **Cross‑Device Sync** – Pair two devices (phone + tablet) to keep study sessions in sync; one device can act as a “body‑double” while the other records lectures.
- **Native Modules** – Android‑only `app‑launcher` module for background audio recording, overlay bubble with ML‑Kit face tracking, and internal audio capture via MediaProjection.
- **Offline‑First** – Local SQLite database, on‑device Whisper and Gemma models, and an offline AI queue that syncs when connectivity returns.

## Database Migrations & Backups

**Important Note on Migrations:**
When writing database migrations that use the "create new, copy, rename" pattern to alter tables, **always** start the script with `DROP TABLE IF EXISTS table_name_new;`. 
If an app crash or hot-reload interrupts a migration midway, the temporary table is left behind. Without the `DROP TABLE IF EXISTS` safeguard, the next app boot will crash with a `table already exists` error (e.g., `NativeDatabase.execAsync has been rejected`), which also prevents older `.guru` backups from being restored successfully.

## TypeScript Guidelines

**Avoid `any`:**
This project enforces strict TypeScript rules. Do **not** use the `any` type to bypass type checking. Using `any` defeats the purpose of TypeScript and can lead to runtime crashes. 
- Always define proper interfaces or types for your data.
- If the shape of the data is truly unpredictable (e.g., in a `catch (err)` block or when parsing external JSON), use the `unknown` type instead. `unknown` is safer because it forces you to perform type-checking (type narrowing) before you can interact with the variable.

## Stack

- **Framework**: Expo SDK 54 (React Native)
- **Language**: TypeScript
- **Database**: `expo‑sqlite` with versioned migrations
- **State**: Zustand
- **Navigation**: React Navigation (modal‑first root stack + tab‑based screens)
- **AI**: Multi‑provider routing (`aiService.ts`), local LLM (Gemma 4 E4B/E2B), local Whisper (whisper.rn)
- **Styling**: Custom linear‑theme primitives (`LinearText`, `LinearSurface`, etc.)

## Development Devices

The app is developed and tested primarily on two Android devices:

- **Samsung Galaxy S23 Ultra** (12 GB RAM) – used as the primary phone for daily driving, lecture recording, and overlay testing.
- **Samsung Galaxy Tab S10 Plus** (12 GB RAM) – used as a secondary tablet for body‑doubling, larger‑screen UI validation, and multi‑device sync scenarios.

Both devices run Android 14+ and provide a consistent 12 GB memory environment for local LLM (Gemma 4) and Whisper workloads.

## Project Structure

```
src/
├── screens/          # Full‑screen views (Home, Syllabus, LectureMode, Chat, Settings…)
├── components/       # Reusable UI (BootTransition, LoadingOrb, StartButton, Toast…)
│   └── chat/         # Guru Chat components (GuruChatHistoryDrawer, GuruChatMessageList…)
├── services/         # Business logic (AI, transcription, planning, sync, backup…)
│   └── ai/           # AI services including chatTools.ts (Vercel AI SDK tools)
├── db/               # Database schema, migrations, queries, repositories
├── hooks/            # Custom hooks (bootstrap, app‑state, lecture recovery…)
│   ├── useGuruChat.ts           # Vercel AI SDK wrapper
│   ├── useGuruChatSession.ts    # Thread management
│   ├── useGuruChatModels.ts     # Model picker state
│   └── useGuruChatImageGeneration.ts  # Image generation state
├── navigation/       # Root navigator, tab navigator, linking config
├── store/            # Zustand store (profile, bootPhase, levelInfo…)
├── schemas/          # Zod schemas (single source of truth for types)
├── config/           # Exam dates, provider lists, environment defaults
└── constants/        # Prompts, syllabus tree, external‑apps list
```

## Getting Started

1. **Clone** the repository.
2. **Install dependencies**: `npm install`
3. **Run on Android**:

   ```bash
   npm run android
   ```

   (iOS is not supported; the app uses Android‑only native modules.)

4. **Development scripts**:
   - `npm start` – start Metro bundler
   - `npm run android` – run on connected device/emulator
   - `npm run verify:ci` – lint + unit tests + logic‑coverage gate
   - `npm run repo‑map` – regenerate `REPO_MAP.md`

## Documentation

- **`CLAUDE.md`** – Comprehensive architecture, database schema, AI routing, lecture flows, and project rules (canonical context for AI contributors).
- **`AGENTS.md`** – AI context file with architectural rules, naming conventions, and Guru Chat system details.
- **`GURU_CHAT_REFACTOR_GUIDE.md`** – Migration guide for the Vercel AI SDK refactor (hooks, components, tools).
- **`REPO_MAP.md`** – Generated file listing all source files; run `npm run repo‑map` to update.
- **`docs/TODO.md`** – Current high‑priority tasks (FSRS mastered definition, inline‑alert migration, etc.).
- **`docs/archive/`** – Stale audits, plans, and historical analyses (kept for reference only).

## Testing

- **Unit tests**: Jest with logic‑coverage gate (`npm run test:unit:coverage:logic`).
- **E2E tests**: Detox for critical user flows (`npm run detox:test:critical`).
- **CI check**: `npm run verify:ci` runs lint, unit tests, and coverage.

## License

Proprietary – for personal use only.
