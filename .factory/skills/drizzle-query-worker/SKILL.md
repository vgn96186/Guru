---
name: drizzle-query-worker
description: Migrates raw SQL queries to Drizzle ORM repositories
---

# Drizzle Query Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use this worker for migrating raw SQL queries to Drizzle ORM repositories. Handles:
- Creating repository files following `profileRepository.drizzle.ts` pattern
- Migrating queries from `src/db/queries/` files to Drizzle repositories
- Implementing fallback support during transition
- Writing comprehensive tests for migrated queries

## Required Skills

None - this is a TypeScript/Jest testing and code modification task.

## Work Procedure

### Phase 1: Investigation & Analysis
1. **Identify target queries**: Analyze which queries in `src/db/queries/` files use the target table
2. **Understand query patterns**: Note SELECT, INSERT, UPDATE, DELETE operations
3. **Check transaction usage**: Look for `runInTransaction` or complex multi-query operations
4. **Review business logic**: Understand the context and requirements of each query

### Phase 2: Repository Design
5. **Create repository file**: `src/db/repositories/{tableName}Repository.drizzle.ts`
6. **Import dependencies**: Drizzle db, schema, and any utilities
7. **Design repository interface**: Methods for each query operation
8. **Plan fallback strategy**: How to maintain compatibility with existing raw SQL

### Phase 3: Test-First Implementation
9. **Write failing tests**: Create or update `{tableName}Repository.unit.test.ts` with Drizzle repository tests
10. **Verify tests fail**: Run tests - should fail because repository not implemented
11. **Implement repository**: Create repository methods using Drizzle query builder
12. **Add fallback support**: Implement dual-write or feature flag if needed

### Phase 4: Query Migration
13. **Update query files**: Replace raw SQL in `src/db/queries/` files with repository calls
14. **Maintain compatibility**: Keep old queries commented or feature-flagged during transition
15. **Update imports**: Ensure all files importing queries get repository imports
16. **Handle edge cases**: Transactions, error handling, performance optimizations

### Phase 5: Verification & Validation
17. **Run unit tests**: `npm run test:unit -- --testPathPattern={tableName}` - all should pass
18. **Run type checking**: `npm run typecheck` - fix any TypeScript errors
19. **Run linting**: `npm run lint` - fix any lint errors
20. **Run all tests**: `npm run test:unit` - ensure no regressions
21. **Performance test**: Compare query execution times if significant

### Phase 6: Manual Verification
22. **Test integration**: Create integration test or manual test script
23. **Verify fallback**: Test both Drizzle and raw SQL paths if fallback maintained
24. **Check error handling**: Verify errors are properly caught and handled
25. **Document changes**: Update any relevant documentation

## Example Handoff

```json
{
  "salientSummary": "Migrated 'subjects' queries to Drizzle ORM repository. Created subjectsRepository.drizzle.ts with 5 methods (getAll, getById, create, update, delete). Updated topics.ts queries to use repository. All 12 subject-related tests pass. Maintained raw SQL fallback via feature flag.",
  "whatWasImplemented": "Created src/db/repositories/subjectsRepository.drizzle.ts with complete CRUD operations using Drizzle query builder. Updated 8 queries in src/db/queries/topics.ts to use repository methods. Added feature flag SUBJECTS_USE_DRIZZLE for gradual rollout. Wrote 12 unit tests covering all repository methods.",
  "whatWasLeftUndone": "Legacy raw SQL queries remain commented out, to be removed after full migration validation.",
  "verification": {
    "commandsRun": [
      {
        "command": "npm run test:unit -- --testPathPattern=subjects",
        "exitCode": 0,
        "observation": "12 tests passed, including new repository tests"
      },
      {
        "command": "npm run typecheck",
        "exitCode": 0,
        "observation": "No TypeScript errors introduced"
      },
      {
        "command": "npm run lint",
        "exitCode": 0,
        "observation": "2 lint warnings about unused imports, no errors"
      },
      {
        "command": "npm run test:unit",
        "exitCode": 0,
        "observation": "All 1006 tests pass, no regressions"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Tested repository methods manually",
        "observed": "CRUD operations work correctly, foreign key constraints enforced"
      },
      {
        "action": "Verified fallback mechanism",
        "observed": "Feature flag correctly switches between Drizzle and raw SQL"
      },
      {
        "action": "Checked query performance",
        "observed": "Drizzle queries within 5% of raw SQL performance"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src/db/repositories/subjectsRepository.unit.test.ts",
        "cases": [
          {
            "name": "getAll returns all subjects",
            "verifies": "Repository getAll method returns correct data"
          },
          {
            "name": "getById returns specific subject",
            "verifies": "Repository getById with valid ID returns subject"
          },
          {
            "name": "getById returns null for invalid ID",
            "verifies": "Repository getById with invalid ID returns null"
          },
          {
            "name": "create inserts new subject",
            "verifies": "Repository create method inserts and returns new subject"
          },
          {
            "name": "update modifies existing subject",
            "verifies": "Repository update method modifies subject fields"
          },
          {
            "name": "delete removes subject",
            "verifies": "Repository delete method removes subject from database"
          }
        ]
      }
    ]
  },
  "discoveredIssues": [
    {
      "severity": "low",
      "description": "Two unused imports in topics.ts after migration",
      "suggestedFix": "Remove unused imports or keep for future reference"
    }
  ]
}
```

## When to Return to Orchestrator

- Query has complex SQL features not supported by Drizzle (CTEs, window functions)
- Performance regression exceeds 20% for critical queries
- Transaction handling reveals concurrency issues
- Business logic depends on SQLite-specific features
- Migration affects more than 10 files significantly
