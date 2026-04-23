# Monolith Refactor Plan — Guru

_Last updated: 2026-04-23_

## 1. What counts as a "monolith" here

A file qualifies if it meets **any** of these:

- **>1000 LOC** and/or mixes ≥3 concerns (state, UI, IO, business logic, prompts).
- A screen/component whose single default export contains >15 `useState`/`useEffect` hooks.
- A service file that bundles unrelated external integrations behind one module.

Baseline (non-test `.ts` / `.tsx` under `src/` and `modules/`, as of 2026-04-23):

| Rank | File                                                                     |  LOC | Hook count\* | Primary smell                                                                                     |
| ---: | ------------------------------------------------------------------------ | ---: | -----------: | ------------------------------------------------------------------------------------------------- |
|    1 | `@/Users/vishnugnair/Guru/debug/src/screens/SettingsScreen.tsx`          | 3320 |          132 | Mega-screen; already has `settings/sections/` but the main file still holds most logic            |
|    2 | `@/Users/vishnugnair/Guru/debug/src/screens/SessionScreen.tsx`           | 2298 |           36 | Session state machine + two sub-screens (`WarmUpMomentumScreen`, `SessionDoneScreen`) in one file |
|    3 | `@/Users/vishnugnair/Guru/debug/src/screens/GuruChatScreen.tsx`          | 1944 |           42 | Chat UI + image-gen heuristics + starters + skeleton                                              |
|    4 | `@/Users/vishnugnair/Guru/debug/src/screens/NotesVaultScreen.tsx`        | 1902 |           42 | Vault UI + AI relabel + grounding builders                                                        |
|    5 | `@/Users/vishnugnair/Guru/debug/src/screens/MindMapScreen.tsx`           | 1819 |           57 | Canvas engine + list view + layout math + persistence                                             |
|    6 | `@/Users/vishnugnair/Guru/debug/src/screens/StudyPlanScreen.tsx`         | 1233 |           16 | 7 large sub-cards co-located (Extracted inner cards to `src/screens/studyPlan/cards/`)            |
|    7 | `@/Users/vishnugnair/Guru/debug/src/screens/TranscriptHistoryScreen.tsx` | 1641 |            — | UI + audio player + transcript rendering                                                          |
|    8 | `@/Users/vishnugnair/Guru/debug/src/services/ai/medicalSearch.ts`        | 1599 |            0 | 8 search providers + ranking + cache in one file                                                  |
|    9 | `@/Users/vishnugnair/Guru/debug/src/screens/LectureModeScreen.tsx`       | 1496 |            — | Recording loop + UI + transcript handling                                                         |
|   10 | `@/Users/vishnugnair/Guru/debug/src/screens/TranscriptVaultScreen.tsx`   | 1471 |            — | Parallel to NotesVault                                                                            |
|   11 | `@/Users/vishnugnair/Guru/debug/src/components/LectureReturnSheet.tsx`   | 1434 |            3 | Likely near-pure presentational — styles dominate                                                 |
|   12 | `@/Users/vishnugnair/Guru/debug/src/screens/TopicDetailScreen.tsx`       | 1336 |            — | Tabs + detail rendering                                                                           |
|   13 | `@/Users/vishnugnair/Guru/debug/src/services/ai/chat.ts`                 | 1105 |            0 | Prompt builders + streaming + post-processing + grounding                                         |
|   14 | `@/Users/vishnugnair/Guru/debug/src/screens/HomeScreen.tsx`              | 1110 |            — | Already factored partially; verify                                                                |

\*Hook count = raw occurrences of `useState|useEffect|useCallback|useMemo`.

## 2. Guiding principles

- **Minimal upstream extractions, not rewrites.** Move code out, preserve behavior, keep public imports/exports stable via a barrel.
- **Repository & service boundaries already exist** (`src/db/repositories/`, `src/services/`). Push logic toward them, not into new helper files next to screens.
- **UI primitives first.** Per `AGENTS.md`, prefer `src/components/primitives/*` and `ScreenHeader` instead of inline `View`/`Text` blocks. Every extraction is a chance to drop one-off styles.
- **No behavioral changes per PR.** Each refactor step ships with the same snapshot/unit tests it started with. If tests don't exist, add a minimal characterization test _before_ moving code.
- **One monolith per PR.** Do not stack. Each PR lands green under `npm run verify:ci` (lint + unit + logic coverage).
- **No new `@/…` imports.** Per `AGENTS.md`, Metro/Jest don't resolve it for app bundles. Use `../` relative imports inside `src/`.
- **Screens keep default-export** — navigators depend on `component={FooScreen}`. Extractions become named exports in sibling files.

## 3. Target folder conventions

For every large screen `FooScreen.tsx` that fans out, adopt this layout:

```
src/screens/foo/
  FooScreen.tsx              # thin shell — default export, composition only
  hooks/
    useFooController.ts      # orchestrates state, effects, IO
    useFooXyz.ts             # smaller focused hooks
  components/                # presentational, named exports
    FooHeader.tsx
    FooRow.tsx
    ...
  logic/                     # pure functions, easy to unit-test
    derive.ts
  types.ts                   # local types if not in schemas/
```

For services (`src/services/ai/medicalSearch.ts`, `src/services/ai/chat.ts`) adopt:

```
src/services/ai/medicalSearch/
  index.ts                   # re-export public API only
  queryBuilder.ts
  ranking.ts
  cache.ts
  providers/
    wikimedia.ts
    openi.ts
    brave.ts
    google.ts
    pubmed.ts
    duckduckgo.ts
    europepmc.ts
    wikipedia.ts
```

`src/services/ai/aiService.ts` is a barrel already — keep the external surface identical.

## 4. Per-file plan

### 4.1 `SettingsScreen.tsx` (3320 LOC, 132 hooks) — **highest leverage**

Current state: `src/screens/settings/sections/` exists with ~10 section files, but the main screen still owns backup flows, API-key state, validation state, and all section wiring.

**Extract**:

1. **Backup/restore flow** → `src/services/settings/backupFlow.ts`. The private `_importBackup()` (line 332) plus the `AppBackup` type move out; screen calls a single `runImportBackup()` that returns `{ok, message}`.
2. **API-key validation state machine** → `src/hooks/settings/useApiValidation.ts`. Owns `ValidationProviderId`, `ApiValidationEntry`, `ApiValidationState`, plus `sanitizeApiValidationState`, `fingerprintSecret`.
3. **ChatGPT account sub-state** → `src/hooks/settings/useChatGptAccount.ts`. Pulls `defaultChatGptAccountSettings`, `sanitizeChatGptAccountSettings`, `isChatGptEnabled` (all currently private in the file).
4. **Provider-specific sanitizers** → co-locate with `appConfig` as `src/config/providerSanitizers.ts` (the `sanitizeGithubCopilotPreferredModel` / `sanitizeGitlabDuoPreferredModel` helpers).
5. **Private `_PermissionRow`, `_ModelDropdown`, `Label`** (lines 2513, 2540, 2545) → move into `src/screens/settings/components/`.
6. **Each remaining inlined section** that still lives in the main file → promote to `src/screens/settings/sections/` alongside the existing ones.

**Acceptance**:

- `SettingsScreen.tsx` ≤ 500 LOC, composed of `<Section>` children only.
- No change to `backupHelpers.ts` / `utils.ts` / `types.ts` public shapes.
- Existing unit test `StorageSections.unit.test.tsx` still green; add one for `useApiValidation`.

**Estimated effort**: 3–4 focused sessions. Do last in this program because it's the largest and touches many subsystems.

### 4.2 `SessionScreen.tsx` (2298 LOC) — session state machine [DONE]

Two sub-screens already inline (`WarmUpMomentumScreen` @ 1481, `SessionDoneScreen` @ 1581). The default export owns mode resolution, content fetching, retries, XP, and nav.

**Extract**:

1. `WarmUpMomentumScreen` → `src/screens/session/WarmUpMomentumScreen.tsx` (named export; register it in navigator if referenced there, else keep local sibling import).
2. `SessionDoneScreen` → `src/screens/session/SessionDoneScreen.tsx`.
3. `IconCircle`, `useEntranceAnimation` (lines 68, 87) → `src/components/primitives/IconCircle.tsx` and `src/hooks/useEntranceAnimation.ts`.
4. **Pure helpers** `formatSessionModelLabel`, `buildCachedQuestionFallbackContent`, `deriveSessionProgressStatus` → `src/services/session/sessionFormatters.ts` (unit-testable, no React).
5. **Retry constants** (`CONTENT_AUTO_RETRY_DELAYS_MS`, `PLANNING_AUTO_RETRY_DELAYS_MS`, `SESSION_PREFETCH_LOOKAHEAD`) → `src/services/session/sessionConstants.ts`.
6. The remaining orchestration (content fetch + prefetch + retry loop + end-of-session XP) → `src/hooks/session/useSessionController.ts`. `SessionScreen.tsx` becomes a shell using this hook.

**Acceptance**:

- `SessionScreen.tsx` ≤ 400 LOC.
- Add unit tests for the 3 pure helpers.
- No change to `useSessionStore` external API.

### 4.3 `GuruChatScreen.tsx` (1944 LOC)

**Extract**:

1. `getStartersForTopic`, `getDynamicStarters`, `ChatSkeleton` → `src/screens/chat/` (named exports).
2. Image-gen intent heuristics (`isExplicitImageRequest`, `inferRequestedImageStyle`, `canAutoGenerateStudyImage`, `getLastUserPrompt`) → `src/services/ai/imageIntent.ts`. These are pure string utilities. **Unit-test them.**
3. Split `GuruChatScreen` / `GuruChatScreenContent` → move `GuruChatScreenContent` into `src/screens/chat/GuruChatScreenContent.tsx`; top file keeps the error boundary / provider wrapper.
4. Consolidate chat bubbles that already live under `src/components/chat/` — verify no duplication.

### 4.4 `NotesVaultScreen.tsx` (1902 LOC)

**Extract**:

1. `aiRelabelNote` + `NoteLabelSchema` → `src/services/notes/relabelNote.ts`.
2. `buildNoteGroundingContext`, `buildVaultGroundingContext`, `countWords`, `getTitle` → `src/services/notes/noteGrounding.ts` (pure).
3. Sort/filter logic (`SortOption`, `NoteItem` selectors) → `src/hooks/notes/useNotesVaultController.ts`.
4. **Share with `TranscriptVaultScreen.tsx`** — both are vaults over `LectureHistoryItem`. After this refactor, extract a generic `useVaultList<T>()` hook so the two screens only differ in presentation.

### 4.5 `MindMapScreen.tsx` (1819 LOC)

Already the most internally-factored of the big screens (lots of small helpers). Extract by concern:

1. **Geometry/layout math** — `wrapText`, `getNodeDimensions`, `clamp`, `getCanvasMetrics`, `computeFittedViewport`, `applyAutoLayout`, `getHiddenNodeIds`, `getBranchIndex` → `src/services/mindmap/layout.ts` (pure, heavily unit-testable). **Write tests first; these are the most fragile.**
2. **Canvas view** (`CanvasView`, lines 354–1359) → `src/screens/mindmap/CanvasView.tsx`.
3. **List view** (`MapListView`, `MapCardItem`) → `src/screens/mindmap/MapListView.tsx`.
4. **Undo history** (`UndoAction`, reducer) → `src/hooks/mindmap/useMindMapUndo.ts`.
5. `MindMapScreen.tsx` shrinks to ~300 LOC — just a mode toggle + composition.

### 4.6 `StudyPlanScreen.tsx` (1730 LOC, 7 card components)

Pure mechanical split: each inner card (`LiveClassBanner`, `DBMCISyllabusCard`, `BTRProgressCard`, `MasteryFunnelCard`, `BacklogBanner`, `FoundationRepairQueueCard`, `UrgencyCell`) → `src/screens/studyPlan/cards/<Name>.tsx`. Top file becomes layout only. Zero behavior change; lowest-risk refactor → good first PR.

### 4.7 `TranscriptHistoryScreen.tsx` (1641 LOC)

1. `AudioPlayer` (line 158) → `src/components/AudioPlayer.tsx` (reusable — `LectureReturnSheet` may also use an audio player).
2. `TranscriptSection` → `src/screens/transcripts/TranscriptSection.tsx`.
3. `extractFirstLine`, `getLectureTitle` → `src/services/transcripts/formatters.ts`.

### 4.8 `src/services/ai/medicalSearch.ts` (1599 LOC) — **biggest service**

Current file holds 8 provider integrations, ranking, scoring, cache, and query builders. Fan out as described in §3. After split:

- `index.ts` re-exports `searchMedicalImages`, `searchLatestMedicalSources`, `searchDuckDuckGo`, `generateImageSearchQuery`, `generateVisualSearchQueries`, `renderSourcesForPrompt`, `clipText`, `dedupeGroundingSources`, `buildMedicalSearchQuery` (everything currently `export`ed).
- `ranking.ts` owns `scoreGroundingSource`, `rankGroundingSources`, `scoreWikimediaRelevance`, `extractQueryTerms`.
- `cache.ts` owns `getCachedImageSearch`, `setCachedImageSearch`.
- `queryBuilder.ts` owns `buildMedicalSearchQuery`, `compactImageSearchQuery`, `buildConceptFamilyImageQueries`, `buildImageSearchQueryLadder`, `normalizeImageQuery`, `dedupeImageQueries`, `upscaleWikipediaThumbnail`.
- One file per provider under `providers/`.

No consumer changes — `src/services/ai/medicalSearch.ts` becomes `export * from './medicalSearch/index'` (or the folder replaces the file).

**Add tests** for `ranking.ts` (pure) before the split.

### 4.9 `src/services/ai/chat.ts` (1105 LOC)

Same approach:

```
src/services/ai/chat/
  index.ts                # public: chatWithGuru, chatWithGuruGrounded, chatWithGuruGroundedStreaming, askGuru, explainMostTestedRationale
  prompts.ts              # buildGuruSystemPrompt, buildTopicContextLine, buildIntentInstruction, renderTutorStateForPrompt
  intent.ts               # detectStudentIntent, GuruTutorIntent handling
  postprocess.ts          # sanitizeSingleGuruTurn, splitReplyAndFinalQuestion, finalizeGuruReply, truncateAfterAskedQuestion, hasUnclosedMarkdownBoldMarkers, looksTruncatedReply, shouldDropFinalQuestion, shouldDropIntentQuestion
  continuation.ts         # hasUsefulContinuation, normalizeWords, hasTailPrefixOverlap, looksLikeRestartedReply, appendContinuation, buildContinuationMessages
  concepts.ts             # extractKeyTerms, buildConceptKey, conceptOverlap, dedupeConcepts, normalizeQuestionText
  imageSeed.ts            # isLowInformationImagePrompt, buildImageSearchSeed, isRenderableReferenceImageUrl
  history.ts              # buildHistoryMessages, extractRecentGuruQuestions
  errors.ts               # mapGroundedChatError
```

Each of those files is 50–200 LOC of pure logic — **ideal unit-test targets**. This is the refactor with the highest long-term payoff because prompt logic is the area that regresses most often.

### 4.10 `LectureReturnSheet.tsx` (1434 LOC, only 3 hooks)

Evidence says it's style-heavy. Likely wins:

1. Move `styles` to `LectureReturnSheet.styles.ts`.
2. Extract sub-sections (topic rows, transcript preview, action buttons) into named subcomponents in `src/components/lectureReturn/`.
3. No logic extraction needed — it's presentational.

Lowest-priority but big LOC win.

### 4.11 Remaining (`LectureModeScreen`, `TranscriptVaultScreen`, `TopicDetailScreen`, `HomeScreen`)

Apply the same screen template (§3). `HomeScreen` may already be partly factored — audit first and only split if it still exceeds ~800 LOC of actual logic.

## 5. Ordering (risk-adjusted)

1. **`StudyPlanScreen`** — pure card extraction, near-zero risk. _Proves the pattern, gets a PR landed fast._
2. **`services/ai/medicalSearch`** — pure TS, no RN, easy unit tests.
3. **`services/ai/chat`** — same shape; high long-term value.
4. **`TranscriptHistoryScreen`** — extract `AudioPlayer` (enables reuse in `LectureReturnSheet`).
5. **`MindMapScreen`** — after §5.4 lands an `AudioPlayer` pattern, apply the same to layout math. Highest ROI screen-side refactor.
6. **`GuruChatScreen`** — image-intent unit tests first.
7. **`NotesVaultScreen`** + **`TranscriptVaultScreen`** — share a `useVaultList` hook.
8. **`SessionScreen`** — the session controller hook is delicate; do once previous refactors prove the hook pattern.
9. **`LectureReturnSheet`** — cosmetic split; good for an "easy" week.
10. **`SettingsScreen`** — largest surface; requires the most sessions, do last with all learnings applied.

## 6. Process rules per PR

- Branch: `refactor/<file-slug>`.
- Before code moves: add a characterization test if none exists for the moved logic.
- Run `npm run verify:ci` locally; run `npm run verify:strict` before merge.
- Do **not** rename any exported symbol in the same PR as the move. Renames come in a follow-up.
- Keep the original file as a barrel re-export for one release cycle if external imports are common (check with `rg "from ['\"].*<filename>['\"]"`).
- Update this file's table with the new LOC after each PR to track progress.

## 7. Out of scope (explicit non-goals)

- Rewriting any state model (Zustand stores, repositories stay as-is).
- Swapping libraries (no navigation/animation/storage library changes).
- Reworking the AI routing layer or prompts themselves (that's §4.9 input, not output).
- iOS parity work — Android-only per `AGENTS.md`.

## 8. Success metric

By end of program:

- No `src/` file > **800 LOC** (excluding generated migrations and syllabus data).
- No React component with > **15** hooks.
- `src/services/ai/` folder: every file < **400 LOC**, with unit test coverage > 70% for `ranking.ts`, `postprocess.ts`, `intent.ts`, `layout.ts`.
- `npm run verify:strict` green at every merge point.
