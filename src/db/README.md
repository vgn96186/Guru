# Database layer (expo-sqlite)

Single SQLite DB via **expo-sqlite**, WAL mode, versioned migrations, and a query/repository layer.

## Patterns

### Access

- **`getDb()`** — returns the singleton DB (throws if not initialized). Call only after `initDatabase()` (done in app bootstrap).
- **Async only** — use `db.runAsync`, `db.getFirstAsync`, `db.getAllAsync`, `db.execAsync`. No sync APIs.

### Transactions

- **`runInTransaction(fn)`** — runs `fn(db)` in a transaction (BEGIN → fn → COMMIT, or ROLLBACK on throw). Use for any multi-statement write that must be atomic.
- Example: `await runInTransaction(async (tx) => { await tx.runAsync(...); await tx.runAsync(...); });`
- Existing code that uses manual `BEGIN` / `COMMIT` / `ROLLBACK` can be migrated to `runInTransaction` for consistency.

### Typing

- Always pass a type to `getFirstAsync<T>` and `getAllAsync<T>` so results are typed, e.g. `db.getFirstAsync<{ id: number; name: string }>('SELECT id, name FROM topics WHERE id = ?', [id])`.
- Keep row types close to the query or in a shared type in the same file.

### Schema and migrations

- **`schema.ts`** — `ALL_SCHEMAS` (CREATE TABLE) and `DB_INDEXES` (CREATE INDEX IF NOT EXISTS). Tables are created on init; indexes are applied after.
- **`migrations.ts`** — versioned list of migrations; each has `version`, `sql`, optional `description`. Only migrations with `version > user_version` run. Fresh installs skip migrations and set `user_version` to latest.
- Add new schema only via migrations (ALTER TABLE, new indexes). Do not change `ALL_SCHEMAS` for existing tables; that would require a migration that alters the table.

### Indexes

- Indexes are in `schema.ts` as `DB_INDEXES`. Hot paths covered:
  - **topic_progress**: `(status, fsrs_due, confidence)` for due/review; `(topic_id, content_type)` for ai_cache lookups.
  - **sessions**: `started_at DESC` for recent sessions / stats.
  - **lecture_notes**: `created_at`, `subject_id`.
  - **external_app_logs**: `returned_at`, `(transcription_status, returned_at)`.
  - **topics**: `parent_topic_id`, `subject_id`.
- When adding new queries that filter/sort by columns not yet indexed, add a new `CREATE INDEX IF NOT EXISTS` to `DB_INDEXES`.

### Structure

- **`database.ts`** — init, getDb, runInTransaction, todayStr, dateStr, nowTs, seeding.
- **`queries/`** — domain-specific read/write (progress, topics, sessions, aiCache, externalLogs, brainDumps). Use getDb() or runInTransaction.
- **`repositories/`** — thin layer over queries for store/UI (profileRepository, dailyLogRepository, dailyAgendaRepository).

### Performance

- WAL is enabled on init for better concurrency.
- Foreign keys are enabled.
- Heavy or bulk work (e.g. embedding seed) runs in background; avoid blocking the UI thread with long-running queries.
