# Room vs current SQLite (expo-sqlite) — is Room a good idea?

## Short answer: **No** for this app

Room is an **Android-only**, **native** (Kotlin/Java) persistence library. Guru is an **Expo / React Native** app: all DB access is in **JavaScript/TypeScript** via **expo-sqlite**. Moving to Room would mean rewriting the DB layer in Kotlin, exposing it to JS via native modules, and maintaining a different persistence story on iOS. That’s a large, platform-specific rewrite with little benefit for your current architecture.

---

## What Room is

- **Android Jetpack** library on top of SQLite (Java/Kotlin).
- Gives: compile-time SQL checks, DAOs, type-safe queries, migrations, LiveData/Flow.
- Runs in the **native** Android process. Your app logic runs in the **JS** process and talks to the DB via expo-sqlite.

So:

- **Room** = native Android only.
- **expo-sqlite** = cross-platform (Android + iOS), same TS/JS API you use today.

Using Room would imply:

1. Implementing all tables, queries, and migrations again in Kotlin (Room entities, DAOs).
2. Building a **native module** so React Native can call into Room (every screen that reads/writes DB would go through the bridge).
3. On **iOS**, you’d need a different native solution (e.g. raw SQLite or Core Data) and the same bridge pattern, or you’d end up with two completely different DB stacks.

That’s a lot of cost and platform lock-in for limited gain in an Expo app.

---

## When Room _is_ a good idea

- **Native Android-only** app (no React Native, no Expo).
- You want Jetpack integrations (WorkManager, Paging, etc.) and are fine with Android-only.

For a **cross-platform Expo app** that already uses **expo-sqlite**, Room is not a good fit.

---

## Better ways to improve your current SQLite (expo-sqlite)

You already have:

- Single DB instance, WAL mode, versioned migrations, repository/query layer.

Improvements that _do_ make sense:

### 1. Keep expo-sqlite, harden what you have

- **Migrations:** You already use `user_version` and `migration_history`. Keep migration SQL in one place and run them in order; avoid schema changes outside migrations.
- **Indexes:** Ensure hot paths (e.g. topic_progress by status, sessions by date) have indexes; you already have `DB_INDEXES` — review with real query patterns.
- **Async only:** You’re already on `runAsync` / `getFirstAsync` / `getAllAsync`; avoid any sync DB work on the JS thread.
- **Type safety:** Add small helpers or a thin query builder so `getAllAsync<T>()` is typed and consistent across `queries/` and `repositories/`.

### 2. Consider WatermelonDB only if you need its benefits

- **WatermelonDB** is built for React Native: sync, lazy loading, multi-threaded (native) access, observable queries.
- Fits if you need **sync**, **very large lists**, or **observable** data without pulling the whole table. Migration from expo-sqlite is non-trivial (different schema/API).
- If your current DB size and list sizes are fine and you don’t need sync, staying on expo-sqlite is simpler.

### 3. Optional: prepared statements / batching

- expo-sqlite supports prepared statements. For hot loops (e.g. bulk inserts in migrations or sync), prepare once and run multiple times to reduce overhead.
- Batch related writes in a single transaction where possible (you may already do this in places).

### 4. Don’t add Room to this stack

- Room would live in the native Android layer; all your logic is in JS. You’d duplicate schema and logic and maintain a bridge for every DB operation. Not worth it for this app.

---

## Summary

| Approach              | Fit for Guru (Expo/RN) | Notes                                         |
| --------------------- | ---------------------- | --------------------------------------------- |
| **Room**              | No                     | Android-only, native; JS would need a bridge. |
| **Keep expo-sqlite**  | Yes                    | Cross-platform, already integrated.           |
| **Harden current DB** | Yes                    | Migrations, indexes, types, batching.         |
| **WatermelonDB**      | Maybe                  | Only if you need sync or very large lists.    |

**Recommendation:** Do **not** implement Room. Improve the existing **expo-sqlite** setup (migrations, indexes, types, transactions) and only consider WatermelonDB if you later need sync or heavy scalability.

---

## Improvements made to the current setup

- **`runInTransaction(fn)`** in `database.ts` — runs a callback in a single transaction (BEGIN → fn → COMMIT, or ROLLBACK on throw). Use for any multi-statement write.
- **Refactored to use it:** `addXp`, `resetStudyProgress` (progress.ts), `endSession`, `updateSessionProgress` (sessions.ts), `recordTopicProgress` (topics.ts). Other manual BEGIN/COMMIT/ROLLBACK blocks can be migrated the same way.
- **`src/db/README.md`** — documents patterns: getDb, async-only, runInTransaction, typing with getFirstAsync/getAllAsync, schema vs migrations, indexes, and folder structure.
- **Indexes** — existing `DB_INDEXES` in schema.ts already cover the main query paths; no new indexes added. When adding new filtered/sorted queries, add a matching index there.
