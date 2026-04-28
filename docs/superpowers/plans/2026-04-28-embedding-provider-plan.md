# Configurable Embedding Provider & Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to explicitly configure their preferred embedding provider (Gemini, OpenRouter, Jina) and model via Settings, while preserving automatic fallback behavior.

**Architecture:** 
1. Database migration to add `embedding_provider` and `embedding_model` to `user_profile`.
2. TypeScript type updates for the profile and API validation logic.
3. Update settings UI state controllers and testing hooks for Jina API key validation.
4. Add a new settings UI row for the Jina key and a dropdown section for the Embedding Model.
5. Refactor `embeddingService.ts` to respect the chosen provider as primary, then fallback gracefully to the others.

**Tech Stack:** React Native, Expo SQLite, Drizzle ORM, Zustand (implicitly via `updateUserProfile`).

---

### Task 1: Database Migration & Schema Update

**Files:**
- Create: `src/db/drizzle-migrations/0003_embedding_provider.sql`
- Modify: `src/db/drizzle-migrations/migrations.js:4-15`
- Modify: `src/db/drizzleSchema.ts:220-250`
- Modify: `src/types/index.ts:180-220`
- Modify: `src/db/utils/drizzleProfileMapper.ts`

- [ ] **Step 1: Create the SQL migration file**

Create `src/db/drizzle-migrations/0003_embedding_provider.sql`:
```sql
-- Custom SQL migration file, put you code below! --
ALTER TABLE `user_profile` ADD `embedding_provider` text DEFAULT 'gemini' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profile` ADD `embedding_model` text DEFAULT 'models/text-embedding-004' NOT NULL;
```

- [ ] **Step 2: Wire the migration in `migrations.js`**

Modify `src/db/drizzle-migrations/migrations.js` to import and export `m0003`.
```javascript
import journal from './meta/_journal.json';
import m0000 from './0000_baseline_v164.sql';
import m0001 from './0001_provider_orders.sql';
import m0002 from './0002_web_search_order.sql';
import m0003 from './0003_embedding_provider.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
  },
};
```

*(Note: We won't edit `meta/_journal.json` manually; Drizzle usually handles that, or we accept it as a raw SQL migration for Expo. For safety, we just register it in `migrations.js`)*

- [ ] **Step 3: Update `drizzleSchema.ts`**

In `src/db/drizzleSchema.ts`, add the new columns to the `userProfile` table (around line 240):
```typescript
  autoRepairLegacyNotesEnabled: integer('auto_repair_legacy_notes_enabled').notNull().default(0),
  scanOrphanedTranscriptsEnabled: integer('scan_orphaned_transcripts_enabled').notNull().default(0),
  samsungBatteryPromptShownAt: integer('samsungBatteryPromptShownAt').default(0),
  orbEffect: text('orb_effect').notNull().default('ripple'),
  embeddingProvider: text('embedding_provider').notNull().default('gemini'),
  embeddingModel: text('embedding_model').notNull().default('models/text-embedding-004'),
});
```

- [ ] **Step 4: Update `UserProfile` type in `types/index.ts`**

In `src/types/index.ts`, add the new properties (around line 206):
```typescript
  /** Deepgram API key for batch + live WebSocket transcription. */
  deepgramApiKey?: string;
  /** Jina AI API key for embeddings (jina-embeddings-v3). */
  jinaApiKey?: string;
  /** Preferred embedding provider (gemini, openrouter, jina). */
  embeddingProvider?: string;
  /** Preferred embedding model id. */
  embeddingModel?: string;
  /** Persisted provider validation metadata used by Settings key status indicators. */
```

- [ ] **Step 5: Update `drizzleProfileMapper.ts`**

Modify `src/db/utils/drizzleProfileMapper.ts` to map the DB columns to the TS object and vice versa. Add mapping for `embeddingProvider` and `embeddingModel`.
*(Assuming standard `row.embedding_provider -> profile.embeddingProvider` logic)*

- [ ] **Step 6: Commit**
```bash
git add src/db/ src/types/
git commit -m "feat(db): add embedding_provider and embedding_model columns"
```

---

### Task 2: Provider Health & Config Updates

**Files:**
- Modify: `src/config/appConfig.ts`
- Modify: `src/services/ai/providerHealth.ts`
- Modify: `src/screens/settings/types.ts`

- [ ] **Step 1: Add Jina embedding models to `appConfig.ts`**

In `src/config/appConfig.ts`, export the Jina models:
```typescript
export const JINA_EMBEDDING_MODELS = [
  'jina-embeddings-v3',
  'jina-embeddings-v2-base-en',
] as const;

export const OPENROUTER_EMBEDDING_MODELS = [
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
] as const;

export const GEMINI_EMBEDDING_MODELS = [
  'models/text-embedding-004',
  'models/gemini-embedding-001',
] as const;
```

- [ ] **Step 2: Add `testJinaConnection` to `providerHealth.ts`**

In `src/services/ai/providerHealth.ts`:
```typescript
export async function testJinaConnection(key: string): Promise<ProviderHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty key' };
  }
  try {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmed}`,
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v3',
        task: 'text-matching',
        input: ['test'],
        dimensions: 768,
      }),
    });
    return {
      ok: res.ok,
      status: res.status,
      message: res.ok ? undefined : await res.text(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}
```

- [ ] **Step 3: Update `ValidationProviderId` in `types.ts`**

In `src/screens/settings/types.ts`, add `'jina'` to the `ValidationProviderId` type union:
```typescript
export type ValidationProviderId = ProviderId | 'deepgram' | 'fal' | 'brave' | 'google' | 'jina';
```

- [ ] **Step 4: Commit**
```bash
git add src/config/appConfig.ts src/services/ai/providerHealth.ts src/screens/settings/types.ts
git commit -m "feat(ai): add Jina embedding health check and model constants"
```

---

### Task 3: Settings UI State & Validation Hooks

**Files:**
- Modify: `src/screens/settings/hooks/useApiKeyTesting.ts`
- Modify: `src/screens/settings/hooks/useProviderApiKeyTests.ts`
- Modify: `src/screens/settings/hooks/useSettingsDerivedStatus.ts`
- Modify: `src/screens/settings/hooks/useSettingsController.ts`
- Modify: `src/screens/settings/sections/ai-providers/types.ts`

- [ ] **Step 1: Add Jina to `useApiKeyTesting.ts`**

Add state for `testingJinaKey` and `jinaKeyTestResult`:
```typescript
  const [testingJinaKey, setTestingJinaKey] = useState(false);
  const [jinaKeyTestResult, setJinaKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  
  // Return them at the end of the hook
```

- [ ] **Step 2: Add Jina to `useProviderApiKeyTests.ts`**

Add `testJinaKey` logic (importing `testJinaConnection`):
```typescript
  const testJinaKey = useCallback(async () => {
    const key = keys.jinaApiKey.trim() || profile?.jinaApiKey || '';
    if (!key) {
      showWarning('No key', 'Enter a Jina API key first.');
      return;
    }
    setters.setTestingJinaKey(true);
    setters.setJinaKeyTestResult(null);
    const res = await testJinaConnection(key);
    setters.setJinaKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('jina', key);
    else clearProviderValidated('jina');
    setters.setTestingJinaKey(false);
  }, [clearProviderValidated, keys.jinaApiKey, markProviderValidated, profile?.jinaApiKey, setters]);
  
  // Return testJinaKey
```

- [ ] **Step 3: Add Jina to `useSettingsDerivedStatus.ts`**

Add `jinaValidationStatus`:
```typescript
      jinaValidationStatus: resolveValidationStatus(
        'jina',
        testResults.jinaKeyTestResult,
        keys.jinaApiKey.trim() || profile?.jinaApiKey || '',
      ),
```

- [ ] **Step 4: Update `AiProvidersProps` in `types.ts`**

In `src/screens/settings/sections/ai-providers/types.ts`, add `jina: ApiKeyField;` to the `apiKeys` object, and add an `embedding` state object:
```typescript
  apiKeys: {
    // ... existing ...
    jina: ApiKeyField;
  };
  
  embedding: {
    provider: string;
    setProvider: (v: string) => void;
    model: string;
    setModel: (v: string) => void;
  };
```

- [ ] **Step 5: Wire everything in `useSettingsController.ts`**

Add state for `jinaApiKey`, `embeddingProvider`, and `embeddingModel`. Hook up the Jina testing functions. Return them to the UI components.

- [ ] **Step 6: Commit**
```bash
git add src/screens/settings/hooks/ src/screens/settings/sections/ai-providers/types.ts
git commit -m "feat(settings): wire Jina API key testing and embedding state"
```

---

### Task 4: Settings UI Components

**Files:**
- Modify: `src/screens/settings/sections/ai-providers/subsections/ApiKeysSection.tsx`
- Create: `src/screens/settings/sections/ai-providers/subsections/EmbeddingModelSection.tsx`
- Modify: `src/screens/settings/sections/ai-providers/index.tsx`

- [ ] **Step 1: Add Jina row to `ApiKeysSection.tsx`**

Under the "Chat & Reasoning" or a new category, add the Jina `ApiKeyRow`:
```tsx
      {
        id: 'jina',
        category: 'chat', // or 'search'
        configured: Boolean(apiKeys.jina.value.trim()),
        testing: apiKeys.jina.testing,
        test: apiKeys.jina.test,
        element: (
          <ApiKeyRow
            {...apiKeys.jina}
            label="Jina AI"
            placeholder="jina_..."
            purpose="Semantic Embeddings"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="jina"
          />
        ),
      },
```

- [ ] **Step 2: Create `EmbeddingModelSection.tsx`**

Create `src/screens/settings/sections/ai-providers/subsections/EmbeddingModelSection.tsx`:
```tsx
import React, { useMemo } from 'react';
import { View } from 'react-native';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import { JINA_EMBEDDING_MODELS, OPENROUTER_EMBEDDING_MODELS, GEMINI_EMBEDDING_MODELS } from '../../../../../config/appConfig';

interface Props {
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
}

export default function EmbeddingModelSection({ provider, setProvider, model, setModel }: Props) {
  const modelOptions = useMemo(() => {
    let options: string[] = [];
    if (provider === 'jina') options = [...JINA_EMBEDDING_MODELS];
    else if (provider === 'openrouter') options = [...OPENROUTER_EMBEDDING_MODELS];
    else options = [...GEMINI_EMBEDDING_MODELS]; // Default to gemini
    
    return options.map(m => ({ id: m, label: m, group: provider.toUpperCase() }));
  }, [provider]);

  return (
    <View style={{ marginBottom: 12 }}>
      <SettingsModelDropdown
        label="Embedding Provider"
        value={provider}
        onSelect={(p) => {
          setProvider(p);
          // Auto-select first model of new provider
          if (p === 'jina') setModel(JINA_EMBEDDING_MODELS[0]);
          else if (p === 'openrouter') setModel(OPENROUTER_EMBEDDING_MODELS[0]);
          else setModel(GEMINI_EMBEDDING_MODELS[0]);
        }}
        options={[
          { id: 'gemini', label: 'Gemini (AI Studio)', group: 'Providers' },
          { id: 'openrouter', label: 'OpenRouter', group: 'Providers' },
          { id: 'jina', label: 'Jina AI', group: 'Providers' },
        ]}
      />
      
      <SettingsModelDropdown
        label="Embedding Model"
        value={model}
        onSelect={setModel}
        options={modelOptions}
      />
    </View>
  );
}
```

- [ ] **Step 3: Add `EmbeddingModelSection` to `index.tsx`**

In `src/screens/settings/sections/ai-providers/index.tsx`, render `EmbeddingModelSection` under the "Default Models" `SectionToggle`. Pass the `embedding` props down from `AiProvidersProps`.

- [ ] **Step 4: Commit**
```bash
git add src/screens/settings/sections/ai-providers/
git commit -m "feat(settings): add UI for Jina API key and Embedding Model selection"
```

---

### Task 5: Embedding Pipeline Refactor

**Files:**
- Modify: `src/services/ai/embeddingService.ts`

- [ ] **Step 1: Refactor `generateEmbeddingCore` routing**

Update `generateEmbeddingCore` to read `profile.embeddingProvider` and `profile.embeddingModel`.

```typescript
async function generateEmbeddingCore(text: string): Promise<number[] | null> {
  const normalized = text.trim();
  if (!normalized) return null;

  const profile = await profileRepository.getProfile();
  const { orKey, geminiKey, jinaKey } = getApiKeys(profile);
  
  const preferredProvider = profile.embeddingProvider || 'gemini';
  const preferredModel = profile.embeddingModel || 'models/text-embedding-004';

  // Helper functions for each provider
  const tryGemini = async (modelToUse: string) => { /* existing gemini fetch logic */ };
  const tryOpenRouter = async (modelToUse: string) => { /* existing OR fetch logic */ };
  const tryJina = async (modelToUse: string) => { /* existing jina fetch logic */ };

  // 1. Try Preferred Provider
  let result: number[] | null = null;
  
  if (preferredProvider === 'gemini' && geminiKey) {
    result = await tryGemini(preferredModel);
  } else if (preferredProvider === 'openrouter' && orKey) {
    result = await tryOpenRouter(preferredModel);
  } else if (preferredProvider === 'jina') {
    result = await tryJina(preferredModel);
  }

  if (result) return result;

  // 2. Fallbacks (if primary failed or key missing)
  if (preferredProvider !== 'gemini' && geminiKey && !_geminiEmbeddingQuotaExceeded) {
    result = await tryGemini('models/text-embedding-004');
    if (result) return result;
  }
  
  if (preferredProvider !== 'openrouter' && orKey && _openRouterEmbeddingFailCount < OPENROUTER_EMBEDDING_FAIL_THRESHOLD) {
    result = await tryOpenRouter('openai/text-embedding-3-small');
    if (result) return result;
  }
  
  if (preferredProvider !== 'jina' && !_jinaDisabledForSession) {
    result = await tryJina('jina-embeddings-v3');
    if (result) return result;
  }

  logEmbeddingDegradedOnce(
    '[Embedding] No embedding vector this session; topic search uses text matching where needed.',
  );
  return null;
}
```
*(Ensure all the internal failure tracking like `_geminiEmbeddingFailCount` is preserved within the helper functions).*

- [ ] **Step 2: Commit**
```bash
git add src/services/ai/embeddingService.ts
git commit -m "feat(ai): route embeddings based on user preference with fallback"
```
