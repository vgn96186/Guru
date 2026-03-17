# Should we implement Drizzle ORM?

## Short answer: **Optional — not necessary, but nice if you want type-safe queries and live queries**

Drizzle has first-class **expo-sqlite** support and would work in this app. The trade-off is migration cost and a different way of writing queries; the current setup is already solid.

---

## What Drizzle would give you

| Benefit               | Today                                                    | With Drizzle                                                            |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Type-safe queries** | Manual `getFirstAsync<{ id: number; ... }>(sql, params)` | `db.select().from(users).where(eq(users.id, 1))` — types from schema    |
| **Schema as code**    | SQL strings in `schema.ts`                               | TS tables + columns; one source of truth                                |
| **Reactive UI**       | Event bus (`notifyDbUpdate` → store refresh)             | `useLiveQuery(db.select()...)` — component re-renders when data changes |
| **Migrations**        | Hand-written versioned SQL array + `user_version`        | Drizzle Kit generates SQL; `useMigrations` runs them (different flow)   |
| **Dev experience**    | Raw SQL                                                  | Query builder, optional Drizzle Studio on device                        |

---

## What it would cost

1. **expo-sqlite API**  
   Drizzle’s Expo driver uses **`openDatabaseSync`**. This codebase uses **`openDatabaseAsync`** everywhere. You’d either switch to the sync API for the single DB instance passed to Drizzle (expo-sqlite still does I/O off the JS thread) or confirm Drizzle supports the async API in your version. Docs currently show sync.

2. **Migration system**  
   You have 59+ versioned migrations and `PRAGMA user_version`. Drizzle Kit uses its own migration runner and SQL files. You’d either:
   - Keep running existing migrations on init, then use Drizzle only for **new** schema and queries, or
   - Export current schema into Drizzle, generate one “baseline” migration, and move fully to Drizzle migrations (one-time, non-trivial).

3. **Query migration**  
   All reads/writes in `queries/` and `repositories/` are raw SQL. Moving to Drizzle means rewriting those as Drizzle queries (or a mix). Doable incrementally (table by table), but real work.

4. **Dependencies and config**  
   Add `drizzle-orm`, align with Drizzle’s recommended `expo-sqlite` version (e.g. `expo-sqlite@next` in their docs), and optionally add `drizzle-kit`, babel plugin for bundling SQL migrations, and Metro config for `.sql` files.

---

## When it’s worth it

- You want **live queries** (`useLiveQuery`) so screens update when the DB changes without manual `notifyDbUpdate` + refresh.
- You want **schema and query types** in one place and are happy to move off raw SQL over time.
- You’re adding a lot of **new** tables or features and prefer a query builder over long SQL strings.
- You’re okay doing a **phased** migration: keep existing migrations and DB init, introduce Drizzle next to them, then migrate queries and optionally migrations gradually.

## When to skip it

- The current setup (raw SQL + typed results + `runInTransaction` + event-based refresh) is fine and you’d rather **avoid churn**.
- You don’t need **reactive hooks** and are fine with the existing event bus + store refresh.
- You don’t want to touch **migrations** (versioned array + `user_version` works and is already documented).

---

## Recommendation

- **Don’t do it just for “best practice”.** The current design is valid and maintainable.
- **Consider it if** you specifically want (1) live queries, or (2) schema + query builder as the main way to work with the DB, and you’re willing to migrate in phases.
- If you try it, do it **incrementally**: add Drizzle next to the current DB layer, use it for one module (e.g. `topic_progress` or `ai_cache`), keep existing migrations and init. Then decide whether to expand or roll back.

**Summary:** Drizzle is supported with expo-sqlite and can be “worth it” for live queries and type-safe schema/queries, but it’s **optional**. Staying with the current expo-sqlite + raw SQL + events is a reasonable choice unless you have a clear need for what Drizzle adds.
