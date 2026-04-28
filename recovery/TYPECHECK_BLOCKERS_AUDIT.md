# Typecheck Blockers Audit

Branch: `recovery/reconstruction`
Generated: 2026-04-28

Command:
`npm run typecheck` (tsc --noEmit)

## Current Errors (raw)

1. [SleepModeScreen.tsx](file:///Users/vishnugnair/Guru-3/src/screens/SleepModeScreen.tsx): Cannot find module `expo-av`
2. [liveModelCatalog.ts](file:///Users/vishnugnair/Guru-3/src/services/ai/liveModelCatalog.ts): `getValidGitHubToken` not exported from `./github/githubTokenStore`
3. [orchestrator.test.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/__tests__/orchestrator.test.ts): mock profile object does not satisfy `UserProfile` type (multiple occurrences)
4. [brave.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/providers/brave.ts): `MedicalGroundingSource` has no `thumbnailUrl`
5. [deepseekWeb.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/providers/deepseekWeb.ts): `generateText` options do not accept `prompt` (expects `messages`)
6. [duckduckgo.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/providers/duckduckgo.ts): `MedicalGroundingSource` has no `thumbnailUrl`

## Classification

### 1) expo-av / expo-audio migration blockers

- [SleepModeScreen.tsx](file:///Users/vishnugnair/Guru-3/src/screens/SleepModeScreen.tsx): `import { Audio } from 'expo-av'`
  - Plan: remove `expo-av` dependency from this screen (no alarm sound is currently initialized; `soundRef` is never set).

### 2) webSearch typing blockers

- [orchestrator.test.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/__tests__/orchestrator.test.ts): test helper `profile()` returns a partial object; `WebSearchParams.profile` expects full `UserProfile`
  - Plan: build profile from `createDefaultUserProfile()` (then override keys).
- [brave.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/providers/brave.ts) + [duckduckgo.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/providers/duckduckgo.ts): map `MedicalGroundingSource.imageUrl` → `ImageSearchResult.thumbnailUrl`
- [deepseekWeb.ts](file:///Users/vishnugnair/Guru-3/src/services/webSearch/providers/deepseekWeb.ts): change `prompt` → `messages` for `generateText()`

### 3) unrelated stale/generated errors

- [liveModelCatalog.ts](file:///Users/vishnugnair/Guru-3/src/services/ai/liveModelCatalog.ts): import name mismatch (`getValidGitHubToken` vs `getValidAccessToken`)
  - Plan: rename import usage to `getValidAccessToken` (matches [githubTokenStore.ts](file:///Users/vishnugnair/Guru-3/src/services/ai/github/githubTokenStore.ts)).

### 4) errors introduced by recovery commits

- None identified yet (current blockers appear to be pre-existing mismatches + newly surfaced strict typing).

## Fix Buckets (required commit granularity)

1. `recover(audio): complete expo-audio migration blockers`
2. `recover(types): fix webSearch typecheck blockers`
