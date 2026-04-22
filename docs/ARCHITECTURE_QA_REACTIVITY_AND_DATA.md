# Architecture Q&A: Reactivity, Drizzle, Profile Refresh, Transcript Handling

Answers to four specific architecture questions.

---

## 1. Reactivity strategy: expand event bus vs declarative Live Query

**Current state:** We have an EventEmitter in `databaseEvents.ts`. When a lecture is saved, `notifyDbUpdate(DB_EVENT_KEYS.LECTURE_SAVED)` runs. The **store** subscribes to that (and two other keys) and calls `refreshProfile()`. So the whole app gets a profile refetch; no screen gets “just refresh my lecture list.”

**To make a specific screen (e.g. Notes Hub) live-update when a lecture is saved:**

- **Option A — Expand the event bus (recommended, minimal change):**  
  Keep the same bus. On the screen that cares (e.g. `NotesHubScreen`), subscribe to `LECTURE_SAVED` and refetch only that screen’s data (e.g. call `loadData()` or whatever loads the lecture list). No new infra; the architecture is already ready for this.

  ```ts
  // In NotesHubScreen (or a hook it uses)
  useEffect(() => {
    const onLectureSaved = () => loadData();
    dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, onLectureSaved);
    return () => dbEvents.off(DB_EVENT_KEYS.LECTURE_SAVED, onLectureSaved);
  }, [loadData]);
  ```

- **Option B — Declarative “Live Query”:**  
  A hook that runs a query and re-runs it when “something changed” (e.g. subscription to a generic “data changed” or table-scoped event). We don’t have this today. You’d either build a small “subscribe to event → refetch this query” helper, or adopt something like Drizzle’s `useLiveQuery` (which uses its own change tracking). So the codebase is **not** ready for a full declarative live-query layer out of the box; you’d add it.

**Recommendation:** Use the event bus in a more granular way first: have the screens that need it (e.g. Notes Hub, Transcript History) listen to `LECTURE_SAVED` and run their own `loadData()`. If later you want a single “live query” abstraction, you can introduce a thin hook that subscribes to events and refetches a given query.

---

## 2. Drizzle compatibility: reusing our existing `openDatabaseAsync` instance

**Short answer: no.** Drizzle’s Expo SQLite driver is built for the **sync** API: it expects an instance from `openDatabaseSync()`, not from `openDatabaseAsync()`.

- We currently use **only** `openDatabaseAsync()` and pass that single DB instance around.
- Drizzle’s docs and API use **`openDatabaseSync('db.db')`** and pass that into `drizzle(expo)`.

So you **cannot** initialize Drizzle with our existing `openDatabaseAsync` instance. You have two realistic options:

1. **Use a second connection for Drizzle:**  
   Call `openDatabaseSync('neet_study.db')` (or the same path we use for the async DB) and pass that into Drizzle. Same file, two connections. With WAL mode this is valid; SQLite allows multiple readers and one writer. You’d have:

   - Current code: `openDatabaseAsync` → all existing queries.
   - Drizzle: `openDatabaseSync` → only what you migrate to Drizzle (e.g. live queries).

2. **Switch the app to the sync API for the main DB** and then pass that single instance into Drizzle. That would require changing all our `getDb()` usage to the sync API (or wrapping it), which is a larger refactor.

So: no connection conflict in the sense of “one handle shared by two systems,” but we **cannot** pass the existing async instance into Drizzle; we’d use a separate sync connection for Drizzle if we add it.

---

## 3. The “profile” loop: partial refresh vs full profile

**Current state:** `refreshProfile()` in `useAppStore` refetches the **entire** profile (plus levelInfo and today’s daily log). There is no “refresh only lecture list” or other partial refresh. When `LECTURE_SAVED` (or other events) fire, the store only has “refresh profile.”

**Ways to get a single list (e.g. lectures) to refresh without refetching the whole profile:**

1. **Screen-level listener (no store change):**  
   The screen that shows the lecture list subscribes to `LECTURE_SAVED` and calls its own data loader (e.g. `loadData()` in NotesHubScreen). Profile is unchanged; only that screen’s list updates. Easiest and consistent with “expand the event bus” above.

2. **Granular store methods:**  
   Add e.g. `refreshLectureList()` that only refetches lecture-related data and stores it (e.g. in a new slice or a dedicated store). The store (or a hook) subscribes to `LECTURE_SAVED` and calls `refreshLectureList()` instead of or in addition to `refreshProfile()`. Screens that only need the lecture list then read from that slice and don’t need to know about profile.

3. **More granular events:**  
   Keep one bus but emit more specific events/payloads, e.g. `notifyDbUpdate('LECTURE_SAVED', { scope: 'lectureList' })`, and have subscribers decide what to refetch based on `scope`. Still no “partial refresh” by itself; it just tells listeners what kind of change happened so they can call the right refresh (profile vs lecture list, etc.).

**Recommendation:** You don’t have partial refresh today; add it in one of these ways. For “only refresh lecture list,” the smallest change is (1) screen-level listener. If you want a central place and reusable “refresh just lectures,” add (2) a dedicated refresh method and wire it to the existing `LECTURE_SAVED` event.

---

## 4. Transcript handling: heavy work inside vs outside the SQLite transaction

**Short answer:** Transcript and summary are produced **before** the persistence layer. Heavy work is **not** done inside the SQLite transaction, with one exception (embedding).

**Flow:**

- **Before `saveLecturePersistence`:**  
  Transcription and summary generation (Groq, local Whisper, etc.) run elsewhere (e.g. LectureReturnSheet flow, upload flow). They produce `analysis` (transcript, lectureSummary, topics, etc.). So parsing and summary generation are **outside** the DB transaction.

- **At the start of `saveLecturePersistence`:**  
  `saveTranscriptToFile(analysis.transcript)` runs **before** `BEGIN IMMEDIATE`. So file I/O for the transcript is also **outside** the transaction.

- **Inside the transaction:**
  - `markTopicsFromLecture(db, ...)` does DB reads/writes and topic matching.
  - If the caller did **not** pass `opts.embedding`, `markTopicsFromLecture` can call `generateEmbedding(lectureSummary)` for semantic matching. That is an AI/network call and **does** run inside the transaction, which is the only “heavy” work there.
  - Then: `findSubjectId`, `INSERT INTO lecture_notes`, `UPDATE external_app_logs`, `grantXp` (DB). So aside from that optional embedding call, the transaction is DB-only.

**Conclusion:** We are **not** doing transcript parsing or summary generation inside the transaction. We **are** potentially doing one embedding call inside it when `opts.embedding` is not provided. To keep the transaction short and predictable, prefer passing `embedding` from the caller (e.g. from the same place that already has the analysis) so that `generateEmbedding` is never called inside `markTopicsFromLecture`.

---

## Summary table

| Question                                | Answer                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reactivity: event bus vs Live Query** | Use the event bus in a more granular way (screen subscribes to `LECTURE_SAVED` and refetches its list). Declarative live query would require new infra or Drizzle.          |
| **Drizzle + existing DB**               | Cannot use our existing `openDatabaseAsync` instance. Drizzle expects `openDatabaseSync`. Use a second (sync) connection to the same DB file if you add Drizzle.            |
| **Partial refresh**                     | We don’t have it. Add either screen-level listeners that refetch only that screen’s data, or granular store methods (e.g. `refreshLectureList()`) wired to the same events. |
| **Heavy work in transaction**           | Transcript/summary are produced before persistence. Only optional `generateEmbedding` inside the transaction is “heavy”; pass `embedding` from caller when possible.        |
