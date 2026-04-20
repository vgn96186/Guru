# Drizzle ORM Migration Architecture

## System Overview

The Guru NEET-PG study app uses `expo-sqlite` for local database storage with 27 tables defined in `src/db/schema.ts`. The migration to Drizzle ORM is incremental, maintaining 100% backward compatibility throughout the process.

## Current Architecture

### Database Layer
- **Storage**: SQLite via `expo-sqlite` (on-device)
- **Connection**: Singleton `getDb()` returns expo-sqlite database instance
- **Queries**: 163 raw SQL queries across 13 domain files in `src/db/queries/`
- **Migrations**: Versioned migration system in `src/db/migrations.ts` with `migration_history` audit trail
- **Transactions**: `runInTransaction` utility for atomic operations

### Current Drizzle Implementation
- **Schema**: `src/db/drizzleSchema.ts` (only `user_profile` table defined)
- **Database**: `src/db/drizzle.ts` with `getDrizzleDb()` singleton
- **Repository**: `src/db/repositories/profileRepository.drizzle.ts` pattern established
- **Mapper**: `src/db/utils/drizzleProfileMapper.ts` for type conversion
- **Testing**: `src/db/testing/drizzleSchemaParity.unit.test.ts` for schema validation

## Target Architecture

### Drizzle ORM Layer
```
src/db/
├── schema.ts                    # Legacy SQL definitions (unchanged)
├── drizzleSchema.ts            # Drizzle table definitions (all 27 tables)
├── drizzle.ts                  # Drizzle database singleton
├── repositories/               # Repository pattern
│   ├── profileRepository.drizzle.ts
│   ├── subjectsRepository.drizzle.ts
│   └── ... (one per table)
└── utils/
    ├── drizzleProfileMapper.ts
    └── drizzleTransaction.ts   # Transaction utilities
```

### Migration Strategy
1. **Dual-Write Pattern**: New code uses Drizzle, old code continues with raw SQL
2. **Feature Flags**: Environment variables control Drizzle usage per table
3. **Repository Pattern**: Abstract database operations behind repository interfaces
4. **Type Safety**: Leverage Drizzle's type inference for better TypeScript support

## Data Flow

### Current Flow
```
Component → Query Function → Raw SQL → expo-sqlite → Results → Component
```

### Target Flow
```
Component → Repository Method → Drizzle Query Builder → expo-sqlite → Results → Component
                        ↓
                 Raw SQL Fallback (during transition)
```

### Fallback Mechanism
```typescript
const USE_DRIZZLE = process.env.USE_DRIZZLE_TABLENAME === 'true';

async function getData() {
  if (USE_DRIZZLE) {
    return await repository.getAll();
  } else {
    return await db.getAllAsync('SELECT * FROM table');
  }
}
```

## Component Relationships

### Core Dependencies
```
drizzleSchema.ts → defines tables → used by:
  ├── drizzle.ts (getDrizzleDb)
  ├── repositories/*.drizzle.ts
  └── drizzleSchemaParity.test.ts

repositories/*.drizzle.ts → used by:
  ├── src/db/queries/*.ts (migrated queries)
  ├── src/services/*.ts (business logic)
  └── src/screens/*.tsx (UI components)

drizzleProfileMapper.ts → used by:
  └── profileRepository.drizzle.ts (type conversion)
```

### Migration Dependencies
1. **Schema First**: Table definition in `drizzleSchema.ts`
2. **Repository Second**: Repository implementation
3. **Query Migration Third**: Update query files to use repository
4. **Testing Fourth**: Add/update tests
5. **Cleanup Last**: Remove raw SQL fallback (Milestone 7)

## Constraints & Invariants

### Must Maintain
1. **Data Integrity**: No data loss or corruption during migration
2. **Performance**: Queries within 10% of raw SQL performance
3. **Backward Compatibility**: Existing code works unchanged
4. **Transaction Safety**: ACID properties preserved
5. **Foreign Key Relationships**: All constraints maintained

### Technical Constraints
1. **SQLite Limitations**: Drizzle SQLite dialect support
2. **expo-sqlite API**: Async-only methods required
3. **TypeScript Compatibility**: Existing type definitions must work
4. **Bundle Size**: Drizzle adds < 50KB to bundle
5. **Memory Usage**: No significant increase in memory footprint

## Migration Phases

### Phase 1: Foundation (Milestone 1)
- Fix existing TypeScript errors
- Migrate simple foundational tables (`subjects`, `daily_log`)
- Establish migration patterns and utilities

### Phase 2: Core Study (Milestones 2-3)
- Migrate core study hierarchy (`topics`, `topic_progress`)
- Migrate session tracking (`sessions`, `daily_agenda`)
- Critical path validation

### Phase 3: Content Systems (Milestones 4-5)
- Migrate lecture and content systems
- Migrate AI caching and generation
- Complex relationship handling

### Phase 4: Advanced Features (Milestones 6-7)
- Migrate chat and interactive features
- Migrate mind maps and graph data
- Final cleanup and optimization

## Risk Areas

### High Risk
1. **Topic Hierarchy**: Self-referential foreign keys (`topics.parent_topic_id`)
2. **FSRS Scheduling**: Complex logic in `topic_progress` table
3. **Dual Database**: `ai_cache` table with attached/standalone handling
4. **Graph Data**: `mind_map_edges` with circular reference prevention

### Medium Risk
1. **Transaction Rollback**: Complex multi-table operations
2. **Concurrent Access**: SQLite locking with multiple workers
3. **Type Conversion**: JSON columns and boolean integer mapping
4. **Performance Critical**: Frequently executed queries

### Low Risk
1. **Simple CRUD**: Tables with basic create/read/update/delete
2. **Independent Data**: Tables without foreign key dependencies
3. **Low Usage**: Tables used by few components

## Performance Considerations

### Query Optimization
1. **Index Usage**: Ensure Drizzle uses existing SQLite indexes
2. **Batch Operations**: Use Drizzle's batch API for bulk operations
3. **Lazy Loading**: Avoid N+1 query problems
4. **Caching Strategy**: Leverage Drizzle's prepared statement cache

### Memory Management
1. **Connection Pooling**: Single connection via `getDrizzleDb()`
2. **Result Streaming**: Use cursors for large result sets
3. **Cleanup**: Properly close database connections in tests

## Testing Strategy

### Unit Testing
- **Schema Parity**: Verify Drizzle definitions match SQL schema
- **Repository Tests**: Test each repository method
- **Integration Tests**: Test with real database

### Performance Testing
- **Benchmarking**: Compare query execution times
- **Load Testing**: Concurrent access scenarios
- **Memory Profiling**: Monitor memory usage patterns

### Integration Testing
- **End-to-End**: Full user flows with migrated tables
- **Fallback Testing**: Verify raw SQL fallback works
- **Rollback Testing**: Test migration reversal scenarios

## Rollback Plan

### Immediate Rollback (Feature Flag)
```typescript
// Toggle back to raw SQL
process.env.USE_DRIZZLE_TABLENAME = 'false';
```

### Code Rollback
1. Revert repository implementation
2. Restore raw SQL queries
3. Keep Drizzle schema definitions for future use

### Data Rollback
1. Database remains unchanged (same schema)
2. No data migration required
3. All existing data accessible via raw SQL

## Success Metrics

### Quality Metrics
1. **Test Coverage**: 95%+ for migrated queries
2. **Type Safety**: Zero TypeScript errors
3. **Code Quality**: No new lint errors
4. **Performance**: Within 10% of raw SQL benchmarks

### Progress Metrics
1. **Tables Migrated**: 26/27 (excluding already migrated `user_profile`)
2. **Queries Migrated**: 163/163 raw SQL queries
3. **Tests Passing**: 1006/1006 existing tests
4. **Assertions Validated**: 45/45 validation contract assertions

### User Impact Metrics
1. **Zero Downtime**: Application remains fully functional
2. **No Data Loss**: All existing data preserved
3. **Performance Maintained**: No user-visible slowdown
4. **Feature Parity**: All existing features work identically
