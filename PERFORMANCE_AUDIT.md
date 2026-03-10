# Deep Performance & Infrastructure Scaling Audit

## 1. Database Indexing (Critical Missing Feature)
The application relies heavily on `expo-sqlite` for local persistence. While this works fine for small datasets, as the student uses the app over a year, tables like `topic_progress`, `ai_cache`, and `sessions` will grow to thousands of rows.

**Current State**: There are **zero** custom database indexes defined in `src/db/schema.ts` or `src/db/database.ts`.

**Performance Bottlenecks**:
- **Spaced Repetition Engine**: The `getTopicsDueForReview` query likely does a full table scan on `topic_progress` to find rows where `fsrs_due <= DATE('now')`. As the user studies more topics, the UI will freeze every time they open the home screen.
- **AI Cache Lookup**: Fetching cached content (`SELECT * FROM ai_cache WHERE topic_id = ? AND content_type = ?`) does a sequential scan.

**Remediation**:
Add the following covering indexes to `src/db/schema.ts`:
```sql
CREATE INDEX idx_topic_progress_fsrs ON topic_progress(status, next_review_date);
CREATE INDEX idx_ai_cache_lookup ON ai_cache(topic_id, content_type);
CREATE INDEX idx_lecture_notes_created ON lecture_notes(created_at DESC);
```

## 2. Memory Management & Synchronous Operations
`expo-sqlite` utilizes synchronous APIs (e.g., `db.getAllSync`). While this is the recommended approach for simple React Native apps to prevent async race conditions, it is dangerous for heavy analytical queries.

**Current State**: In `src/screens/StatsScreen.tsx`, the `loadStats()` function fetches the *entire* topics database into JS memory and loops through it synchronously.
```typescript
const allTopics = getAllTopicsWithProgress(); // Synchronously loads potentially 10,000+ rows
const breakdown = subjects.map(sub => {
  const subTopics = allTopics.filter(t => t.subjectId === sub.id);
  // ...
});
```

**Performance Bottleneck**: This will absolutely crash or freeze older Android devices due to JavaScript garbage collection and thread blocking.

**Remediation**:
Offload these aggregations entirely to SQLite. The database engine can compute sums and averages exponentially faster than a JS map/filter chain.
```typescript
// Replace JS map/filter with a single SQL query in src/db/queries/topics.ts
const breakdownRows = db.getAllSync(`
  SELECT
    s.id, s.name, s.color_hex,
    COUNT(t.id) as total,
    SUM(CASE WHEN p.status != 'unseen' THEN 1 ELSE 0 END) as covered
  FROM subjects s
  LEFT JOIN topics t ON s.id = t.subject_id
  LEFT JOIN topic_progress p ON t.id = p.topic_id
  GROUP BY s.id
`);
```

## 3. Bundle Size and Asset Management
The project utilizes massive on-device LLMs (`llama.rn` and `whisper.rn`). While `src/services/localModelBootstrap.ts` handles downloading these, the application must be careful not to load the native C++ contexts into memory until absolutely needed.

**Current State**: The `aiService.ts` initializes the LLM context and never unloads it (noted in the TODO.md).
**Remediation**: Implement a strict "Release on Background" policy via an `AppState` listener. When the user minimizes the app, call `llamaContext.release()` to free up the 200MB+ of RAM.

## 4. Background Worker Queues
**Current State**: The audio transcription pipeline (`transcribeWithGroq`) relies on the user keeping the app open. If the OS kills the app or drops the network, the API request fails and the lecture recording data is lost.
**Remediation**: Integrate a robust job queue using `expo-background-fetch` or `react-native-background-actions`. When a recording finishes, save the file path to a queue table. A background worker should pop jobs off the queue, handle the heavy base64 chunking, make the network request to Groq/Whisper, and write the result to `lecture_notes` without blocking the UI.
