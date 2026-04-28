# Live-First Model Catalogs + Exam Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Note: Do not commit unless the user explicitly asks. Skip any “Commit” steps if present.

**Goal:** Keep Guru’s model catalogs and exam dates up-to-date automatically, avoiding stale/deprecated model IDs and stale default exam dates while remaining resilient offline.

**Architecture:** Expand `liveModelCatalog` to fetch live model IDs for more providers and persist “last known good” catalogs in SQLite. Make exam date sync source-aware (`default|synced|user`) so it can update automatically unless the user pins a custom date.

**Tech Stack:** Expo SDK 54, TypeScript, Drizzle ORM (expo-sqlite), TanStack Query, Jest unit tests.

---

## File Structure (changes)

**Create**

- `src/db/drizzle-migrations/0005_live_model_cache_exam_date_sources.sql`
- `src/db/repositories/providerModelCatalogRepository.drizzle.ts`
- `src/db/repositories/providerModelCatalogRepository.drizzle.unit.test.ts`
- `src/db/repositories/examDateSyncMetaRepository.drizzle.ts`
- `src/db/repositories/examDateSyncMetaRepository.drizzle.unit.test.ts`
- `src/services/ai/liveModelCatalog.unit.test.ts`

**Modify**

- `src/db/drizzle-migrations/migrations.js`
- `src/db/drizzle-migrations/meta/_journal.json`
- `src/db/drizzleSchema.ts`
- `src/types/index.ts`
- `src/db/utils/drizzleProfileMapper.ts`
- `src/screens/settings/hooks/useSettingsController.ts`
- `src/services/examDateSyncService.ts`
- `src/services/ai/liveModelCatalog.ts`
- `src/hooks/useLiveGuruChatModels.ts`
- `src/hooks/useAppBootstrap.ts`
- `src/services/ai/v2/providers/guruFallback.ts`
- `src/services/ai/v2/providers/guruFallback.unit.test.ts`
- `src/hooks/useGuruChatModels.ts`

---

### Task 1: Add SQLite migration for model catalog + exam date sources

**Files:**

- Create: `src/db/drizzle-migrations/0005_live_model_cache_exam_date_sources.sql`
- Modify: `src/db/drizzle-migrations/migrations.js`
- Modify: `src/db/drizzle-migrations/meta/_journal.json`

- [ ] **Step 1: Create the migration SQL**

Create `src/db/drizzle-migrations/0005_live_model_cache_exam_date_sources.sql`:

```sql
ALTER TABLE `user_profile` ADD COLUMN `inicet_date_source` text NOT NULL DEFAULT 'default';
--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `neet_date_source` text NOT NULL DEFAULT 'default';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `provider_model_catalog` (
	`id` integer PRIMARY KEY NOT NULL,
	`catalog_json` text NOT NULL,
	`meta_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_date_sync_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`meta_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
```

- [ ] **Step 2: Register migration in `migrations.js`**

Edit `src/db/drizzle-migrations/migrations.js` to import and include `m0005`.

```js
import m0005 from './0005_live_model_cache_exam_date_sources.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
  },
};
```

- [ ] **Step 3: Update Drizzle journal**

Edit `src/db/drizzle-migrations/meta/_journal.json` to append an entry:

```json
{
  "idx": 5,
  "version": "6",
  "when": 1778200000000,
  "tag": "0005_live_model_cache_exam_date_sources",
  "breakpoints": true
}
```

Also update the top-level `"entries"` array to include it (as index 5).

- [ ] **Step 4: Run unit tests to ensure migrations still load**

Run:

```bash
npm run test:unit
```

Expected: PASS (no TypeScript import errors in migrations bundle).

---

### Task 2: Update Drizzle schema to reflect new columns/tables

**Files:**

- Modify: `src/db/drizzleSchema.ts`
- Test: `src/db/testing/drizzleSchemaParity.unit.test.ts` (existing)

- [ ] **Step 1: Add new columns to `userProfile`**

In `src/db/drizzleSchema.ts`, add:

```ts
  inicetDateSource: text('inicet_date_source').notNull().default('default'),
  neetDateSource: text('neet_date_source').notNull().default('default'),
```

Place them near `inicetDate`/`neetDate`.

- [ ] **Step 2: Add new tables**

In `src/db/drizzleSchema.ts`, add:

```ts
export const providerModelCatalog = sqliteTable('provider_model_catalog', {
  id: integer('id').primaryKey(),
  catalogJson: text('catalog_json').notNull(),
  metaJson: text('meta_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const examDateSyncMeta = sqliteTable('exam_date_sync_meta', {
  id: integer('id').primaryKey(),
  metaJson: text('meta_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

- [ ] **Step 3: Run DB parity/unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS (schema parity tests should still match migrations output).

---

### Task 3: Add typed profile fields for exam date sources

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/db/utils/drizzleProfileMapper.ts`

- [ ] **Step 1: Add types**

In `src/types/index.ts`, extend `UserProfile`:

```ts
export type ExamDateSource = 'default' | 'synced' | 'user';
```

And add:

```ts
  inicetDateSource?: ExamDateSource;
  neetDateSource?: ExamDateSource;
```

to `UserProfile`.

- [ ] **Step 2: Map from DB → runtime**

In `src/db/utils/drizzleProfileMapper.ts`, in `mapUserProfileRow()` map:

```ts
inicetDateSource: row.inicetDateSource === 'user' ? 'user' : row.inicetDateSource === 'synced' ? 'synced' : 'default',
neetDateSource: row.neetDateSource === 'user' ? 'user' : row.neetDateSource === 'synced' ? 'synced' : 'default',
```

- [ ] **Step 3: Default profile values**

In `createDefaultUserProfile()`, set:

```ts
inicetDateSource: 'default',
neetDateSource: 'default',
```

- [ ] **Step 4: Map updates (write path)**

In `mapToDrizzleUpdate()`, allow updating the two fields with sanitization to `'default' | 'synced' | 'user'`.

- [ ] **Step 5: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 4: Make Settings mark manual exam date edits as user-pinned

**Files:**

- Modify: `src/screens/settings/hooks/useSettingsController.ts`

- [ ] **Step 1: Set date source on save**

Locate the profile update call that saves `inicetDate` and `neetDate` and update it to also send:

```ts
inicetDateSource: 'user',
neetDateSource: 'user',
```

only when the corresponding date value is actually changed from the previous profile value.

- [ ] **Step 2: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 5: Move exam date sync meta from AsyncStorage to SQLite

**Files:**

- Create: `src/db/repositories/examDateSyncMetaRepository.drizzle.ts`
- Create: `src/db/repositories/examDateSyncMetaRepository.drizzle.unit.test.ts`
- Modify: `src/db/repositories/index.ts` (if it re-exports)
- Modify: `src/services/examDateSyncService.ts`

- [ ] **Step 1: Add failing unit test for repo**

Create `src/db/repositories/examDateSyncMetaRepository.drizzle.unit.test.ts`:

```ts
import { getDrizzleDb } from '../drizzle';
import { examDateSyncMetaRepositoryDrizzle } from './examDateSyncMetaRepository.drizzle';

jest.mock('../drizzle', () => ({ getDrizzleDb: jest.fn() }));

describe('examDateSyncMetaRepositoryDrizzle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when no row exists', async () => {
    const limit = jest.fn().mockResolvedValue([]);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const res = await examDateSyncMetaRepositoryDrizzle.getMeta();
    expect(res).toBeNull();
  });

  it('upserts meta JSON', async () => {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue({ insert });

    await examDateSyncMetaRepositoryDrizzle.setMeta({ lastCheckedAt: 'x' } as any);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Implement repository**

Create `src/db/repositories/examDateSyncMetaRepository.drizzle.ts`:

```ts
import { eq } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { examDateSyncMeta } from '../drizzleSchema';

export type StoredExamDateSyncMeta = {
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  inicetDate?: string;
  neetDate?: string;
  inicetSources?: string[];
  neetSources?: string[];
};

const ROW_ID = 1;

export const examDateSyncMetaRepositoryDrizzle = {
  async getMeta(): Promise<StoredExamDateSyncMeta | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(examDateSyncMeta)
      .where(eq(examDateSyncMeta.id, ROW_ID))
      .limit(1);
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].metaJson) as StoredExamDateSyncMeta;
    } catch {
      return null;
    }
  },

  async setMeta(meta: StoredExamDateSyncMeta): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();
    await db
      .insert(examDateSyncMeta)
      .values({ id: ROW_ID, metaJson: JSON.stringify(meta), updatedAt: now })
      .onConflictDoUpdate({
        target: examDateSyncMeta.id,
        set: { metaJson: JSON.stringify(meta), updatedAt: now },
      });
  },
};
```

- [ ] **Step 3: Swap `examDateSyncService` to use the repo**

In `src/services/examDateSyncService.ts`:

- Remove AsyncStorage usage for meta.
- Replace `readMeta()`/`writeMeta()` to call the repo.

- [ ] **Step 4: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 6: Make exam date sync source-aware (no more hardcoded “default date” whitelist)

**Files:**

- Modify: `src/services/examDateSyncService.ts`

- [ ] **Step 1: Update overwrite rules**

Replace the `HARDCODED_*_DEFAULTS` checks with:

```ts
const canOverwriteInicet = (profile.inicetDateSource ?? 'default') !== 'user';
const canOverwriteNeet = (profile.neetDateSource ?? 'default') !== 'user';
```

Then allow updates when `canOverwrite*` is true.

- [ ] **Step 2: Mark synced sources on success**

When writing updates via `profileRepository.updateProfile(updates)`, also set:

```ts
inicetDateSource: 'synced';
neetDateSource: 'synced';
```

only for the fields you updated.

- [ ] **Step 3: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 7: Persist live model catalogs in SQLite

**Files:**

- Create: `src/db/repositories/providerModelCatalogRepository.drizzle.ts`
- Create: `src/db/repositories/providerModelCatalogRepository.drizzle.unit.test.ts`
- Modify: `src/services/ai/liveModelCatalog.ts`
- Modify: `src/hooks/useAppBootstrap.ts`
- Modify: `src/hooks/useLiveGuruChatModels.ts`

- [ ] **Step 1: Add failing unit tests for the repo**

Create `src/db/repositories/providerModelCatalogRepository.drizzle.unit.test.ts`:

```ts
import { getDrizzleDb } from '../drizzle';
import { providerModelCatalogRepositoryDrizzle } from './providerModelCatalogRepository.drizzle';

jest.mock('../drizzle', () => ({ getDrizzleDb: jest.fn() }));

describe('providerModelCatalogRepositoryDrizzle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when no row exists', async () => {
    const limit = jest.fn().mockResolvedValue([]);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const res = await providerModelCatalogRepositoryDrizzle.getCatalog();
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 2: Implement the repo**

Create `src/db/repositories/providerModelCatalogRepository.drizzle.ts`:

```ts
import { eq } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { providerModelCatalog } from '../drizzleSchema';
import type { LiveGuruChatModelIds } from '../../services/ai/liveModelCatalog';

export type StoredLiveModelCatalog = {
  catalog: LiveGuruChatModelIds;
  updatedAt: number;
};

const ROW_ID = 1;

export const providerModelCatalogRepositoryDrizzle = {
  async getCatalog(): Promise<StoredLiveModelCatalog | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(providerModelCatalog)
      .where(eq(providerModelCatalog.id, ROW_ID))
      .limit(1);
    if (rows.length === 0) return null;
    try {
      return {
        catalog: JSON.parse(rows[0].catalogJson) as LiveGuruChatModelIds,
        updatedAt: rows[0].updatedAt,
      };
    } catch {
      return null;
    }
  },

  async setCatalog(catalog: LiveGuruChatModelIds, meta: unknown): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();
    await db
      .insert(providerModelCatalog)
      .values({
        id: ROW_ID,
        catalogJson: JSON.stringify(catalog),
        metaJson: JSON.stringify(meta ?? {}),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: providerModelCatalog.id,
        set: {
          catalogJson: JSON.stringify(catalog),
          metaJson: JSON.stringify(meta ?? {}),
          updatedAt: now,
        },
      });
  },
};
```

- [ ] **Step 3: Hydrate `LIVE_MODEL_CACHE` from DB during app bootstrap**

In `src/hooks/useAppBootstrap.ts` (inside `bootstrap()`), add an early call before any background fetches:

```ts
const { hydrateLiveModelCacheFromDb } = await import('../services/ai/liveModelCatalog');
await hydrateLiveModelCacheFromDb().catch(() => {});
```

- [ ] **Step 4: Ensure `useLiveGuruChatModels` loads cache immediately**

In `src/hooks/useLiveGuruChatModels.ts`, on mount, call:

```ts
import { getPersistedLiveModelCatalog } from '../services/ai/liveModelCatalog';
```

and initialize state from it before the network fetch begins.

- [ ] **Step 5: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 8: Add live model discovery for DeepSeek + AgentRouter (and make OpenRouter list work without a key)

**Files:**

- Modify: `src/services/ai/liveModelCatalog.ts`
- Test: `src/services/ai/liveModelCatalog.unit.test.ts`

- [ ] **Step 1: Add failing tests for DeepSeek model list parsing**

Create `src/services/ai/liveModelCatalog.unit.test.ts`:

```ts
import { fetchDeepSeekChatModelIds } from './liveModelCatalog';

describe('liveModelCatalog', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchDeepSeekChatModelIds returns ids from /models', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-v4-flash' }] }),
    } as any);

    const res = await fetchDeepSeekChatModelIds('ds-key');
    expect(res.ids).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash']);
    expect(res.source).toBe('live');
  });
});
```

- [ ] **Step 2: Implement DeepSeek live fetch**

In `src/services/ai/liveModelCatalog.ts`, replace the static `fetchDeepSeekModelIds()` with an async implementation:

```ts
export async function fetchDeepSeekChatModelIds(
  apiKey: string,
): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const key = apiKey.trim();
  if (!key) return { ids: [...DEEPSEEK_MODELS], source: 'fallback' };
  try {
    const res = await fetch('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok)
      return {
        ids: [...DEEPSEEK_MODELS],
        source: 'fallback',
        error: await res.text().catch(() => String(res.status)),
      };
    const data = (await res.json()) as { data?: { id?: string }[] };
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { ids, source: ids.length ? 'live' : 'fallback' };
  } catch (e) {
    return {
      ids: [...DEEPSEEK_MODELS],
      source: 'fallback',
      error: e instanceof Error ? e.message : 'network error',
    };
  }
}
```

- [ ] **Step 3: Implement AgentRouter best-effort live fetch**

Add:

```ts
export async function fetchAgentRouterModelIds(
  apiKey: string,
): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const key = apiKey.trim();
  if (!key) return { ids: [...AGENTROUTER_MODELS], source: 'fallback' };
  try {
    const res = await fetch('https://agentrouter.org/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok)
      return {
        ids: [...AGENTROUTER_MODELS],
        source: 'fallback',
        error: await res.text().catch(() => String(res.status)),
      };
    const data = (await res.json()) as { data?: { id?: string }[] };
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const merged = ids.length ? ids : [...AGENTROUTER_MODELS];
    return { ids: merged, source: ids.length ? 'live' : 'fallback' };
  } catch (e) {
    return {
      ids: [...AGENTROUTER_MODELS],
      source: 'fallback',
      error: e instanceof Error ? e.message : 'network error',
    };
  }
}
```

- [ ] **Step 4: Make OpenRouter listing attempt without a key**

In `fetchOpenRouterFreeModelIds`, when key is empty, attempt the request with no Authorization header. If it fails, fall back.

- [ ] **Step 5: Wire into `fetchAllLiveGuruChatModelIds`**

Change `fetchAllLiveGuruChatModelIds` to await the new DeepSeek/AgentRouter functions and set `result.deepseek` / `result.agentrouter` from their live ids when possible.

- [ ] **Step 6: Persist to DB on successful refresh**

At the end of `fetchAllLiveGuruChatModelIds`, call the provider catalog repo `setCatalog(result, meta)` so the cache is up to date.

- [ ] **Step 7: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 9: Make “explicit chosen model” resilient (fallback to other providers if selected model is invalid)

**Files:**

- Modify: `src/services/ai/v2/providers/guruFallback.ts`
- Modify: `src/services/ai/v2/providers/guruFallback.unit.test.ts`

- [ ] **Step 1: Update behavior**

Change `resolveChosenModelSelection()` + order logic so that when a user explicitly selects a model, it is tried first, but the chain can fall back to the normal provider order.

One concrete change:

- Keep `modelIds` override for the chosen provider.
- Replace `forceOrder: [provider]` with `preferredFirst: provider` and have `createGuruFallbackModel` compute:

```ts
const order = preferredFirst
  ? [preferredFirst, ...DEFAULT_PROVIDER_ORDER.filter((p) => p !== preferredFirst)]
  : profile.providerOrder?.length
    ? profile.providerOrder
    : DEFAULT_PROVIDER_ORDER;
```

This makes a dead model id non-fatal.

- [ ] **Step 2: Update unit tests to match**

In `src/services/ai/v2/providers/guruFallback.unit.test.ts`, update assertions that previously expected a single provider in the fallback list. Expect the chosen provider first, but allow more models after it (depending on keys).

- [ ] **Step 3: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 10: Auto-heal saved `guruChatDefaultModel` when it becomes invalid

**Files:**

- Modify: `src/hooks/useGuruChatModels.ts`

- [ ] **Step 1: Persist correction**

In `useGuruChatModels`, when:

- `profile.guruChatDefaultModel` is non-empty and not `'auto'`, and
- it is not present in `availableModels`,

then persist `guruChatDefaultModel: 'auto'` using TanStack Query mutation:

```ts
import { useUpdateProfileMutation } from './queries/useProfile';

const { mutate: updateProfile } = useUpdateProfileMutation();
// ...
updateProfile({ guruChatDefaultModel: 'auto' });
```

Guard to avoid loops (only run when the saved default is invalid and different from `'auto'`).

- [ ] **Step 2: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 11: Final verification

- [ ] **Step 1: Run CI-style verification**

Run:

```bash
npm run verify:ci
```

Expected: PASS.

- [ ] **Step 2: Quick manual sanity checks (Android dev build)**

- Open Settings → AI Providers → Chat model picker: models should populate from live/cached lists.
- Toggle airplane mode and reopen Settings: cached list should still show.
- Change INICET/NEET dates in Settings: source should become user-pinned, and a foreground sync should not overwrite them.
