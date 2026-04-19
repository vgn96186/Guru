import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit configuration.
 *
 * Used **only** for schema codegen (`drizzle-kit generate`) and schema
 * diffing during development. The app's runtime migrations still go through
 * the legacy `MIGRATIONS[]` array in `src/db/migrations.ts` so installed
 * users upgrade smoothly.
 *
 * Generated SQL lands in `src/db/drizzle-migrations/` and is committed so
 * that `0000_baseline.sql` (the full current schema snapshot at v164) can
 * serve as the parity-check reference in `drizzleSchemaParity.test.ts`.
 */
export default {
  schema: './src/db/drizzleSchema.ts',
  out: './src/db/drizzle-migrations',
  dialect: 'sqlite',
  driver: 'expo',
  // No `dbCredentials`: Expo SQLite is on-device, not a dev-time connection.
  verbose: true,
  strict: true,
} satisfies Config;
