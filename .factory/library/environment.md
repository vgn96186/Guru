# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Development Environment

### System Specifications
- **OS**: macOS
- **CPU**: 8 cores
- **RAM**: 16GB
- **Node.js**: v20.20.1 (via nvm)
- **npm**: Bundled with Node.js
- **Git**: 2.50.1

### Current State
- **Expo Metro**: Running on port 8081
- **Development Server**: Running on port 3100
- **SQLite**: expo-sqlite via React Native
- **Drizzle ORM**: Partially configured (only user_profile migrated)

## Dependencies

### Core Dependencies (Already Installed)
```json
{
  "drizzle-orm": "ORM layer",
  "drizzle-kit": "Schema generation and migrations",
  "expo-sqlite": "SQLite database for React Native",
  "better-sqlite3": "For testing (development only)",
  "typescript": "Type checking",
  "jest": "Testing framework",
  "eslint": "Code linting",
  "prettier": "Code formatting"
}
```

### Dependency Notes
1. **better-sqlite3**: Used only in tests, not in production bundle
2. **drizzle-orm/expo-sqlite**: Special driver for expo-sqlite compatibility
3. **TypeScript**: Configuration uses `tsconfig.json` with strict settings
4. **Jest**: Configured with `jest.unit.config.js` for unit tests

## Environment Variables

### Required for Development
```bash
# Database
EXPO_SQLITE_DEBUG=false  # Set to true for SQL debug logging

# Drizzle Migration
DRIZZLE_ENV=development  # Controls drizzle-kit behavior

# Feature Flags (for incremental migration)
USE_DRIZZLE_SUBJECTS=false      # Milestone 1
USE_DRIZZLE_TOPICS=false        # Milestone 2
USE_DRIZZLE_SESSIONS=false      # Milestone 3
# ... more as tables are migrated
```

### Optional/Development Only
```bash
# Debugging
REACT_DEBUG=true         # React debug tools
SQL_DEBUG=false          # SQL query logging
DRIZZLE_DEBUG=false      # Drizzle query logging

# Testing
JEST_MAX_WORKERS=1       # Required for database tests
TEST_TIMEOUT=30000       # 30 second timeout for tests
```

### Production Considerations
- **No bundled API keys**: Release builds do not ship bundled cloud API keys
- **User-entered keys**: Provider access comes from user-entered keys or OAuth
- **Environment-specific config**: `src/config/appConfig.ts` handles defaults

## Setup Notes

### Initial Setup (Already Done)
1. **Node.js**: v20.20.1 via nvm
2. **Dependencies**: `npm install` completed
3. **TypeScript**: Configuration already set up
4. **Jest**: Test configuration established

### Database Setup
- **SQLite**: No external database server needed
- **File-based**: Database stored in app document directory
- **Migrations**: Versioned via `src/db/migrations.ts`
- **Backups**: Automatic backup system in place

### Drizzle ORM Setup
1. **Configuration**: `drizzle.config.ts` already exists
2. **Schema**: `src/db/drizzleSchema.ts` (partial)
3. **Database**: `src/db/drizzle.ts` singleton
4. **Testing**: Parity tests in `src/db/testing/drizzleSchemaParity.unit.test.ts`

## Platform-Specific Notes

### Android (Primary Platform)
- **expo-sqlite**: Uses Android's built-in SQLite
- **File storage**: Database in app's private storage
- **Permissions**: No special permissions needed for SQLite
- **Performance**: Good on Galaxy Tab S10+ and Galaxy S23 Ultra

### iOS (Theoretical Support)
- **expo-sqlite**: Uses iOS SQLite library
- **File storage**: Similar to Android
- **Not tested**: App ships Android-only in practice

### Testing Environment
- **better-sqlite3**: In-memory databases for tests
- **Isolation**: Each test suite gets fresh database
- **Performance**: Fast but limited by SQLite serialization

## Dependency Quirks

### Drizzle ORM with expo-sqlite
1. **Async-only**: Must use async methods (`db.runAsync`, etc.)
2. **Type mappings**: Boolean stored as 0/1 integers
3. **JSON columns**: Stored as text, parsed in application layer
4. **Foreign keys**: Must enable `PRAGMA foreign_keys = ON`

### Jest with React Native
1. **Mocking**: Extensive mocks for React Native modules
2. **Timers**: Special handling for React Native timers
3. **Async storage**: Mocked for tests
4. **Native modules**: Custom mocks for app-launcher, local-llm

### TypeScript Configuration
1. **Strict mode**: Enabled with all strict checks
2. **Path aliases**: `@/*` maps to repo root (TypeScript only)
3. **React Native types**: Special configuration for RN/Expo
4. **Drizzle types**: Automatic inference from schema

## External Services

### Not Required for Migration
- **Cloud APIs**: Not needed for database migration
- **Authentication**: Local only, no external auth
- **File storage**: Local SQLite only

### May Be Referenced
- **AI Services**: Referenced in code but not required for migration
- **Backup services**: Cloud backup optional
- **Sync services**: Device sync optional

## Troubleshooting

### Common Issues
1. **SQLite locking**: Use transactions and serialize database access
2. **TypeScript errors**: Often related to React Native module types
3. **Test flakiness**: Reset database between tests
4. **Memory leaks**: Clean up database connections

### Drizzle-Specific Issues
1. **Schema mismatch**: Run `npx drizzle-kit generate` to see differences
2. **Type inference**: Ensure `$inferSelect`/`$inferInsert` types are correct
3. **Query performance**: Check generated SQL with `DRIZZLE_DEBUG=true`
4. **Transaction issues**: Use Drizzle's transaction API, not raw SQL transactions

### Environment Issues
1. **Port conflicts**: Check `lsof -i :3100` and `lsof -i :8081`
2. **Memory issues**: Monitor with `htop` or Activity Monitor
3. **Node.js version**: Ensure using v20.20.1 via `node --version`
4. **npm issues**: Try `npm cache clean --force` and reinstall

## Validation Environment

### Test Database
- **Type**: In-memory SQLite via better-sqlite3
- **Isolation**: Fresh database per test suite
- **Schema**: Created from `src/db/schema.ts` definitions
- **Data**: Test fixtures loaded as needed

### Test Performance
- **Memory**: ~200MB per Jest worker
- **CPU**: Moderate, mostly single-threaded due to SQLite
- **Time**: 17-22 minutes for full test suite
- **Parallelism**: Limited by SQLite locking constraints

### Validation Tools
1. **Jest**: `npm run test:unit`
2. **TypeScript**: `npm run typecheck`
3. **ESLint**: `npm run lint`
4. **Drizzle Kit**: `npx drizzle-kit generate`
5. **Manual verification**: Application testing
