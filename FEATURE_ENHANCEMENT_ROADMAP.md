# Feature Enhancement Roadmap

## Domain Summary
The core purpose of this application is to serve as an uncompromising, gamified, and highly focused study companion for medical students preparing for high-stakes exams (NEET-PG/INICET). It blends AI-generated active recall (flashcards, mock tests), cross-device audio lecture transcription, and intense behavioral interventions (doomscroll blocking, strict breaks) to keep easily distracted students on track.

---

## Low-Hanging Fruit (Quick Wins)

### 1. Granular Study Analytics (Data Visualization)
* **Context**: The app already tracks deep metrics via `sessions`, `daily_log`, and `topic_progress` (XP, minutes studied, subjects covered), but `StatsScreen.tsx` relies heavily on raw text numbers and a single `ReviewCalendar`.
* **Enhancement**: Utilize the already-installed `react-native-chart-kit` to add a "Weekly XP Graph" and a "Subject Weakness Radar Chart" to `StatsScreen.tsx`.
* **Impact**: Visual progress is critical for ADHD motivation, turning abstract numbers into tangible growth trends.

### 2. Session & Note Management (CRUD Completion)
* **Context**: Users can manually log study sessions (`ManualLogScreen.tsx`) and generate vast amounts of AI notes, but there is no interface to edit or delete them if they make a mistake.
* **Enhancement**:
  - Add an "Edit Note" and "Delete Note" action to the items in `NotesHubScreen.tsx` and `NotesSearchScreen.tsx`.
  - Add a "Delete Session" button in a new `SessionHistoryScreen` to cleanly remove accidental logs from the `sessions` and `daily_log` tables.
* **Impact**: Fixes a core standard UX gap where users feel trapped by their own data entries.

### 3. Database Indexing for Spaced Repetition
* **Context**: The `getTopicsDueForReview` query scans the entire `topic_progress` table sequentially. As the user studies thousands of topics over months, this will cause the `HomeScreen` to lag on mount.
* **Enhancement**: Add `CREATE INDEX IF NOT EXISTS idx_topic_progress_fsrs ON topic_progress(status, next_review_date)` and `idx_topic_progress_subject ON topic_progress(topic_id, confidence)` inside `src/db/schema.ts`.
* **Impact**: Ensures O(1) or O(log N) lookup times for critical daily agenda queries, preventing the UI thread from freezing.

---

## Core Missing Functionalities

### 1. Offline AI Generation Queueing
* **Context**: The app relies on cloud models (Groq, OpenRouter) for complex transcription and generation if the local model is too slow. If a user loses internet in a library, their study request or flashcard grade simply fails.
* **Enhancement**: Implement a resilient offline queue using a new `offline_ai_requests` SQLite table. When `fetchContent` or `transcribeWithGroq` fails due to network, save the payload. Use `expo-background-fetch` or an `AppState` active listener to seamlessly retry and populate the `ai_cache` in the background when connectivity returns.
* **Impact**: Guarantees users never lose their study intent or lecture recordings due to spotty hospital/library Wi-Fi.

### 2. Secure Device Synchronization (E2E Encryption)
* **Context**: `DeviceLinkScreen.tsx` connects to a public, unauthenticated MQTT broker (`broker.emqx.io`) using a simple 12-character string. Anyone guessing or intercepting the room code can spoof break enforcers or read study habits.
* **Enhancement**: Add AES-GCM encryption to the MQTT payload in `deviceSyncService.ts`. The 12-character sync code can act as a shared secret key (derived via PBKDF2) so that even on a public broker, the JSON payloads remain completely opaque to eavesdroppers.
* **Impact**: Closes a massive privacy vulnerability while maintaining the low-latency, serverless architecture.

---

## Next-Level Architectural/Feature Ideas

### 1. Collaborative Study & Accountability (Multiplayer Mode)
* **Proposal**: Extend the MQTT device sync architecture to support adding "Study Buddies". Friends can share a unique room code to see each other's live status (e.g., "Studying Anatomy", "On a Break", "Doomscrolling").
* **Technical Approach**:
  - Add a `friends` table to store peer codes.
  - The app subscribes to multiple MQTT topics simultaneously (`user_A_status`, `user_B_status`).
  - Add a "Focus Ping" feature that uses `expo-notifications` to send a supportive or aggressive push notification to a friend who has been idle or is currently in Harassment Mode.

### 2. AI-Curated "Grand Mock Exams"
* **Proposal**: Currently, `MockTestScreen.tsx` simply pulls randomly from `ai_cache` questions. The app should generate official 200-question Grand Tests that mimic the real INICET/NEET-PG algorithm.
* **Technical Approach**:
  - Build a sophisticated SQL aggregator in `src/db/queries/aiCache.ts` that selects questions based on a weighted distribution: 60% high-yield unseen topics, 20% spaced-repetition due topics, and 20% weak FSRS topics.
  - If the cache lacks questions for this exact distribution, batch-queue the missing topics to the Local Qwen/Llama model overnight using `expo-task-manager` so the exam is ready by morning without blocking the user.
