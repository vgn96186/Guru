---
name: drizzle-schema-worker
description: Migrates SQL tables to Drizzle ORM schema definitions
---

# Drizzle Schema Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use this worker for migrating SQL table definitions to Drizzle ORM schema in `drizzleSchema.ts`. Handles:

- Adding new table definitions to `src/db/drizzleSchema.ts`
- Updating Drizzle schema parity tests
- Generating baseline migration SQL
- Verifying schema parity between Drizzle definitions and actual SQL tables

## Required Skills

None - this is a TypeScript/Jest testing and code modification task.

## Work Procedure

### Phase 1: Investigation & Planning

1. **Analyze the target table**: Read the existing CREATE TABLE statement from `src/db/schema.ts`
2. **Check dependencies**: Identify foreign key relationships and table dependencies
3. **Review existing queries**: Look at how the table is used in `src/db/queries/` files
4. **Plan the migration**: Note any complex constraints, indexes, or unique requirements

### Phase 2: Test-First Development

5. **Run existing parity test**: `npm run test:unit -- --testPathPattern=drizzleSchemaParity` to see current state
6. **Write failing parity test**: Update `DRIZZLE_TABLE_MAP` in parity test to include new table
7. **Verify test fails**: Run parity test again - should fail because table not in Drizzle schema

### Phase 3: Implementation

8. **Add Drizzle schema definition**: Add table to `src/db/drizzleSchema.ts` using correct Drizzle types
9. **Handle special cases**:
   - Boolean columns: Use `integer('column', { mode: 'boolean' })`
   - JSON columns: Use `text('column')` with JSON parsing in repository
   - Default values: Match SQL defaults exactly
   - Foreign keys: Use `references(() => otherTable.id)`
10. **Add type exports**: Include `$inferSelect` and `$inferInsert` types if needed

### Phase 4: Verification

11. **Run parity test**: `npm run test:unit -- --testPathPattern=drizzleSchemaParity` - should pass for new table
12. **Run type checking**: `npm run typecheck` - fix any TypeScript errors
13. **Run linting**: `npm run lint` - fix any lint errors
14. **Run all tests**: `npm run test:unit` - ensure no regressions
15. **Generate baseline migration**: `npx drizzle-kit generate` to create SQL in `src/db/drizzle-migrations/`

### Phase 5: Manual Verification

16. **Inspect generated SQL**: Check `src/db/drizzle-migrations/` for the new table SQL
17. **Verify column mapping**: Ensure every SQL column has corresponding Drizzle column
18. **Test with actual queries**: Write a small test script or use existing queries to verify

## Example Handoff

```json
{
  "salientSummary": "Migrated 'subjects' table to Drizzle ORM schema. Added sqliteTable definition with 7 columns (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order). Updated DRIZZLE_TABLE_MAP in parity test. All parity tests pass (4/4). Generated baseline migration SQL in src/db/drizzle-migrations/0001_subjects.sql.",
  "whatWasImplemented": "Added 'subjects' table definition to src/db/drizzleSchema.ts with proper Drizzle column types matching SQL schema. Updated src/db/testing/drizzleSchemaParity.unit.test.ts DRIZZLE_TABLE_MAP to include subjects table. Generated migration SQL via drizzle-kit.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npm run test:unit -- --testPathPattern=drizzleSchemaParity",
        "exitCode": 0,
        "observation": "4 tests passed, including new subjects table verification"
      },
      {
        "command": "npm run typecheck",
        "exitCode": 0,
        "observation": "No TypeScript errors introduced"
      },
      {
        "command": "npm run lint",
        "exitCode": 0,
        "observation": "No new lint errors"
      },
      {
        "command": "npx drizzle-kit generate",
        "exitCode": 0,
        "observation": "Generated migration SQL in src/db/drizzle-migrations/"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Inspected generated migration SQL",
        "observed": "CREATE TABLE subjects (...) matches original SQL schema exactly"
      },
      {
        "action": "Verified column mappings in TypeScript",
        "observed": "All 7 SQL columns have corresponding Drizzle columns with correct types"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src/db/testing/drizzleSchemaParity.unit.test.ts",
        "cases": [
          {
            "name": "every Drizzle table export maps to a real DB table (includes subjects)",
            "verifies": "DRIZZLE_TABLE_MAP includes subjects → subjects mapping"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Table has complex constraints not supported by Drizzle SQLite dialect
- Foreign key relationships create circular dependencies
- Existing raw SQL queries use features not easily expressed in Drizzle
- Type mismatches between SQL schema and TypeScript types
- Performance concerns with Drizzle query generation for this table
