# Web Search Provider Ordering — Design Spec

**Date:** 2026-04-27
**Status:** draft

## Motivation

The app currently hardcodes web search cascades:

- **Exam dates:** Brave → DDG → URL scrape (in `examDateSyncService.ts`)
- **Medical search:** Brave → Wikipedia → EuropePMC → PubMed → DDG (in `medicalSearch/index.ts`)
- **Image search:** Wikimedia → Google → Wikipedia → Open-i → DDG → Brave

There is no user-facing control over which providers are used or in what order. The AI provider system already has a mature ordering/toggle pattern (`profile.providerOrder`, `profile.disabledProviders`) — this spec extends the same pattern to web search.

Additionally, two AI providers already integrated in the app (Gemini and DeepSeek) have built-in web search capabilities that are not wired up. Gemini supports Google Search grounding as a native tool; DeepSeek supports `web_search` on the request body. Neither is currently enabled.

## Design

### 1. Profile Configuration (mirrors AI provider system)

New columns on `user_profile`:

| Column                          | Type   | Default | Purpose                                                               |
| ------------------------------- | ------ | ------- | --------------------------------------------------------------------- |
| `web_search_order`              | `TEXT` | `NULL`  | Comma-separated provider ids. `NULL` = use `DEFAULT_WEB_SEARCH_ORDER` |
| `disabled_web_search_providers` | `TEXT` | `'[]'`  | JSON array of provider ids to skip                                    |

`DEFAULT_WEB_SEARCH_ORDER` in `appConfig.ts`:

```typescript
const DEFAULT_WEB_SEARCH_ORDER: WebSearchProviderId[] = [
  'brave', // Brave Search API (requires braveSearchApiKey)
  'gemini_grounding', // Gemini Google Search grounding (requires geminiKey)
  'deepseek_web', // DeepSeek web_search feature (requires deepseekKey)
  'duckduckgo', // DuckDuckGo Instant Answer (free, no key)
];
```

Provider catalog (also in `appConfig.ts`):

```typescript
interface WebSearchProviderDef {
  id: WebSearchProviderId;
  label: string;
  requiresKey: boolean;
  keyField?: keyof UserProfile;
  capabilities: {
    webSearch: boolean; // general text web search
    imageSearch: boolean; // image-specific search
  };
}
```

Brave is default-primary because the user has a trial API key and Brave is purpose-built for search (fast, structured results). Gemini Grounding and DeepSeek Web are LLM-mediated (slower, token costs) and are defaults #2 and #3. DuckDuckGo is the free always-available fallback.

### 2. Provider-Level Web Search Integration

#### 2a. Gemini Grounding (`src/services/ai/v2/providers/gemini.ts`)

Add `google_search` as a built-in tool when the caller requests web search.

The `buildBody()` function in `gemini.ts` currently builds a `tools` array with only `functionDeclarations`. When `options.webSearch === true`, prepend `{ googleSearch: {} }` to the tools array:

```json
{
  "tools": [
    { "googleSearch": {} },
    { "functionDeclarations": [...] }
  ]
}
```

- No separate API key — Google Search is part of Gemini's model capability
- Results return as `groundingMetadata` in the response, which the adapter parses into search result objects
- Vertex AI path (`isVertex: true`) also supports this the same way

#### 2b. DeepSeek Web Search (`src/services/ai/v2/providers/presets.ts`)

Pass `transformRequestBody` to inject `web_search: true`:

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
    },
  });
}
```

#### 2c. Opt-in mechanism

Add `webSearch?: boolean` to `LanguageModelV2CallOptions` in `spec.ts`. Callers set it per-request. Defaults to `false` to avoid unnecessary search costs. The v2 router (`guruFallback.ts` → `createFallbackModel`) passes all call options through transparently — each provider adapter checks `options.webSearch` and acts accordingly; no router-level changes needed beyond the type addition.

### 3. Unified Web Search Orchestrator

New module: `src/services/webSearch/`

```
src/services/webSearch/
  index.ts              // searchWeb(), searchImages()
  orchestrator.ts       // Provider order resolution, dispatch
  providers/
    brave.ts            // Adapted from medicalSearch/providers/brave.ts
    geminiGrounding.ts  // New: calls Gemini with webSearch:true, extracts results
    deepseekWeb.ts      // New: calls DeepSeek with webSearch:true, extracts results
    duckduckgo.ts       // Adapted from medicalSearch/providers/duckduckgo.ts
  types.ts              // WebSearchProvider, WebSearchResult, etc.
```

#### `searchWeb()`

```typescript
async function searchWeb(params: {
  query: string;
  maxResults?: number;
  profile: UserProfile;
}): Promise<WebSearchResult[]>;
```

Flow:

1. Resolve effective provider order: `profile.webSearchOrder` ?? `DEFAULT_WEB_SEARCH_ORDER`
2. Filter out providers in `profile.disabledWebSearchProviders`
3. Filter out providers missing required API keys
4. Try each in order → first provider returning ≥1 result wins
5. Return results with `provider` and `sourceUrls` metadata

#### `searchImages()`

Same pattern but for image providers in the web search order. Gemini grounding and DeepSeek web do not support image search natively, so the effective image provider list is a subset (Brave Images, DDG Images). Medical-specific image sources (Wikimedia Commons, Open-i NIH, Google Custom Search) remain as hardcoded fallbacks inside `medicalSearch/` — they are not general web search providers and are not user-reorderable.

### 4. Integration Points

#### 4a. Medical search (`src/services/ai/medicalSearch/index.ts`)

- `searchLatestMedicalSources()` → calls `searchWeb()` instead of hardcoded cascade
- Medical literature fallback (Wikipedia, EuropePMC, PubMed) runs AFTER web search, regardless of provider order. These are academic databases, not general web search providers.
- `searchMedicalImages()` → calls `searchImages()` for web image providers, then falls back to medical-specific image sources (Wikimedia, Open-i, Google Custom Search)

#### 4b. Exam date sync (`src/services/examDateSyncService.ts`)

- `fetchExamDatesViaBrave()` → renamed to `fetchExamDates()`
- Calls `searchWeb()` with exam-specific queries instead of hardcoding Brave as first hop
- Direct URL scraping of Careers360/Shiksha remains as final fallback (last resort)
- `syncExamDatesIfStale()` unchanged — still once per 24h, called from `useAppBootstrap.ts`

#### 4c. Chat tools (`src/services/ai/chatTools.ts`)

- `search_medical` tool → calls `searchWeb()` instead of `searchLatestMedicalSources()` directly
- `fetch_exam_dates` tool → calls `fetchExamDates()` which now uses the orchestrator
- `fact_check` tool (existing in `chatTools.ts`) → uses `searchWeb()` for source verification instead of its current hardcoded provider calls

### 5. Settings UI

New sub-screen accessible from the existing Settings screen.

**Layout:**

- `ScreenHeader` with back navigation ("Web Search Providers")
- Reorderable list using the same drag-handle pattern as the AI provider order list
- Each row: provider label + Switch toggle + key-status indicator
- Disabled providers are dimmed
- Default badge if order is unmodified

**Components used (following existing conventions):**

- `LinearSurface` for the list container
- `LinearText` with `variant`/`tone` for labels and status
- `LinearIconButton` for drag handles
- `Switch` from react-native for toggles
- Named export from `src/screens/` or as a modal within Settings

**Persistence:**

- On reorder → write `profile.webSearchOrder` via `profileRepository.updateProfile()`
- On toggle → update `profile.disabledWebSearchProviders`
- Call `refreshProfile()` to sync Zustand store

### 6. Database Migration

New migration adding columns to `user_profile`:

```sql
ALTER TABLE user_profile ADD COLUMN web_search_order TEXT;
ALTER TABLE user_profile ADD COLUMN disabled_web_search_providers TEXT DEFAULT '[]';
```

### 7. Error Handling

- Provider returns no results → silently fall to next in order
- Provider API key missing → skip (don't even attempt call)
- Provider errors (timeout, rate limit) → log, skip, try next
- All providers fail → return empty results (caller handles, e.g., exam date sync marks `method: 'none'`)

### 8. Testing

- Unit tests for orchestrator: provider order resolution, filtering of disabled/missing-key providers, fallback behavior
- Unit tests for Gemini grounding response parsing
- Unit tests for DeepSeek web_search request body injection
- Existing exam date sync tests updated for new function name
