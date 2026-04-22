# Drizzle ORM Migration Validation Contract

**Mission:** Migrate 27 tables from raw SQL to Drizzle ORM with incremental migration and fallback support  
**Current State:** Only `user_profile` table migrated (26 tables remaining)  
**Validation Version:** 1.0  
**Effective Date:** 2026-04-20

## 1. Executive Summary

This contract defines the validation requirements for migrating the Guru NEET-PG study app from raw SQL queries to Drizzle ORM. The migration must maintain 100% functional parity, zero data loss, and preserve all existing application behaviors while improving type safety and developer experience.

### 1.1 Mission Scope

- **27 tables** defined in `src/db/schema.ts`
- **Incremental migration**: One table at a time with validation checkpoints
- **Fallback support**: Raw SQL queries remain available during transition
- **Zero downtime**: Application must remain fully functional throughout migration

### 1.2 Validation Principles

1. **Safety First**: No breaking changes to production data or user experience
2. **Incremental Verification**: Each migrated table must pass all validation gates before proceeding
3. **Cross-Validation**: Multiple independent validation methods must agree
4. **Evidence-Based**: All validation results must be documented with concrete evidence
5. **Automation Priority**: Automated validation preferred over manual verification

## 2. Validation Areas and Assertions

### 2.1 SCHEMA Area (Table Structure Validation)

**Purpose**: Ensure Drizzle schema definitions exactly match SQL table structures

| ID             | Title                     | Behavioral Description                                                | Tool                              | Evidence Requirements                            |
| -------------- | ------------------------- | --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| VAL-SCHEMA-001 | Table Existence Parity    | Every SQL table has a corresponding Drizzle table definition          | drizzle-kit + manual-verification | Console output showing all 27 tables mapped      |
| VAL-SCHEMA-002 | Column Name Parity        | Every column in SQL table exists in Drizzle definition with same name | drizzleSchemaParity.unit.test     | Test results showing 0 mismatches                |
| VAL-SCHEMA-003 | Column Type Compatibility | Drizzle column types are compatible with SQL column types             | tsc + manual-verification         | TypeScript compilation with no errors            |
| VAL-SCHEMA-004 | Constraint Preservation   | CHECK constraints, NOT NULL, DEFAULT values preserved                 | manual-verification + jest        | Test results showing constraint behavior matches |
| VAL-SCHEMA-005 | Foreign Key Mapping       | Foreign key relationships correctly mapped in Drizzle                 | drizzle-kit + jest                | Schema diff showing FK relationships             |
| VAL-SCHEMA-006 | Index Parity              | All SQL indexes have equivalent Drizzle index definitions             | manual-verification               | Console output showing index comparison          |
| VAL-SCHEMA-007 | Primary Key Mapping       | Primary keys correctly defined in Drizzle schema                      | jest                              | Test results showing PK behavior                 |

### 2.2 QUERY Area (Data Access Validation)

**Purpose**: Ensure Drizzle queries produce identical results to raw SQL queries

| ID            | Title                     | Behavioral Description                                                    | Tool | Evidence Requirements                      |
| ------------- | ------------------------- | ------------------------------------------------------------------------- | ---- | ------------------------------------------ |
| VAL-QUERY-001 | SELECT Query Parity       | SELECT queries return identical rows and column values                    | jest | Test results with data comparison          |
| VAL-QUERY-002 | INSERT Query Parity       | INSERT operations create identical rows with same auto-increment behavior | jest | Test results showing inserted data matches |
| VAL-QUERY-003 | UPDATE Query Parity       | UPDATE operations modify exactly the same rows with same values           | jest | Test results with before/after comparison  |
| VAL-QUERY-004 | DELETE Query Parity       | DELETE operations remove exactly the same rows                            | jest | Test results showing row count matches     |
| VAL-QUERY-005 | JOIN Query Accuracy       | JOIN operations produce identical result sets                             | jest | Test results with complex join validation  |
| VAL-QUERY-006 | Aggregate Function Parity | COUNT, SUM, AVG, etc. produce identical results                           | jest | Test results with aggregate comparison     |
| VAL-QUERY-007 | Transaction Support       | Transactions commit/rollback identically                                  | jest | Test results showing transaction behavior  |
| VAL-QUERY-008 | Parameter Binding         | Query parameters are correctly bound and escaped                          | jest | Test results with SQL injection test cases |
| VAL-QUERY-009 | NULL Handling             | NULL values are handled identically in queries                            | jest | Test results with NULL edge cases          |
| VAL-QUERY-010 | Date/Time Handling        | Date and time values are processed identically                            | jest | Test results with timestamp comparison     |

### 2.3 TEST Area (Test Suite Validation)

**Purpose**: Ensure all existing tests pass with Drizzle implementation

| ID           | Title                   | Behavioral Description                              | Tool                       | Evidence Requirements                            |
| ------------ | ----------------------- | --------------------------------------------------- | -------------------------- | ------------------------------------------------ |
| VAL-TEST-001 | Unit Test Pass Rate     | All existing unit tests pass with Drizzle queries   | jest                       | Test results showing 100% pass rate              |
| VAL-TEST-002 | Database Test Isolation | Database tests don't interfere with each other      | jest                       | Test results showing no cross-test contamination |
| VAL-TEST-003 | Mock Compatibility      | Existing mocks work correctly with Drizzle          | jest                       | Test results showing mock behavior unchanged     |
| VAL-TEST-004 | Test Performance        | Test execution time doesn't degrade significantly   | jest + manual-verification | Console output showing timing comparison         |
| VAL-TEST-005 | Coverage Maintenance    | Code coverage remains at or above current levels    | jest --coverage            | Coverage report showing maintained coverage      |
| VAL-TEST-006 | Integration Test Pass   | Integration tests pass with mixed SQL/Drizzle usage | jest                       | Test results showing integration success         |
| VAL-TEST-007 | Edge Case Coverage      | All edge cases from existing tests are covered      | manual-verification        | Documentation of edge case validation            |

### 2.4 TYPE Area (Type Safety Validation)

**Purpose**: Ensure TypeScript types are correct and provide better safety

| ID           | Title                   | Behavioral Description                                           | Tool                      | Evidence Requirements                      |
| ------------ | ----------------------- | ---------------------------------------------------------------- | ------------------------- | ------------------------------------------ |
| VAL-TYPE-001 | TypeScript Compilation  | Project compiles with `tsc --noEmit` without errors              | tsc                       | Console output showing 0 type errors       |
| VAL-TYPE-002 | Infer Types Accuracy    | `$inferSelect` and `$inferInsert` types match actual data shapes | tsc + manual-verification | Type checking results                      |
| VAL-TYPE-003 | Query Result Typing     | Drizzle query results have correct TypeScript types              | tsc                       | TypeScript compilation success             |
| VAL-TYPE-004 | Parameter Type Safety   | Query parameters are type-checked at compile time                | tsc                       | Type error examples for invalid parameters |
| VAL-TYPE-005 | Relationship Typing     | Foreign key relationships have correct type annotations          | tsc                       | Type checking results for related queries  |
| VAL-TYPE-006 | Migration Compatibility | Existing code works with new Drizzle types without changes       | tsc                       | Compilation without modifying call sites   |

### 2.5 LINT Area (Code Quality Validation)

**Purpose**: Ensure code quality standards are maintained

| ID           | Title                  | Behavioral Description                                | Tool              | Evidence Requirements                      |
| ------------ | ---------------------- | ----------------------------------------------------- | ----------------- | ------------------------------------------ |
| VAL-LINT-001 | ESLint Compliance      | All Drizzle-related code passes ESLint rules          | eslint            | Lint report showing 0 errors               |
| VAL-LINT-002 | No New Warnings        | Drizzle migration doesn't introduce new lint warnings | eslint            | Lint report comparison showing no increase |
| VAL-LINT-003 | Code Style Consistency | Drizzle code follows existing code style patterns     | eslint + prettier | Formatting check results                   |
| VAL-LINT-004 | Import Organization    | Drizzle imports are organized correctly               | eslint            | Import validation results                  |

### 2.6 PERFORMANCE Area (Performance Validation)

**Purpose**: Ensure Drizzle doesn't degrade application performance

| ID           | Title                     | Behavioral Description                                       | Tool                       | Evidence Requirements               |
| ------------ | ------------------------- | ------------------------------------------------------------ | -------------------------- | ----------------------------------- |
| VAL-PERF-001 | Query Execution Time      | Drizzle queries execute within 10% of SQL query times        | jest + manual-verification | Timing measurements comparison      |
| VAL-PERF-002 | Memory Usage              | Drizzle doesn't significantly increase memory usage          | manual-verification        | Memory profiling results            |
| VAL-PERF-003 | Bundle Size Impact        | Drizzle adds less than 50KB to bundle size                   | manual-verification        | Bundle size measurements            |
| VAL-PERF-004 | Cold Start Time           | Application cold start time doesn't increase by more than 5% | manual-verification        | Startup timing measurements         |
| VAL-PERF-005 | Concurrent Query Handling | Drizzle handles concurrent queries without deadlocks         | jest                       | Test results with concurrent access |

### 2.7 INTEGRATION Area (System Integration Validation)

**Purpose**: Ensure Drizzle integrates correctly with entire application stack

| ID          | Title                      | Behavioral Description                                  | Tool                       | Evidence Requirements                   |
| ----------- | -------------------------- | ------------------------------------------------------- | -------------------------- | --------------------------------------- |
| VAL-INT-001 | Zustand Store Integration  | Zustand stores work correctly with Drizzle repositories | jest                       | Test results showing store behavior     |
| VAL-INT-002 | React Native Compatibility | Drizzle works correctly in React Native environment     | jest + manual-verification | Test results in RN context              |
| VAL-INT-003 | Expo SQLite Integration    | Drizzle uses expo-sqlite correctly                      | jest                       | Test results showing SQLite interaction |
| VAL-INT-004 | Async/Await Pattern        | All Drizzle operations support async/await pattern      | jest                       | Test results with async operations      |
| VAL-INT-005 | Error Handling             | Drizzle errors are caught and handled appropriately     | jest                       | Test results with error scenarios       |
| VAL-INT-006 | Migration Rollback         | Can rollback to SQL queries if Drizzle fails            | manual-verification        | Rollback procedure documentation        |

## 3. Validation Surfaces

### 3.1 Schema Migration Surface

**Purpose**: Validate table structure migration

**Required Validations**:

- VAL-SCHEMA-001 through VAL-SCHEMA-007
- VAL-TYPE-001 through VAL-TYPE-006
- VAL-LINT-001 through VAL-LINT-004

**Evidence Collection**:

1. Drizzle schema definition file (`drizzleSchema.ts`)
2. Schema parity test results
3. TypeScript compilation output
4. ESLint report

### 3.2 Query Migration Surface

**Purpose**: Validate query functionality migration

**Required Validations**:

- VAL-QUERY-001 through VAL-QUERY-010
- VAL-TEST-001 through VAL-TEST-007
- VAL-PERF-001 through VAL-PERF-005

**Evidence Collection**:

1. Query test suite results
2. Performance benchmark data
3. Integration test results
4. Manual verification checklist

### 3.3 Integration Surface

**Purpose**: Validate system-wide integration

**Required Validations**:

- VAL-INT-001 through VAL-INT-006
- Cross-area validation samples

**Evidence Collection**:

1. End-to-end test results
2. Application runtime logs
3. User interaction testing
4. Fallback procedure verification

## 4. Cross-Area Validation Flows

### 4.1 End-to-End Data Flow Validation

**Flow**: UI Action → Repository Method → Drizzle Query → Database → Response → UI Update

**Validation Points**:

1. **UI Layer**: User interaction triggers correct repository method
2. **Repository Layer**: Method calls appropriate Drizzle query
3. **Query Layer**: Drizzle generates correct SQL
4. **Database Layer**: SQL executes and returns data
5. **Response Layer**: Data is correctly transformed
6. **Update Layer**: UI updates with correct data

**Evidence Required**:

- Screenshot of UI before/after action
- Console log of repository method call
- SQL query log from Drizzle
- Database response data
- Final UI state verification

### 4.2 Error Handling Flow Validation

**Flow**: Error Condition → Drizzle Error → Repository Handling → UI Feedback

**Validation Points**:

1. **Error Generation**: Drizzle produces appropriate error
2. **Error Propagation**: Error flows through repository layer
3. **Error Handling**: Repository handles error appropriately
4. **User Feedback**: UI shows appropriate error message

**Evidence Required**:

- Console error output
- Repository error handling code
- UI error state screenshot
- User recovery flow verification

### 4.3 Transaction Flow Validation

**Flow**: Transaction Start → Multiple Operations → Commit/Rollback → State Consistency

**Validation Points**:

1. **Transaction Start**: Drizzle transaction begins correctly
2. **Operation Execution**: Queries execute within transaction
3. **Commit/Rollback**: Transaction completes appropriately
4. **State Verification**: Database state matches expectations

**Evidence Required**:

- Transaction timing logs
- Database state before/after
- Rollback scenario testing
- Concurrent transaction handling

## 5. Milestone Validation Gates

### 5.1 Milestone 1: Foundation and Tooling

**Tables**: `user_profile` (already migrated)
**Validations**: VAL-SCHEMA-001 through VAL-SCHEMA-007, VAL-TYPE-001 through VAL-TYPE-006
**Exit Criteria**: All schema validations pass, type system works correctly

### 5.2 Milestone 2: Core Study Tables

**Tables**: `subjects`, `topics`, `topic_progress`
**Validations**: VAL-QUERY-001 through VAL-QUERY-010, VAL-TEST-001 through VAL-TEST-007
**Exit Criteria**: Core study queries work identically, all tests pass

### 5.3 Milestone 3: Session Management

**Tables**: `sessions`, `daily_log`, `daily_agenda`, `plan_events`
**Validations**: VAL-PERF-001 through VAL-PERF-005, VAL-INT-001 through VAL-INT-003
**Exit Criteria**: Session management performs well, integrates correctly

### 5.4 Milestone 4: Lecture System

**Tables**: `lecture_notes`, `lecture_learned_topics`, `external_app_logs`, `lecture_schedule_progress`
**Validations**: Cross-area validation flows, error handling scenarios
**Exit Criteria**: Complex lecture workflows work end-to-end

### 5.5 Milestone 5: AI and Content

**Tables**: `ai_cache`, `topic_suggestions`, `generated_study_images`, `content_fact_checks`, `user_content_flags`
**Validations**: VAL-INT-004 through VAL-INT-006, performance benchmarks
**Exit Criteria**: AI content system performs without degradation

### 5.6 Milestone 6: Chat and Collaboration

**Tables**: `guru_chat_threads`, `guru_chat_session_memory`, `chat_history`, `offline_ai_queue`
**Validations**: Concurrent access testing, transaction validation
**Exit Criteria**: Chat system handles concurrent users correctly

### 5.7 Milestone 7: Advanced Features

**Tables**: `brain_dumps`, `question_bank`, `mind_maps`, `mind_map_nodes`, `mind_map_edges`
**Validations**: Full system integration, rollback capability verification
**Exit Criteria**: All 27 tables migrated, system fully functional with Drizzle

## 6. Evidence Requirements

### 6.1 Automated Evidence

**Required for all validations**:

1. **Test Results**: Jest output showing pass/fail status
2. **Coverage Reports**: Code coverage metrics for migrated code
3. **TypeScript Output**: Compilation results with 0 errors
4. **Lint Reports**: ESLint compliance reports
5. **Performance Metrics**: Query timing measurements

### 6.2 Manual Evidence

**Required for critical validations**:

1. **Screenshots**: UI before/after migration for key workflows
2. **Console Logs**: SQL query generation and execution logs
3. **Database Dumps**: Sample data before/after migration
4. **User Flow Documentation**: Step-by-step verification of user journeys
5. **Error Scenario Testing**: Documented error handling verification

### 6.3 Integration Evidence

**Required for system validation**:

1. **End-to-End Test Results**: Complete user journey testing
2. **Concurrency Testing**: Multiple simultaneous user scenarios
3. **Rollback Verification**: Successful fallback to SQL queries
4. **Performance Comparison**: Before/after performance metrics
5. **Memory Usage Analysis**: Runtime memory consumption comparison

## 7. Validation Tools and Commands

### 7.1 Primary Validation Commands

```bash
# Schema Parity Validation
npm run test:unit -- src/db/testing/drizzleSchemaParity.unit.test.ts

# Type Safety Validation
npm run typecheck

# Lint Compliance Validation
npm run lint

# Full Test Suite Validation
npm run test:unit

# Performance Benchmarking
node scripts/benchmark-queries.js
```

### 7.2 Evidence Collection Commands

```bash
# Collect test results
npm run test:unit:coverage > test-results-$(date +%Y%m%d).txt

# Generate type checking report
npm run typecheck 2> type-errors-$(date +%Y%m%d).txt

# Run performance benchmarks
node scripts/benchmark-queries.js --table=topic_progress --iterations=1000
```

### 7.3 Manual Verification Checklists

Each table migration requires manual verification of:

1. [ ] All CRUD operations work correctly
2. [ ] Error scenarios handled appropriately
3. [ ] Performance meets requirements
4. [ ] Integration with dependent features works
5. [ ] Rollback procedure tested and documented

## 8. Risk Mitigation Strategies

### 8.1 Technical Risks

**Risk**: Schema mismatch causing data corruption  
**Mitigation**: VAL-SCHEMA-002 through VAL-SCHEMA-007, automated parity testing

**Risk**: Performance degradation in critical queries  
**Mitigation**: VAL-PERF-001 through VAL-PERF-005, performance benchmarking

**Risk**: Type system incompatibilities  
**Mitigation**: VAL-TYPE-001 through VAL-TYPE-006, comprehensive type checking

### 8.2 Process Risks

**Risk**: Incomplete migration leaving orphaned SQL queries  
**Mitigation**: Code search validation, repository layer abstraction

**Risk**: Regression in existing functionality  
**Mitigation**: VAL-TEST-001 through VAL-TEST-007, 100% test pass requirement

**Risk**: Unable to rollback in case of failure  
**Mitigation**: VAL-INT-006, documented and tested rollback procedures

### 8.3 Operational Risks

**Risk**: User experience disruption during migration  
**Mitigation**: Incremental migration, feature flags, user testing

**Risk**: Increased memory or storage requirements  
**Mitigation**: VAL-PERF-002 and VAL-PERF-003, resource monitoring

## 9. Acceptance Criteria

### 9.1 Mandatory Criteria (All Must Pass)

1. **100% Test Pass Rate**: All existing tests pass with Drizzle implementation
2. **Zero Type Errors**: TypeScript compilation succeeds without errors
3. **Schema Parity**: All 27 tables have exact schema matches
4. **Query Result Equality**: All queries return identical results
5. **Performance Compliance**: No query exceeds 110% of original execution time
6. **Integration Success**: All application features work correctly
7. **Rollback Capability**: Can revert to SQL queries within 30 minutes

### 9.2 Quality Criteria (90% Must Pass)

1. **Code Coverage**: Maintain or improve test coverage metrics
2. **Bundle Size**: Drizzle adds less than 75KB to final bundle
3. **Memory Usage**: Runtime memory increase less than 5%
4. **Cold Start**: Application startup time increase less than 10%
5. **Developer Experience**: Repository layer provides clear abstraction

### 9.3 Documentation Requirements

1. **Migration Report**: Document each table migration with evidence
2. **Performance Analysis**: Benchmark results for critical queries
3. **Rollback Guide**: Step-by-step rollback procedure
4. **Troubleshooting Guide**: Common issues and solutions
5. **API Documentation**: Updated repository method documentation

## 10. Change Control

### 10.1 Contract Amendments

Any changes to this validation contract require:

1. **Impact Analysis**: Assessment of how changes affect validation coverage
2. **Stakeholder Review**: Approval from technical leads and product owners
3. **Version Control**: Increment version number and document changes
4. **Communication**: Notify all team members of contract updates

### 10.2 Validation Exceptions

Exceptions to validation requirements may be granted for:

1. **Technical Limitations**: Platform constraints preventing specific validations
2. **Business Priorities**: Time-sensitive requirements with risk acceptance
3. **Alternative Validation**: Equivalent validation through different methods

**Exception Process**:

1. Document rationale for exception
2. Propose alternative validation approach
3. Obtain formal approval from technical governance
4. Update validation contract with exception details

---

## Appendix A: Table Migration Sequence

1. `user_profile` ✓ (Completed)
2. `subjects`
3. `topics`
4. `topic_progress`
5. `sessions`
6. `daily_log`
7. `lecture_notes`
8. `lecture_learned_topics`
9. `ai_cache`
10. `guru_chat_threads`
11. `guru_chat_session_memory`
12. `chat_history`
13. `brain_dumps`
14. `external_app_logs`
15. `offline_ai_queue`
16. `daily_agenda`
17. `plan_events`
18. `topic_suggestions`
19. `generated_study_images`
20. `content_fact_checks`
21. `user_content_flags`
22. `question_bank`
23. `lecture_schedule_progress`
24. `mind_maps`
25. `mind_map_nodes`
26. `mind_map_edges`
27. `migration_history`

## Appendix B: Evidence Repository Structure

```
validation-evidence/
├── schema-parity/
│   ├── 2026-04-20-user_profile/
│   │   ├── test-results.txt
│   │   ├── schema-diff.json
│   │   └── type-checking.txt
│   └── 2026-04-21-subjects/
│       ├── test-results.txt
│       └── ...
├── query-validation/
│   ├── select-queries/
│   │   ├── benchmark-results.csv
│   │   └── data-comparison.json
│   └── transaction-tests/
│       └── ...
├── performance/
│   ├── execution-times/
│   │   ├── before-migration.csv
│   │   └── after-migration.csv
│   └── memory-usage/
│       └── ...
└── integration/
    ├── end-to-end-tests/
    ├── error-scenarios/
    └── rollback-verification/
```

## Appendix C: Glossary

- **Drizzle ORM**: TypeScript ORM for SQL databases
- **Raw SQL**: Original SQL queries using string literals
- **Schema Parity**: Exact match between SQL table structure and Drizzle definition
- **Query Result Equality**: Identical data returned by SQL and Drizzle queries
- **Repository Layer**: Abstraction layer between business logic and data access
- **Validation Surface**: Category of validation activities (Schema, Query, etc.)
- **Validation Area**: Specific aspect within a surface (SCHEMA, QUERY, etc.)
- **Assertion**: Specific testable requirement with pass/fail criteria
- **Evidence**: Concrete proof that validation criteria are met
- **Milestone**: Group of related table migrations with validation checkpoint
