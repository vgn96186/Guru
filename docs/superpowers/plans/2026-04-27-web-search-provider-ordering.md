# Web Search Provider Ordering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded web search cascades with a user-configurable provider ordering system, enabling Gemini Google Search grounding and DeepSeek web search as first-class providers. Brave Search remains default-primary.

**Architecture:** Follows the existing AI provider pattern: `DEFAULT_WEB_SEARCH_ORDER` const array, profile-level override (`webSearchOrder`, `disabledWebSearchProviders`), a unified orchestrator (`src/services/webSearch/`) that dispatches to providers in priority order, and a Settings UI section using the same `ProviderOrderEditor` drag-reorder modal pattern.

**Tech Stack:** Expo SDK 54, TypeScript, Drizzle ORM (SQLite), Vercel AI SDK v6, Gemini REST API, DeepSeek OpenAI-compat API

---

### Task 1: DB Migration — Add web search columns to user_profile

**Files:**

- Create: `src/db/drizzle-migrations/0002_web_search_order.sql`
- Modify: `src/db/drizzle-migrations/migrations.js`
- Modify: `src/db/drizzle-migrations/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**

```bash
mkdir -p src/db/drizzle-migrations
```

Create `src/db/drizzle-migrations/0002_web_search_order.sql`:

```sql
ALTER TABLE `user_profile` ADD COLUMN `web_search_order` text DEFAULT NULL;--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `disabled_web_search_providers` text DEFAULT '[]' NOT NULL;
```

- [ ] **Step 2: Register migration in migrations.js**

Read the existing `migrations.js` file, then edit to add the import and register the migration.

In `migrations.js`:

- Add import: `import m0002 from './0002_web_search_order.sql';`
- Add to `migrations: { ..., m0002 }`

- [ ] **Step 3: Update journal**

In `meta/_journal.json`, add entry:

```json
{ "idx": 2, "version": "6", "when": Date.now(), "tag": "0002_web_search_order", "breakpoints": true }
```

- [ ] **Step 4: Add columns to Drizzle schema**

In `src/db/drizzleSchema.ts`, add to `userProfile` table:

```typescript
webSearchOrder: text('web_search_order'),
disabledWebSearchProviders: text('disabled_web_search_providers').notNull().default('[]'),
```

- [ ] **Step 5: Commit**

```bash
git add src/db/drizzle-migrations/0002_web_search_order.sql src/db/drizzle-migrations/migrations.js src/db/drizzle-migrations/meta/_journal.json
git add src/db/drizzleSchema.ts
git commit -m "db: add web_search_order and disabled_web_search_providers to user_profile"
```

---

### Task 2: Types — Web search provider types and UserProfile fields

**Files:**

- Modify: `src/types/index.ts` — add `WebSearchProviderId`, `DEFAULT_WEB_SEARCH_ORDER`, `WEB_SEARCH_DISPLAY_NAMES`, fields on `UserProfile`

- [ ] **Step 1: Add WebSearchProviderId and defaults**

In `src/types/index.ts`, add near the `ProviderId` / `DEFAULT_PROVIDER_ORDER` section:

```typescript
export type WebSearchProviderId = 'brave' | 'gemini_grounding' | 'deepseek_web' | 'duckduckgo';

export const DEFAULT_WEB_SEARCH_ORDER: WebSearchProviderId[] = [
  'brave',
  'gemini_grounding',
  'deepseek_web',
  'duckduckgo',
];

export const WEB_SEARCH_DISPLAY_NAMES: Record<WebSearchProviderId, string> = {
  brave: 'Brave Search',
  gemini_grounding: 'Gemini Grounding',
  deepseek_web: 'DeepSeek Web Search',
  duckduckgo: 'DuckDuckGo',
};
```

- [ ] **Step 2: Add fields to UserProfile interface**

In `UserProfile` in `src/types/index.ts`, add:

```typescript
webSearchOrder?: WebSearchProviderId[];
disabledWebSearchProviders?: WebSearchProviderId[];
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add WebSearchProviderId, DEFAULT_WEB_SEARCH_ORDER, UserProfile fields"
```

---

### Task 3: Profile mapper — Read/write new columns

**Files:**

- Modify: `src/db/utils/drizzleProfileMapper.ts`

- [ ] **Step 1: Add reading in mapUserProfileRow**

In `mapUserProfileRow()`, add after `disabledProviders`:

```typescript
webSearchOrder: (() => {
  try {
    const parsed = JSON.parse(row.webSearchOrder ?? 'null');
    if (Array.isArray(parsed)) return parsed as WebSearchProviderId[];
    return undefined;
  } catch {
    return undefined;
  }
})(),
disabledWebSearchProviders: (() => {
  try {
    return JSON.parse(row.disabledWebSearchProviders ?? '[]') as WebSearchProviderId[];
  } catch {
    return [];
  }
})(),
```

Need to import `WebSearchProviderId`:

```typescript
import type { ..., WebSearchProviderId } from '../../types';
```

- [ ] **Step 2: Add writing in mapToDrizzleUpdate**

In `mapToDrizzleUpdate()`, add after the `disabledProviders` JSON block:

```typescript
if ('webSearchOrder' in updates) {
  drizzleUpdate.webSearchOrder = JSON.stringify(updates.webSearchOrder ?? null);
}
if ('disabledWebSearchProviders' in updates) {
  drizzleUpdate.disabledWebSearchProviders = JSON.stringify(
    updates.disabledWebSearchProviders ?? [],
  );
}
```

- [ ] **Step 3: Add defaults in createDefaultUserProfile**

In `createDefaultUserProfile()`, add:

```typescript
webSearchOrder: undefined,
disabledWebSearchProviders: [],
```

- [ ] **Step 4: Commit**

```bash
git add src/db/utils/drizzleProfileMapper.ts
git commit -m "profile-mapper: add webSearchOrder and disabledWebSearchProviders"
```

---

### Task 4: App config — Default web search provider order

**Files:**

- Modify: `src/config/appConfig.ts` — add `DEFAULT_WEB_SEARCH_ORDER` (or define it alongside the types since that's where `DEFAULT_PROVIDER_ORDER` lives)

Actually `DEFAULT_PROVIDER_ORDER` lives in `src/types/index.ts`. The existing pattern puts `DEFAULT_PROVIDER_ORDER` there. So Task 2 step 1 already covers this. Skip this task — it's done.

---

### Task 5: LanguageModelV2CallOptions — Add webSearch opt-in field

**Files:**

- Modify: `src/services/ai/v2/spec.ts`

- [ ] **Step 1: Add webSearch to call options**

In `LanguageModelV2CallOptions` in `spec.ts`, add:

```typescript
/** Request web search capability from the model. Provider adapters translate this
 *  to the appropriate native feature (e.g. googleSearch for Gemini, web_search for DeepSeek). */
webSearch?: boolean;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ai/v2/spec.ts
git commit -m "ai-v2: add webSearch option to LanguageModelV2CallOptions"
```

---

### Task 6: Gemini grounding — Wire googleSearch tool

**Files:**

- Modify: `src/services/ai/v2/providers/gemini.ts`

- [ ] **Step 1: Add googleSearch to tools array**

In the `buildBody()` function in `gemini.ts`, modify the tools section (lines 58-83). When `options.webSearch === true`, prepend `{ googleSearch: {} }` to the tools array:

```typescript
if (options.tools?.length || options.webSearch) {
  const toolsArray: Record<string, unknown>[] = [];
  if (options.webSearch) {
    toolsArray.push({ googleSearch: {} });
  }
  if (options.tools?.length) {
    toolsArray.push({
      functionDeclarations: options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeForGeminiSchema(t.inputSchema),
      })),
    });
  }
  body.tools = toolsArray;

  if (options.toolChoice) {
    body.toolConfig = {
      functionCallingConfig:
        options.toolChoice === 'auto'
          ? { mode: 'AUTO' }
          : options.toolChoice === 'required'
            ? { mode: 'ANY' }
            : options.toolChoice === 'none'
              ? { mode: 'NONE' }
              : {
                  mode: 'ANY',
                  allowedFunctionNames: [options.toolChoice.toolName],
                },
    };
  }
}
```

- [ ] **Step 2: Parse grounding metadata from response**

In the response parsing section (later in `doGenerate`/`doStream`), extract `groundingMetadata` from the Gemini response. The response structure is:

```json
{
  "candidates": [{
    "groundingMetadata": {
      "groundingChunks": [{
        "web": { "uri": "...", "title": "..." }
      }],
      "groundingSupports": [...]
    }
  }]
}
```

Add a helper to extract search results:

```typescript
function extractGroundingMetadata(rawResponse: unknown): WebSearchResult[] {
  if (!rawResponse || typeof rawResponse !== 'object') return [];
  const candidate = Array.isArray((rawResponse as any).candidates)
    ? (rawResponse as any).candidates[0]
    : null;
  if (!candidate?.groundingMetadata?.groundingChunks) return [];
  return candidate.groundingMetadata.groundingChunks
    .filter((chunk: any) => chunk.web)
    .map((chunk: any) => ({
      title: chunk.web.title ?? '',
      url: chunk.web.uri ?? '',
    }));
}
```

Store results in `rawResponse` or a dedicated field for the orchestrator to consume.

- [ ] **Step 3: Commit**

```bash
git add src/services/ai/v2/providers/gemini.ts
git commit -m "gemini: add google_search grounding support via webSearch option"
```

---

### Task 7: DeepSeek web search — Inject web_search field

**Files:**

- Modify: `src/services/ai/v2/providers/presets.ts`

- [ ] **Step 1: Add transformRequestBody to createDeepSeekModel**

Change `createDeepSeekModel` to inject `web_search: true` when `options.webSearch` is set:

```typescript
export function createDeepSeekModel(opts: { modelId: string; apiKey: string }): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'deepseek',
    modelId: opts.modelId,
    url: 'https://api.deepseek.com/v1/chat/completions',
    headers: () => ({ Authorization: `Bearer ${opts.apiKey}` }),
    transformRequestBody: (body, options) => {
      if (options.webSearch) {
        body.web_search = true;
      }
      return body;
    },
  });
}
```

Note: The `OpenAICompatibleConfig` `transformRequestBody` signature must accept the options. Check `src/services/ai/v2/providers/openaiCompatible.ts` line 38 — it currently only takes `body`. Update it to also accept `options: LanguageModelV2CallOptions`:

```typescript
transformRequestBody?: (
  body: Record<string, unknown>,
  options: LanguageModelV2CallOptions,
) => Record<string, unknown>;
```

Update the call site in `buildBody()` (line 82) to pass `options`:

```typescript
return config.transformRequestBody ? config.transformRequestBody(body, options) : body;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ai/v2/providers/presets.ts src/services/ai/v2/providers/openaiCompatible.ts
git commit -m "deepseek: add web_search option support"
```

---

### Task 8: Web search orchestrator — New module

**Files:**

- Create: `src/services/webSearch/types.ts`
- Create: `src/services/webSearch/orchestrator.ts`
- Create: `src/services/webSearch/index.ts`
- Create: `src/services/webSearch/providers/brave.ts`
- Create: `src/services/webSearch/providers/geminiGrounding.ts`
- Create: `src/services/webSearch/providers/deepseekWeb.ts`
- Create: `src/services/webSearch/providers/duckduckgo.ts`

- [ ] **Step 1: Create types**

`src/services/webSearch/types.ts`:

```typescript
import type { WebSearchProviderId, UserProfile } from '../../types';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  source?: string; // e.g. publisher/journal name
  publishedAt?: string;
  provider: WebSearchProviderId;
}

export interface WebSearchParams {
  query: string;
  maxResults?: number;
  profile: UserProfile;
}

export interface ImageSearchResult {
  title: string;
  url: string;
  thumbnailUrl?: string;
  source?: string;
  provider: WebSearchProviderId;
}

export interface ImageSearchParams {
  query: string;
  maxResults?: number;
  profile: UserProfile;
}

export interface WebSearchProvider {
  id: WebSearchProviderId;
  searchText(params: WebSearchParams): Promise<WebSearchResult[]>;
  searchImages?(params: ImageSearchParams): Promise<ImageSearchResult[]>;
}
```

- [ ] **Step 2: Create Brave adapter**

`src/services/webSearch/providers/brave.ts` — wraps existing `searchBraveText`/`searchBraveImages` from `medicalSearch/providers/brave.ts`:

```typescript
import { searchBraveText, searchBraveImages } from '../../ai/medicalSearch/providers/brave';
import type {
  WebSearchProvider,
  WebSearchResult,
  WebSearchParams,
  ImageSearchResult,
  ImageSearchParams,
} from '../types';

export const braveProvider: WebSearchProvider = {
  id: 'brave',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const apiKey = params.profile.braveSearchApiKey;
    if (!apiKey) return [];
    const results = await searchBraveText(params.query, params.maxResults ?? 8, apiKey);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? '',
      source: r.source,
      publishedAt: r.publishedAt,
      provider: 'brave' as const,
    }));
  },

  async searchImages(params: ImageSearchParams): Promise<ImageSearchResult[]> {
    const apiKey = params.profile.braveSearchApiKey;
    if (!apiKey) return [];
    const results = await searchBraveImages(params.query, params.maxResults ?? 8, apiKey);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      thumbnailUrl: r.thumbnailUrl,
      source: r.source,
      provider: 'brave' as const,
    }));
  },
};
```

- [ ] **Step 3: Create Gemini grounding adapter**

`src/services/webSearch/providers/geminiGrounding.ts`:

```typescript
import { createGeminiModel } from '../../ai/v2/providers/gemini';
import { generateText } from '../../ai/v2/generateText';
import type { WebSearchProvider, WebSearchResult, WebSearchParams } from '../types';

export const geminiGroundingProvider: WebSearchProvider = {
  id: 'gemini_grounding',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const apiKey = params.profile.geminiKey;
    if (!apiKey) return [];

    const model = createGeminiModel({
      modelId: 'gemini-2.5-flash',
      apiKey,
    });

    const result = await generateText({
      model,
      prompt: [
        {
          role: 'user',
          content: `Search the web for: ${params.query}. Return the search results with their URLs and brief descriptions.`,
        },
      ],
      maxOutputTokens: 1024,
      webSearch: true,
    });

    // Extract grounding metadata from rawResponse
    const raw = result.rawResponse as any;
    const chunks = raw?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    return chunks
      .filter((c: any) => c.web)
      .map((c: any) => ({
        title: c.web.title ?? '',
        url: c.web.uri ?? '',
        snippet: c.web.title ?? '',
        provider: 'gemini_grounding' as const,
      }));
  },
};
```

- [ ] **Step 4: Create DeepSeek web search adapter**

`src/services/webSearch/providers/deepseekWeb.ts`:

```typescript
import { createDeepSeekModel } from '../../ai/v2/providers/presets';
import { generateText } from '../../ai/v2/generateText';
import type { WebSearchProvider, WebSearchResult, WebSearchParams } from '../types';

export const deepseekWebProvider: WebSearchProvider = {
  id: 'deepseek_web',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const apiKey = params.profile.deepseekKey;
    if (!apiKey) return [];

    const model = createDeepSeekModel({
      modelId: 'deepseek-chat',
      apiKey,
    });

    const result = await generateText({
      model,
      prompt: [
        {
          role: 'user',
          content: `Search the web for: ${params.query}. List the top results with their URLs and brief descriptions. Format each result as: - Title: [title]\n  URL: [url]\n  Description: [description]`,
        },
      ],
      maxOutputTokens: 1024,
      webSearch: true,
    });

    const text = result.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');

    // Parse structured response into results
    const results: WebSearchResult[] = [];
    const lines = text.split('\n');
    let current: Partial<WebSearchResult> = {};
    for (const line of lines) {
      if (line.startsWith('- Title:')) {
        if (current.title) results.push(current as WebSearchResult);
        current = { title: line.replace('- Title:', '').trim(), provider: 'deepseek_web' as const };
      } else if (line.startsWith('  URL:')) {
        current.url = line.replace('  URL:', '').trim();
      } else if (line.startsWith('  Description:')) {
        current.snippet = line.replace('  Description:', '').trim();
      }
    }
    if (current.title) results.push(current as WebSearchResult);
    return results;
  },
};
```

- [ ] **Step 5: Create DuckDuckGo adapter**

`src/services/webSearch/providers/duckduckgo.ts`:

```typescript
import { searchDuckDuckGo } from '../../ai/medicalSearch/providers/duckduckgo';
import type {
  WebSearchProvider,
  WebSearchResult,
  WebSearchParams,
  ImageSearchResult,
  ImageSearchParams,
} from '../types';

export const duckduckgoProvider: WebSearchProvider = {
  id: 'duckduckgo',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const results = await searchDuckDuckGo(params.query, params.maxResults ?? 8);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? '',
      source: r.source,
      provider: 'duckduckgo' as const,
    }));
  },

  async searchImages(params: ImageSearchParams): Promise<ImageSearchResult[]> {
    const { searchDuckDuckGoImages } = await import('../../ai/medicalSearch/providers/duckduckgo');
    const results = await searchDuckDuckGoImages(params.query, params.maxResults ?? 8);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      thumbnailUrl: r.thumbnailUrl,
      source: r.source,
      provider: 'duckduckgo' as const,
    }));
  },
};
```

- [ ] **Step 6: Create orchestrator**

`src/services/webSearch/orchestrator.ts`:

```typescript
import type { WebSearchProviderId, UserProfile } from '../../types';
import { DEFAULT_WEB_SEARCH_ORDER } from '../../types';
import type { WebSearchParams, WebSearchResult } from './types';
import { braveProvider } from './providers/brave';
import { geminiGroundingProvider } from './providers/geminiGrounding';
import { deepseekWebProvider } from './providers/deepseekWeb';
import { duckduckgoProvider } from './providers/duckduckgo';

const PROVIDER_REGISTRY: Record<WebSearchProviderId, WebSearchProvider> = {
  brave: braveProvider,
  gemini_grounding: geminiGroundingProvider,
  deepseek_web: deepseekWebProvider,
  duckduckgo: duckduckgoProvider,
};

function resolveOrder(profile: UserProfile): WebSearchProviderId[] {
  const disabled = new Set(profile.disabledWebSearchProviders ?? []);
  const userOrder = profile.webSearchOrder;
  const base = userOrder?.length ? userOrder : DEFAULT_WEB_SEARCH_ORDER;
  return base.filter((id) => !disabled.has(id));
}

export async function searchWeb(params: WebSearchParams): Promise<WebSearchResult[]> {
  const order = resolveOrder(params.profile);

  for (const providerId of order) {
    const provider = PROVIDER_REGISTRY[providerId];
    if (!provider) continue;

    // Skip if required API key is missing
    if (providerId === 'brave' && !params.profile.braveSearchApiKey) continue;
    if (providerId === 'gemini_grounding' && !params.profile.geminiKey) continue;
    if (providerId === 'deepseek_web' && !params.profile.deepseekKey) continue;

    try {
      const results = await provider.searchText(params);
      if (results.length > 0) return results;
    } catch (error) {
      console.warn(`[WebSearch] Provider ${providerId} failed:`, error);
      continue;
    }
  }

  return [];
}

export async function searchImages(params: {
  query: string;
  maxResults?: number;
  profile: UserProfile;
}): Promise<ImageSearchResult[]> {
  const order = resolveOrder(params.profile);
  for (const providerId of order) {
    const provider = PROVIDER_REGISTRY[providerId];
    if (!provider?.searchImages) continue;
    if (providerId === 'brave' && !params.profile.braveSearchApiKey) continue;

    try {
      const results = await provider.searchImages(params);
      if (results.length > 0) return results;
    } catch (error) {
      console.warn(`[WebSearch] Image provider ${providerId} failed:`, error);
      continue;
    }
  }
  return [];
}
```

Update `GeminiGroundingProvider` to include `searchText` — already done in the type definition.

Actually, the orchestrator needs `searchImages` too since we have `ImageSearchParams`/`ImageSearchResult` types. Let me also update the orchestrator's return type — `searchImages` returns `ImageSearchResult[]` not `WebSearchResult[]`. Let me adjust.

- [ ] **Step 7: Create barrel**

`src/services/webSearch/index.ts`:

```typescript
export { searchWeb, searchImages } from './orchestrator';
export type {
  WebSearchResult,
  WebSearchParams,
  ImageSearchResult,
  ImageSearchParams,
} from './types';
```

- [ ] **Step 8: Commit**

```bash
git add src/services/webSearch/
git commit -m "web-search: add unified orchestrator with Brave, Gemini Grounding, DeepSeek, DDG providers"
```

---

### Task 9: Medical search refactor — Use orchestrator

**Files:**

- Modify: `src/services/ai/medicalSearch/index.ts`

- [ ] **Step 1: Refactor searchLatestMedicalSources**

In `searchLatestMedicalSources()`, replace the hardcoded cascade (Brave → Wikipedia → EuropePMC → PubMed → DDG) with a call to the orchestrator for general web search, followed by medical literature fallback:

```typescript
import { searchWeb } from '../../webSearch';

// In searchLatestMedicalSources:
export async function searchLatestMedicalSources(
  query: string,
  maxResults = 8,
  profile: UserProfile,
): Promise<GroundingSource[]> {
  // 1. Try configured web providers via orchestrator
  if (profile) {
    const webResults = await searchWeb({ query, maxResults, profile });
    if (webResults.length >= maxResults) {
      return webResults.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet ?? '',
        source: r.source ?? r.provider,
        relevanceScore: 1,
      }));
    }
  }

  // 2. Fallback: medical literature databases (unchanged)
  return searchMedicalLiterature(query, maxResults);
}
```

Where `searchMedicalLiterature()` contains the existing Wikipedia → EuropePMC → PubMed → DDG cascade extracted from the original `searchLatestMedicalSources()`.

- [ ] **Step 2: Make profile parameter optional**

Make `profile` optional. When not provided, fall back to the original hardcoded cascade (no orchestrator):

```typescript
export async function searchLatestMedicalSources(
  query: string,
  maxResults = 8,
  profile?: UserProfile,
): Promise<GroundingSource[]> {
  if (profile) {
    const webResults = await searchWeb({ query, maxResults, profile });
    if (webResults.length >= maxResults) {
      return webResults.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet ?? '',
        source: r.source ?? r.provider,
        relevanceScore: 1,
      }));
    }
  }

  // Fallback: original hardcoded medical literature cascade
  return searchMedicalLiterature(query, maxResults);
}
```

Verify callers don't break by running the existing test suite after implementation.

- [ ] **Step 3: Refactor searchMedicalImages**

Similarly, replace the hardcoded image search cascade with the orchestrator's `searchImages()` for general web images, then fall back to medical-specific image sources.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai/medicalSearch/
git commit -m "medical-search: use web search orchestrator, keep literature fallback"
```

---

### Task 10: Exam date sync refactor — Use orchestrator

**Files:**

- Modify: `src/services/examDateSyncService.ts`

- [ ] **Step 1: Add fetchExamDates using orchestrator**

Add a new exported function `fetchExamDates()` that replaces the hardcoded `fetchExamDatesViaBrave()` cascade:

```typescript
import { searchWeb } from './webSearch';

export async function fetchExamDates(profile: UserProfile): Promise<{
  inicetDate?: string;
  neetDate?: string;
  inicetSources?: string[];
  neetSources?: string[];
  method: 'web_search' | 'scrape' | 'none';
}> {
  // 1. Try configured web providers via orchestrator
  const inicetResults = await searchWeb({
    query: 'INI-CET 2026 exam date official notification',
    maxResults: 8,
    profile,
  });
  const neetResults = await searchWeb({
    query: 'NEET-PG 2026 exam date official notification',
    maxResults: 8,
    profile,
  });

  const inicetDate = extractBestDate(inicetResults, INICET_KEYWORD_REGEX);
  const neetDate = extractBestDate(neetResults, NEET_KEYWORD_REGEX);

  if (inicetDate || neetDate) {
    return {
      inicetDate,
      neetDate,
      inicetSources: inicetResults.map((r) => r.url),
      neetSources: neetResults.map((r) => r.url),
      method: 'web_search',
    };
  }

  // 2. Fallback: direct URL scraping (existing syncExamDatesFromInternet logic)
  return syncExamDatesFromInternet();
}
```

- [ ] **Step 2: Update syncExamDatesFromInternet to use fetchExamDates**

Modify `syncExamDatesFromInternet()` (or the calling `syncExamDatesIfStale()`) to call `fetchExamDates(profile)` first, with scrape fallback.

Import `getApiKeys` from the AI config to get the current profile's API keys, or pass profile directly.

- [ ] **Step 3: Update callers that depended on fetchExamDatesViaBrave**

Replace any calls to `fetchExamDatesViaBrave()` with `fetchExamDates()`.

- [ ] **Step 4: Commit**

```bash
git add src/services/examDateSyncService.ts
git commit -m "exam-date-sync: use web search orchestrator, keep scrape as final fallback"
```

---

### Task 11: Chat tools — Wire to orchestrator

**Files:**

- Modify: `src/services/ai/chatTools.ts`

- [ ] **Step 1: Update search_medical tool**

In the `search_medical` tool implementation, replace `searchLatestMedicalSources()` with `searchWeb()` from the orchestrator.

- [ ] **Step 2: Update fetch_exam_dates tool**

The `fetch_exam_dates` tool already exists and calls `fetchExamDatesViaBrave()`. Update it to call `fetchExamDates()` instead.

- [ ] **Step 3: Update fact_check tool**

The `fact_check` tool already uses web search for source verification. Update it to use `searchWeb()` via the orchestrator.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai/chatTools.ts
git commit -m "chat-tools: wire search_medical, fetch_exam_dates, fact_check to orchestrator"
```

---

### Task 12: Settings UI — Web search provider ordering section

**Files:**

- Create: `src/screens/settings/sections/ai-providers/subsections/WebSearchSection.tsx`
- Modify: `src/screens/settings/sections/ai-providers/types.ts` — add `WebSearchState`
- Modify: `src/screens/settings/sections/ai-providers/index.tsx` — render `WebSearchSection`
- Modify: `src/screens/SettingsScreen.tsx` — add web search state management
- Modify: `src/types/settings.ts` — add 'web' to `SettingsCategory` (or keep it under 'ai' category)

- [ ] **Step 1: Create WebSearchSection component**

`src/screens/settings/sections/ai-providers/subsections/WebSearchSection.tsx`:

```typescript
import React from 'react';
import { View } from 'react-native';
import { LinearText } from '../../../../components/primitives/LinearText';
import { ProviderOrderEditor } from '../../components/ProviderOrderEditor';
import { DEFAULT_WEB_SEARCH_ORDER, WEB_SEARCH_DISPLAY_NAMES } from '../../../../types';
import type { WebSearchProviderId } from '../../../../types';

import { Switch } from 'react-native';

interface WebSearchSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SectionToggle: React.FC<any>;
  webSearchOrder: WebSearchProviderId[] | undefined;
  disabledWebSearchProviders: WebSearchProviderId[];
  onSaveOrder: (order: WebSearchProviderId[]) => void;
  onToggleProvider: (id: WebSearchProviderId, disabled: boolean) => void;
}

export default function WebSearchSection(props: WebSearchSectionProps) {
  const { styles, SectionToggle, webSearchOrder, disabledWebSearchProviders, onSaveOrder, onToggleProvider } = props;
  const effectiveOrder = webSearchOrder?.length ? webSearchOrder : DEFAULT_WEB_SEARCH_ORDER;
  const disabledSet = new Set(disabledWebSearchProviders);

  const items = effectiveOrder.map((id) => ({
    id,
    label: WEB_SEARCH_DISPLAY_NAMES[id] ?? id,
  }));

  const keyStatus = (id: WebSearchProviderId): string => {
    if (id === 'brave') return 'Brave API key';
    if (id === 'gemini_grounding') return 'Gemini API key';
    if (id === 'deepseek_web') return 'DeepSeek API key';
    return '';
  };

  return (
    <SectionToggle id="web_search" title="Web Search Providers" icon="search" tint="#4FC3F7">
      <LinearText variant="caption" tone="muted" style={styles.sectionDescription}>
        Choose the order in which web search providers are tried. Toggle providers
        off to skip them. Providers missing a required API key are skipped automatically.
      </LinearText>

      {/* Per-provider toggle rows */}
      {DEFAULT_WEB_SEARCH_ORDER.map((id) => (
        <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, opacity: disabledSet.has(id) ? 0.4 : 1 }}>
          <View style={{ flex: 1 }}>
            <LinearText variant="body">{WEB_SEARCH_DISPLAY_NAMES[id]}</LinearText>
            <LinearText variant="caption" tone="muted">{keyStatus(id)}</LinearText>
          </View>
          <Switch
            value={!disabledSet.has(id)}
            onValueChange={(val) => onToggleProvider(id, !val)}
          />
        </View>
      ))}

      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#333', paddingTop: 12 }}>
        <LinearText variant="caption" tone="muted" style={{ marginBottom: 8 }}>
          Drag to reorder:
        </LinearText>
        <ProviderOrderEditor
          items={items.filter((it) => !disabledSet.has(it.id as WebSearchProviderId))}
          onSave={(orderedIds) => onSaveOrder(orderedIds as WebSearchProviderId[])}
          onReset={() => onSaveOrder([...DEFAULT_WEB_SEARCH_ORDER])}
          resetLabel="Reset to Default"
        />
      </View>
    </SectionToggle>
  );
}
```

- [ ] **Step 2: Update AiProvidersProps types**

In `src/screens/settings/sections/ai-providers/types.ts`, add `WebSearchState`:

```typescript
export interface WebSearchState {
  order: WebSearchProviderId[] | undefined;
  setOrder: (order: WebSearchProviderId[]) => void;
  disabled: WebSearchProviderId[];
  toggleProvider: (id: WebSearchProviderId, disabled: boolean) => void;
}
```

Import `WebSearchProviderId` at the top.

- [ ] **Step 3: Update AiProvidersSection to render WebSearchSection**

In `src/screens/settings/sections/ai-providers/index.tsx`:

- Import `WebSearchSection`
- Destructure `webSearch` from props
- Add after the `<SectionToggle>` sections (before the closing `</>`):

```typescript
      {/* 8. WEB SEARCH */}
      <WebSearchSection
        styles={styles}
        SectionToggle={SectionToggle}
        webSearchOrder={webSearch.order}
        disabledWebSearchProviders={webSearch.disabled}
        onSaveOrder={webSearch.setOrder}
        onToggleProvider={webSearch.toggleProvider}
      />
```

- Add `webSearch: WebSearchState` to `AiProvidersProps` interface.

- [ ] **Step 4: Add web search state in SettingsScreen**

In `src/screens/SettingsScreen.tsx`:

- Import `WebSearchProviderId`, `DEFAULT_WEB_SEARCH_ORDER`
- Add state:

```typescript
const [webSearchOrder, setWebSearchOrder] = useState<WebSearchProviderId[] | undefined>(undefined);
const [disabledWebSearchProviders, setDisabledWebSearchProviders] = useState<WebSearchProviderId[]>(
  [],
);
```

- Initialize from profile on load:

```typescript
setWebSearchOrder(profile.webSearchOrder);
setDisabledWebSearchProviders(profile.disabledWebSearchProviders ?? []);
```

- Add persist functions:

```typescript
const persistWebSearchOrder = async (order: WebSearchProviderId[]) => {
  setWebSearchOrder(order);
  await updateUserProfile({ webSearchOrder: order });
};
const toggleWebSearchProvider = async (id: WebSearchProviderId, disabled: boolean) => {
  const next = disabled
    ? [...disabledWebSearchProviders, id]
    : disabledWebSearchProviders.filter((d) => d !== id);
  setDisabledWebSearchProviders(next);
  await updateUserProfile({ disabledWebSearchProviders: next });
};
```

- Pass in `AiProvidersProps`:

```typescript
webSearch: {
  order: webSearchOrder,
  setOrder: persistWebSearchOrder,
  disabled: disabledWebSearchProviders,
  toggleProvider: toggleWebSearchProvider,
},
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/sections/ai-providers/subsections/WebSearchSection.tsx
git add src/screens/settings/sections/ai-providers/types.ts
git add src/screens/settings/sections/ai-providers/index.tsx
git add src/screens/SettingsScreen.tsx
git commit -m "settings: add Web Search Providers ordering section"
```

---

### Task 13: Sanitize utility — Add web search provider sanitization

**Files:**

- Modify: `src/utils/providerOrder.ts` (or create `src/utils/webSearchOrder.ts`)

- [ ] **Step 1: Add sanitizeWebSearchOrder function**

In `src/utils/providerOrder.ts` or a new `src/utils/webSearchOrder.ts`:

```typescript
import { DEFAULT_WEB_SEARCH_ORDER } from '../types';
import type { WebSearchProviderId } from '../types';

export function sanitizeWebSearchOrder(value: unknown): WebSearchProviderId[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const allowed = new Set<WebSearchProviderId>(DEFAULT_WEB_SEARCH_ORDER);
  const cleaned = value.filter(
    (item): item is WebSearchProviderId => typeof item === 'string' && allowed.has(item),
  );
  if (cleaned.length === 0) return undefined;
  // Append any missing providers
  for (const provider of DEFAULT_WEB_SEARCH_ORDER) {
    if (!cleaned.includes(provider)) cleaned.push(provider);
  }
  return cleaned;
}
```

Use this in the profile mapper when reading `webSearchOrder`.

- [ ] **Step 2: Commit**

```bash
git add src/utils/webSearchOrder.ts
git commit -m "utils: add sanitizeWebSearchOrder"
```

---

### Task 14: Tests — Unit tests

**Files:**

- Create: `src/services/webSearch/__tests__/orchestrator.test.ts`
- Create: `src/services/webSearch/__tests__/providers/geminiGrounding.test.ts`
- Create: `src/services/webSearch/__tests__/providers/deepseekWeb.test.ts`
- Modify: `src/services/ai/v2/providers/__tests__/gemini.test.ts` (if exists)
- Read existing test patterns: `ls src/**/__tests__/**/*.test.ts` to understand conventions

- [ ] **Step 1: Write orchestrator test**

`src/services/webSearch/__tests__/orchestrator.test.ts`:

```typescript
import { searchWeb } from '../orchestrator';

describe('WebSearchOrchestrator', () => {
  const mockProfile = (overrides = {}) => ({
    braveSearchApiKey: 'test-brave-key',
    geminiKey: 'test-gemini-key',
    deepseekKey: 'test-deepseek-key',
    webSearchOrder: undefined,
    disabledWebSearchProviders: [],
    ...overrides,
  });

  it('skips providers missing API keys', async () => {
    const profile = mockProfile({ braveSearchApiKey: '', geminiKey: '', deepseekKey: '' });
    const results = await searchWeb({ query: 'test', maxResults: 5, profile });
    expect(results).toEqual([]);
  });

  it('skips disabled providers', async () => {
    const profile = mockProfile({
      disabledWebSearchProviders: ['brave', 'gemini_grounding', 'deepseek_web'],
    });
    const results = await searchWeb({ query: 'test', maxResults: 5, profile });
    expect(results).toEqual([]);
  });

  it('uses custom order from profile', () => {
    const profile = mockProfile({ webSearchOrder: ['duckduckgo', 'brave'] });
    // The resolver should respect this order
    const order = resolveOrder(profile);
    expect(order[0]).toBe('duckduckgo');
    expect(order[1]).toBe('brave');
  });
});
```

- [ ] **Step 2: Write Gemini grounding test**

`src/services/webSearch/__tests__/providers/geminiGrounding.test.ts`:

```typescript
import { geminiGroundingProvider } from '../../providers/geminiGrounding';

jest.mock('../../../ai/v2/generateText', () => ({
  generateText: jest.fn(),
}));

import { generateText } from '../../../ai/v2/generateText';

describe('geminiGroundingProvider', () => {
  const mockProfile = (key?: string) => ({ geminiKey: key ?? 'test-key' }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty when no API key', async () => {
    const results = await geminiGroundingProvider.searchText({
      query: 'test',
      profile: mockProfile(''),
    });
    expect(results).toEqual([]);
  });

  it('extracts results from grounding metadata', async () => {
    (generateText as jest.Mock).mockResolvedValueOnce({
      rawResponse: {
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
            },
          },
        ],
      },
    });

    const results = await geminiGroundingProvider.searchText({
      query: 'INICET 2026',
      profile: mockProfile(),
    });
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com');
    expect(results[0].provider).toBe('gemini_grounding');
  });

  it('handles empty grounding metadata', async () => {
    (generateText as jest.Mock).mockResolvedValueOnce({
      rawResponse: { candidates: [{ groundingMetadata: { groundingChunks: [] } }] },
    });

    const results = await geminiGroundingProvider.searchText({
      query: 'test',
      profile: mockProfile(),
    });
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 3: Write DeepSeek web search test**

`src/services/webSearch/__tests__/providers/deepseekWeb.test.ts`:

```typescript
import { deepseekWebProvider } from '../../providers/deepseekWeb';

jest.mock('../../../ai/v2/generateText', () => ({
  generateText: jest.fn(),
}));

import { generateText } from '../../../ai/v2/generateText';

describe('deepseekWebProvider', () => {
  const mockProfile = (key?: string) => ({ deepseekKey: key ?? 'test-key' }) as any;

  beforeEach(() => jest.clearAllMocks());

  it('returns empty when no API key', async () => {
    const results = await deepseekWebProvider.searchText({
      query: 'test',
      profile: mockProfile(''),
    });
    expect(results).toEqual([]);
  });

  it('parses structured response into results', async () => {
    (generateText as jest.Mock).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '- Title: Example\n  URL: https://example.com\n  Description: An example result',
        },
      ],
    });

    const results = await deepseekWebProvider.searchText({ query: 'test', profile: mockProfile() });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Example');
    expect(results[0].url).toBe('https://example.com');
    expect(results[0].provider).toBe('deepseek_web');
  });

  it('handles empty response', async () => {
    (generateText as jest.Mock).mockResolvedValueOnce({ content: [] });
    const results = await deepseekWebProvider.searchText({ query: 'test', profile: mockProfile() });
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 4: Run existing test suite to check conventions**

Run: `npm run test:unit:coverage:logic 2>&1 | head -30`

Check existing test conventions: `ls src/services/ai/v2/__tests__/ 2>/dev/null`

- [ ] **Step 5: Run tests to verify**

Run: `npm run test:unit:coverage:logic 2>&1 | tail -20`
Expected: No regressions, new tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/webSearch/__tests__/
git commit -m "tests: add web search orchestrator unit tests"
```
