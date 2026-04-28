# Configurable Embedding Provider & Model

## 1. Overview
The user currently has Jina AI embedding fallback logic wired inside `embeddingService.ts` and the profile DB, but there is no UI to enter the API key or select Jina as the primary provider. We need to introduce an explicit "Embedding Provider" and "Embedding Model" setting. 

The preferred provider will be attempted first in `generateEmbeddingCore`. If it fails, the system will fall back to the remaining configured providers to ensure semantic search robustness.

## 2. Database & Data Model
- **Schema Update**: Create a new DB migration in `src/db/migrations.ts` (e.g., `v63` or latest).
  - Add `embedding_provider` (TEXT DEFAULT 'gemini') to `user_profile`.
  - Add `embedding_model` (TEXT DEFAULT 'models/text-embedding-004') to `user_profile`.
- **TypeScript Model**:
  - Update `src/types/index.ts` -> `UserProfile` with `embeddingProvider` and `embeddingModel`.
  - Add `JinaApiKey` field if it isn't fully wired yet (it appears to exist already but we will verify).
- **Mappers**: Update `src/db/utils/drizzleProfileMapper.ts` to map the new columns.

## 3. Provider Health & Validation
- **Health Check**: Add `testJinaConnection(key)` to `src/services/ai/providerHealth.ts` hitting `https://api.jina.ai/v1/embeddings` with a minimal text payload.
- **State Hooks**: Update `src/screens/settings/hooks/useApiKeyTesting.ts`, `useProviderApiKeyTests.ts`, and `useSettingsDerivedStatus.ts` to include:
  - `testingJinaKey`, `jinaKeyTestResult`, `testJinaKey`
  - `jinaValidationStatus`

## 4. Settings UI
- **API Keys**: Add `ApiKeyRow` for Jina in `src/screens/settings/sections/ai-providers/subsections/ApiKeysSection.tsx`.
- **Model Selection**: 
  - Add a new `EmbeddingModelSection.tsx` (or integrate into `ChatModelSection.tsx`) to allow selecting the `embeddingProvider` (Gemini, OpenRouter, Jina).
  - Based on the provider, show the `embeddingModel` dropdown:
    - *Jina*: `jina-embeddings-v3`, `jina-embeddings-v2-base-en`
    - *Gemini*: `models/text-embedding-004`, `models/gemini-embedding-001`
    - *OpenRouter*: `openai/text-embedding-3-small`, `openai/text-embedding-3-large`
- **Controller**: Wire up the state and `updateUserProfile` calls in `src/screens/settings/hooks/useSettingsController.ts`.

## 5. Embedding Pipeline
- **Service**: Refactor `src/services/ai/embeddingService.ts`.
  - Read `profile.embeddingProvider` and `profile.embeddingModel`.
  - Dynamically route the primary embedding call to the chosen provider using the chosen model.
  - Maintain the fallback logic: if the primary provider fails or is unconfigured, try the others sequentially (e.g., if Jina is primary and fails, try Gemini -> OpenRouter).

## 6. Self-Review
- No placeholders left.
- Scope is focused entirely on the embedding UI and pipeline routing.
- Fallback logic remains intact (no regressions in offline/degraded states).
