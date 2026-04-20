# User Testing - Drizzle ORM Migration

## Validation Surface

### Surface 1: Unit Test Surface (Automated)
**Description**: Jest test runner executing unit tests, integration tests, and schema parity tests
**Tool**: `jest` with configuration from `jest.unit.config.js`
**Entry Point**: `npm run test:unit` or specific test file paths
**Setup Required**:
1. Test database initialization (in-memory SQLite)
2. Jest environment with React Native mocks
3. Drizzle ORM instance via `getDrizzleDb()`

**Test Types**:
- **Schema Parity Tests**: `src/db/testing/drizzleSchemaParity.unit.test.ts`
- **Repository Unit Tests**: `src/db/repositories/*.unit.test.ts`
- **Query Integration Tests**: Tests in `src/db/queries/` files
- **Component Integration Tests**: Tests that use database operations

### Surface 2: Type System Surface (Automated)
**Description**: TypeScript compiler validating type safety
**Tool**: `tsc` (TypeScript compiler)
**Entry Point**: `npm run typecheck`
**Setup Required**:
1. TypeScript configuration from `tsconfig.json`
2. Drizzle type definitions from `drizzle-orm`
3. Existing type definitions in `src/types/`

**Validation Points**:
- Drizzle schema type inference (`$inferSelect`, `$inferInsert`)
- Repository method return types
- Query parameter type checking
- Migration compatibility with existing types

### Surface 3: Code Quality Surface (Automated)
**Description**: ESLint and Prettier enforcing code quality standards
**Tool**: `eslint` and `prettier`
**Entry Point**: `npm run lint` and `npm run format:check:scoped`
**Setup Required**:
1. ESLint configuration from `.eslintrc.js`
2. Prettier configuration from `.prettierrc`
3. Existing code style patterns

**Validation Points**:
- Import organization and sorting
- Code formatting consistency
- Unused variable detection
- Best practices compliance

### Surface 4: Schema Validation Surface (Semi-Automated)
**Description**: Drizzle Kit for schema generation and comparison
**Tool**: `drizzle-kit`
**Entry Point**: `npx drizzle-kit generate` and manual inspection
**Setup Required**:
1. Drizzle configuration from `drizzle.config.ts`
2. Access to actual SQL schema from `src/db/schema.ts`
3. Generated SQL output directory `src/db/drizzle-migrations/`

**Validation Points**:
- Schema diff between Drizzle definitions and SQL
- Migration SQL generation correctness
- Column type compatibility
- Constraint preservation

### Surface 5: Manual Verification Surface (Manual)
**Description**: Manual testing of migrated queries and features
**Tool**: Manual inspection, console logging, database inspection
**Entry Point**: Test scripts, application manual testing
**Setup Required**:
1. Development build of application
2. Test data in database
3. Console access for logging

**Validation Points**:
- Query execution in real application context
- Performance benchmarking
- Edge case behavior
- Integration with existing features

## Validation Concurrency

### System Resources Analysis
- **Machine**: macOS with 8 CPU cores, 16GB RAM
- **Current Utilization**: ~6GB used at baseline
- **Available Headroom**: 16GB - 6GB = 10GB × 0.7 = **7GB usable**
- **CPU Available**: 8 cores × 0.7 = **5.6 cores usable**

### Resource Cost Classification Per Surface

#### Surface 1: Unit Test Surface
- **Memory per worker**: ~200MB (Jest worker with in-memory SQLite)
- **CPU per worker**: ~0.5 cores
- **Infrastructure overhead**: ~100MB (shared test utilities)
- **Max concurrent validators**: 3
- **Rationale**: SQLite locking constraints limit database test parallelism. 3 workers allows some parallelism for non-database tests while keeping database tests serialized.

#### Surface 2: Type System Surface  
- **Memory**: ~100MB (TypeScript compiler)
- **CPU**: ~1 core (type checking is CPU-intensive)
- **Max concurrent validators**: 2
- **Rationale**: Type checking can run in parallel with other surfaces but is CPU-bound. 2 validators allows overlap with linting.

#### Surface 3: Code Quality Surface
- **Memory**: ~50MB (ESLint/Prettier)
- **CPU**: ~0.3 cores
- **Max concurrent validators**: 3
- **Rationale**: Lightweight process that can run alongside other validation.

#### Surface 4: Schema Validation Surface
- **Memory**: ~50MB (drizzle-kit)
- **CPU**: ~0.2 cores
- **Max concurrent validators**: 2
- **Rationale**: Schema generation is fast but should not run concurrently with database tests.

#### Surface 5: Manual Verification Surface
- **Memory**: Variable (application dependent)
- **CPU**: Variable
- **Max concurrent validators**: 1
- **Rationale**: Manual testing requires human attention and application state.

### Concurrency Strategy

#### Parallel Execution Groups
**Group A (Database-Intensive)**: Serial execution required
- Database unit tests
- Schema parity tests
- Integration tests with shared state

**Group B (Independent)**: Can run in parallel
- Type checking
- Linting
- Schema generation
- Non-database unit tests

#### Recommended Execution Order
1. **Phase 1 (Parallel)**: Type checking + Linting + Schema generation
2. **Phase 2 (Serial)**: Database tests (1 validator at a time)
3. **Phase 3 (Parallel)**: Non-database tests (up to 3 validators)
4. **Phase 4 (Manual)**: Manual verification (1 validator)

#### Total Validation Time Estimates
- **Full run**: 17-22 minutes
- **Incremental (per table)**: 2-5 minutes
- **Milestone validation**: 8-12 minutes

### Isolation Requirements

#### Database Isolation
- **Per-validator database**: Each validator needs isolated SQLite instance
- **Clean state**: Database reset between validation runs
- **No cross-contamination**: Test data must not leak between validators

#### File System Isolation
- **Generated files**: `src/db/drizzle-migrations/` may be written concurrently
- **Lock files**: Drizzle Kit may create temporary files
- **Solution**: Sequential execution for schema generation

#### Process Isolation
- **Metro bundler**: Already running on port 8081
- **Development server**: May be running on port 3100
- **Solution**: Use different ports or stop existing services

## Testing Tools Configuration

### Jest Configuration
```javascript
// jest.unit.config.js
module.exports = {
  maxWorkers: 1, // Required for database tests
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // ... existing configuration
};
```

### Drizzle Kit Configuration
```typescript
// drizzle.config.ts
export default {
  schema: './src/db/drizzleSchema.ts',
  out: './src/db/drizzle-migrations',
  dialect: 'sqlite',
  driver: 'expo',
  verbose: true,
  strict: true,
};
```

### Test Database Setup
```typescript
// Test utilities needed
import { createFreshDb } from './drizzleSchemaParity.test';
import { getDb, resetDbSingleton } from '../database';
import { resetDrizzleDb } from '../drizzle';

beforeEach(() => {
  // Reset database connections
  resetDbSingleton();
  resetDrizzleDb();
});
```

## Evidence Requirements

### Automated Evidence (All Surfaces)
1. **Test Results**: Jest output with pass/fail counts and coverage
2. **TypeScript Output**: Compilation errors and warnings
3. **Lint Report**: ESLint errors and warning counts
4. **Schema Diff**: Drizzle Kit generated SQL comparison

### Manual Evidence (Surface 5)
1. **Screenshots**: Application screens showing migrated features working
2. **Console Logs**: Query execution times and results
3. **Database Dumps**: Before/after data integrity verification
4. **Performance Metrics**: Query timing comparisons

### Integration Evidence (Cross-Surface)
1. **End-to-End Tests**: Complete user flows with migrated database
2. **Concurrency Tests**: Multiple users accessing migrated tables
3. **Error Recovery**: Failure scenarios and rollback testing
4. **Data Migration**: If any data transformation is required

## Risk Mitigation

### Technical Risks
1. **SQLite Locking**: Serialize database tests, use transactions carefully
2. **Memory Leaks**: Monitor memory usage, clean up database connections
3. **Test Flakiness**: Isolate tests, reset state between runs
4. **Performance Regression**: Benchmark critical queries, optimize if needed

### Process Risks
1. **Validation Time**: Optimize test execution order, use parallelization where safe
2. **Resource Contention**: Schedule validation during low-usage periods
3. **Human Error**: Automated checks where possible, clear documentation

### Operational Risks
1. **Build Breakage**: Run validation in CI-like environment
2. **Deployment Issues**: Test with production-like configuration
3. **User Impact**: Maintain fallback mechanisms, gradual rollout

## Success Criteria

### Mandatory (Must Pass)
1. All 45 validation contract assertions pass
2. All existing 1006 tests pass
3. TypeScript compilation succeeds with zero errors
4. ESLint passes with zero errors (warnings allowed)

### Quality (Should Achieve)
1. Test coverage remains at 95%+ for migrated code
2. Query performance within 10% of raw SQL baseline
3. Bundle size increase < 50KB
4. Memory usage increase < 5%

### User Experience (Must Maintain)
1. All existing features work identically
2. No data loss or corruption
3. No performance degradation visible to users
4. Application remains stable throughout migration
