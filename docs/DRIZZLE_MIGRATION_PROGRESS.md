# Drizzle Migration Progress

Last updated: 2026-04-22

## Status

- Mission tracker progress: `23 / 31` features completed (`74.2%`) before the latest parity verification update below
- Current migration state: schema parity is in place, core repository migration is mostly complete, remaining work is validation/perf/integration focused.

## Completed Batches

### 1. Schema parity foundation

- Expanded [src/db/drizzleSchema.ts](/Users/vishnugnair/Guru/debug/src/db/drizzleSchema.ts) to cover the legacy SQLite tables, including `migration_history`.
- Updated [src/db/testing/drizzleSchemaParity.unit.test.ts](/Users/vishnugnair/Guru/debug/src/db/testing/drizzleSchemaParity.unit.test.ts) so Drizzle table exports are checked against the actual SQLite schema.
- Verified parity with the single-thread unit path.

### 2. Core study repositories

Completed Drizzle repositories plus unit coverage for:

- `subjects`
- `topics`
- `topic_progress`
- `sessions`
- `daily_log`
- `daily_agenda`

### 3. Lecture and planning repositories

Completed Drizzle repositories plus unit coverage for:

- `lecture_schedule_progress`
- `lecture_notes`
- `external_app_logs`

### 4. AI and content repositories

Completed Drizzle repositories plus unit coverage for:

- `ai_cache`
- `generated_study_images`
- `user_content_flags`

### 5. Chat and queue repositories

Completed Drizzle repositories plus unit coverage for:

- `guru_chat_threads`
- `guru_chat_session_memory`
- `chat_history`
- `offline_ai_queue`

### 6. Advanced feature repositories

Completed Drizzle repositories plus unit coverage for:

- `brain_dumps`
- `question_bank`
- `mind_maps`
- `mind_map_nodes`
- `mind_map_edges`

### 7. Query result equality testing

- Added [src/db/drizzleQueryParity.db.test.ts](/Users/vishnugnair/Guru/debug/src/db/drizzleQueryParity.db.test.ts) as an in-memory SQLite integration suite.
- The suite uses the same `better-sqlite3` database for:
  - legacy raw-SQL query functions through the async wrapper
  - Drizzle repositories through the native `better-sqlite3` Drizzle driver
- Verified parity for:
  - `brainDumps`
  - `lectureSchedule`
  - `questionBank` query reads
  - `mindMaps` list/load/search reads

## Verified Files Added

Repository files added during this migration include:

- [src/db/repositories/subjectsRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/subjectsRepository.drizzle.ts)
- [src/db/repositories/topicsRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/topicsRepository.drizzle.ts)
- [src/db/repositories/topicProgressRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/topicProgressRepository.drizzle.ts)
- [src/db/repositories/sessionsRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/sessionsRepository.drizzle.ts)
- [src/db/repositories/dailyLogRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/dailyLogRepository.drizzle.ts)
- [src/db/repositories/dailyAgendaRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/dailyAgendaRepository.drizzle.ts)
- [src/db/repositories/lectureScheduleRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/lectureScheduleRepository.drizzle.ts)
- [src/db/repositories/lectureNotesRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/lectureNotesRepository.drizzle.ts)
- [src/db/repositories/externalAppLogsRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/externalAppLogsRepository.drizzle.ts)
- [src/db/repositories/aiCacheRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/aiCacheRepository.drizzle.ts)
- [src/db/repositories/generatedStudyImagesRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/generatedStudyImagesRepository.drizzle.ts)
- [src/db/repositories/contentFlagsRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/contentFlagsRepository.drizzle.ts)
- [src/db/repositories/guruChatRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/guruChatRepository.drizzle.ts)
- [src/db/repositories/guruChatSessionMemoryRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/guruChatSessionMemoryRepository.drizzle.ts)
- [src/db/repositories/offlineQueueRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/offlineQueueRepository.drizzle.ts)
- [src/db/repositories/brainDumpsRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/brainDumpsRepository.drizzle.ts)
- [src/db/repositories/questionBankRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/questionBankRepository.drizzle.ts)
- [src/db/repositories/mindMapsRepository.drizzle.ts](/Users/vishnugnair/Guru/debug/src/db/repositories/mindMapsRepository.drizzle.ts)

All of the above have corresponding `*.unit.test.ts` coverage files.

## Findings

### 1. Drizzle schema is ahead of the mission tracker

- `mind_maps`, `mind_map_nodes`, `mind_map_edges`, and `migration_history` are already present in [src/db/drizzleSchema.ts](/Users/vishnugnair/Guru/debug/src/db/drizzleSchema.ts).
- The tracker still lists `schema-014` and `schema-015` as pending, but the schema work itself already exists and was covered by the parity suite.
- That evidence is now stronger than before because both:
  - [src/db/testing/drizzleSchemaParity.unit.test.ts](/Users/vishnugnair/Guru/debug/src/db/testing/drizzleSchemaParity.unit.test.ts)
  - [src/db/drizzleQueryParity.db.test.ts](/Users/vishnugnair/Guru/debug/src/db/drizzleQueryParity.db.test.ts)
    are passing against the current codebase.

### 2. Legacy query contracts do not always match the real SQLite schema

- The legacy `mindMaps` query layer exposes `explanation` on nodes and `isCrossLink` on edges.
- The actual SQLite schema in [src/db/schema.ts](/Users/vishnugnair/Guru/debug/src/db/schema.ts) does not have those columns.
- The Drizzle repository preserves the public return shape by defaulting:
  - node `explanation` to `null`
  - edge `isCrossLink` to `false`
- No invalid writes are attempted for those non-existent columns.

### 3. Repository verification is currently split across two Jest paths

- Standard `npm run test:unit ...` still hits the existing `jest.setup.js` / Babel mock issue involving `_ReactNativeCSSInterop`.
- Repository verification is reliable with single-thread isolated Jest runs using:
  - `--runInBand`
  - `--setupFilesAfterEnv=/tmp/empty-jest-setup.js`

### 4. Migration work surfaced unrelated repo-level type issues

While integrating repository slices, the following unrelated or adjacent issues had to be cleaned up so `tsc --noEmit` stayed green:

- duplicate JSX attributes in `SettingsToggleRow`
- settings sidebar prop mismatch around `icon`
- nullable Google Drive client-id handling in `StorageSections`
- a few repository-test typing mismatches from mocked tuple access

## Latest Verification Snapshot

Verified clean during the latest advanced-feature batch:

```bash
npm run typecheck
./node_modules/.bin/jest --runInBand --config jest.unit.config.js --setupFilesAfterEnv=/tmp/empty-jest-setup.js --testPathPatterns=src/db/repositories/brainDumpsRepository.drizzle.unit.test.ts --testPathPatterns=src/db/repositories/questionBankRepository.drizzle.unit.test.ts --testPathPatterns=src/db/repositories/mindMapsRepository.drizzle.unit.test.ts
```

Result:

- `typecheck` passed
- advanced repository suites passed (`21/21` tests)

Verified clean during the latest parity-validation batch:

```bash
npm run typecheck
./node_modules/.bin/jest --runInBand --config jest.unit.config.js --setupFilesAfterEnv=/tmp/empty-jest-setup.js --testPathPatterns=src/db/testing/drizzleSchemaParity.unit.test.ts --testPathPatterns=src/db/drizzleQueryParity.db.test.ts
```

Result:

- `typecheck` passed
- schema parity + query parity suites passed (`8/8` tests)

## Remaining Work

Pending mission items:

- `perf-001` — performance benchmarking suite
- `integration-001` — Zustand store integration validation
- `integration-002` — React Native / Expo SQLite integration
- `integration-003` — rollback capability and error handling
- `validation-001` — comprehensive validation report generation

## Recommendation For Next Slice

Highest-yield next step:

1. Build `perf-001` around the completed repository/query parity set.
2. Add integration validation for store wiring and Expo SQLite runtime paths.
3. Use the parity evidence already collected here as input to the final validation report.
