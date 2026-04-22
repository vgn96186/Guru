# Guru — Master Implementation Document

This document unifies all implementation plans, feature backlogs, architecture audits, bug fixes, and UI/UX issues into a single, cohesive roadmap for the Guru application.

---

## 1. Project Overview & Core Philosophy

**Guru** is a React Native/Expo medical study app (NEET/INICET prep) designed specifically for users with severe ADHD, executive dysfunction, and depression.

- **Core Principles:** Zero Friction, Anti-Guilt (absence is normal, return is celebrated), Micro-Commitments ("Just 1 Question"), and Companion-focused interactions rather than tool-based tracking.
- **Key Mechanics:** Relapse Prevention Engine, Wake-Up Brain Fog Protocol, Doomscroll Interception, and Spaced Repetition (FSRS) intertwined with dynamic AI generation (Keypoints, Story, Quiz, Detective).

---

## 2. Phase 1: Critical Fixes & Stability (P0 - Immediate)

These issues cause data loss, crashes, or severe security vulnerabilities.

### Security & Data Integrity

- **MQTT Payload Encryption:** Encrypt payloads sent over the public MQTT broker (`broker.emqx.io`) using `react-native-quick-crypto` to secure the Device Sync feature.
- **Lecture Return File Validation:** Implement exponential backoff polling in `checkForReturnedSession` to wait for long recordings to flush to the file system, preventing silent discards of valid 1-hour lectures.
- **FSRS Confidence Bug:** Fix the mapping in `fsrsService.ts` where user confidence (0–3) incorrectly maps to a 1–5 scale, breaking spaced repetition intervals.

### Memory & Crashes

- **Audio Chunking Memory Fix:** Refactor `processLongRecording` to use native file system streaming instead of loading 20MB+ base64 audio into the JS string memory to prevent OOM crashes on Android.
- **Face Tracking Throttle:** Throttle the `OverlayService.kt` CameraX image analysis (e.g., 1 frame every 2 seconds) to prevent severe battery drain and device overheating during long sessions.

### Database Performance Freezes

- **Database Indexing:** Add vital indexes to `src/db/schema.ts` (e.g., `idx_tp_status_review`, `idx_ai_cache_lookup`, `idx_lecture_notes_created`, `idx_topics_parent`) to stop the UI thread from freezing on mount due to full table scans.

---

## 3. Phase 2: Core Architecture & Performance (P1 - High Impact)

### Performance & Optimization

- **HomeScreen Mount Optimization:** Defer heavy sequential synchronous SQLite queries inside `HomeScreen` using `InteractionManager.runAfterInteractions` and yield loops.
- **StatsScreen SQL Aggregation:** Replace JS-side data aggregation (which crashes older devices by loading 5,000+ rows) with a direct SQL `GROUP BY` query (`getSubjectBreakdown()`).
- **Study Planner SQL Optimization:** Move the JS filtering in `generateStudyPlan` into a bucketed SQLite query to calculate the "Due", "Weak", and "Remaining" topics securely in the DB.

### AI & Hardware Resilience

- **LLM Context Release on Background:** Add an `AppState` listener in `aiService.ts` to call `llamaContext.release()` when the app goes into the background, preventing Android from OOM-killing the app.
- **Offline AI Request Queue:** Create an `offline_ai_queue` table to save transcription and JSON generation payloads when offline, processing them seamlessly in the background when connectivity returns.
- **Transcripts to File System:** Stop storing raw full transcripts as `TEXT` in the SQLite database to prevent DB bloat. Save them as `.txt` files and store the URI.
- **Hardware RAM Checks:** Automatically disable the local `llama.rn` fallback if the device has < 4GB of RAM to prevent silent crashing.

---

## 4. Phase 3: UI/UX Redesign & Usability (P2 - Developer & User Experience)

### 4.1 Home Screen Restructuring (The Launchpad)

- **Super Tab Navigation:** Reduce bottom tabs from 7 to 5: `[ Home ]`, `[ Syllabus ]`, `[ ➕ Action Hub ]`, `[ Chat ]`, `[ Menu ]`.
- **Action Hub (Center FAB):** Tapping the center opens a fast bottom sheet for high-frequency actions: Record Lecture, Quick Note, Launch External App.
- **Remove Laggy Accordion:** Remove the `Animated.timing` "MORE" accordion on the HomeScreen.
- **Contextual Dashboard:** Reorganize into a Quick Action Row (top), Active Context (middle - e.g., "Running: Marrow..."), and Recent Activity (bottom).

### 4.2 UI Consistency & Theming

- **Centralized Theme System:** Create `src/constants/theme.ts` for all colors, spacing, and typography. Replace all hardcoded "magic number" hex colors and pixel values.
- **Global Native Touch Feedback:** Replace iOS-style opacity flashes (`TouchableOpacity`) with Material Design ink ripples (`Pressable` with `android_ripple`).
- **Responsive Layouts:** Utilize `useResponsive` hooks universally to fix overflow issues on smaller phones and tiny text on tablets.

### 4.3 Accessibility & Hardware Handling

- **A11y Pass:** Add `accessibilityRole` and `accessibilityLabel` to all interactive components so TalkBack/VoiceOver functions correctly.
- **Hardware Back Button / Modals:** Migrate raw inline `<Modal>` usages to `@react-navigation/native-stack` (`presentation: 'transparentModal'`) or `@gorhom/bottom-sheet` to ensure Android hardware back swipes work gracefully.
- **Error Feedback:** Eliminate silent `catch` blocks. Implement user-visible toast notifications when AI models fail, lectures fail to return, or network requests drop.

### 4.4 Component-Level UX Polish

- **TopicDetailScreen:** Fix FlatList thrashing by extracting list items into memoized components and deferring auto-saves to `onBlur`.
- **GuruChatScreen:** Virtualize chat history using an inverted `FlatList` to prevent memory bloat.
- **Settings Screen:** Split the massive monolithic scroll view into a `SettingsStack` with sub-pages and migrate to `react-hook-form`.
- **Boss Battle:** Add immediate Answer Feedback (showing correct/incorrect and an explanation) before jumping to the next question, plus an option to "Flee" or pause.
- **Session Screen:** Add explicit session phase indicators (Planning, Studying, Break) and a True Pause button.

---

## 5. Phase 4: Feature Enhancements (P3 - Future Roadmap)

### Concept & Knowledge Mapping

- **Concept Knowledge Graph:** Evolve beyond rigid topic trees by introducing semantic cross-linking (e.g., link "Renin" in Physiology to "Hypertension" in Pharmacology) for smarter AI planning.
- **Vector Embeddings (RAG):** Implement local SQLite FTS5 or vector embeddings to allow users to semantically search their entire transcript and note history.

### Testing & Analytics

- **Granular Study Analytics:** Implement `react-native-chart-kit` for a Weekly XP Trend line chart and Subject Weakness Radar charts.
- **AI-Curated Grand Mock Exams:** Generate 200-question mock exams weighted to official NEET-PG distributions (60% high-yield, 20% due, 20% weak), batched overnight via local models.
- **Adaptive Quiz Engine (Item Response Theory):** Track mastery at the sub-topic/question level to target quizzes more efficiently rather than reviewing an entire parent topic.

### App Utility

- **Session & Note CRUD:** Add missing Edit/Delete functionality for Notes in `NotesHubScreen` and a history screen to delete accidental logs from the `daily_log`.
- **Collaborative Study (Multiplayer):** Extend MQTT sync for users to link with study buddies. Implement "Focus Pings" when a buddy is doomscrolling.

---

## 6. Phase 5: Developer Experience & QA Lifecycle

- **Code Formatting:** Install and enforce ESLint, Prettier, and Husky pre-commit hooks to manage the ~267K codebase.
- **Testing Foundation:** Setup Jest for isolated unit testing, starting with `fsrsService.ts`, progress queries, and JSON repair pipelines.
- **Native Module Docs:** Add comprehensive JSDoc to all exports inside `modules/app-launcher` to clarify required Kotlin parameters.
- **CI/CD Pipeline:** Implement GitHub Actions to run type-checking, linting, unit tests, and automated Android Debug builds on PRs.
