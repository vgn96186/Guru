# Vercel AI SDK Strict Cutover Design

**Date:** 2026-04-19

**Goal:** Fully migrate Guru's live AI runtime to the existing v2 / Vercel-AI-style stack without adding dependencies, stubs, or placeholder adapters.

## Scope

- Make `GuruChatScreen` use a single v2 chat path.
- Preserve current behavior for persistence, grounded context, model selection, image generation, and session-memory refresh.
- Move app code off `src/services/aiService.ts` where it is only acting as a path alias.
- Keep only real compatibility surfaces that still map to existing v2-backed implementations.

## Constraints

- No new dependencies.
- No fake facades or placeholders.
- All existing runtime behaviors must stay connected during the cutover.
- Migration should prefer direct imports from `src/services/ai` when the barrel is only re-exporting.

## Design

### 1. Chat Runtime

`GuruChatScreen` will stop maintaining a second legacy send pipeline. The v2 path will become the only runtime path for send, stream, and render state.

The screen will still own thread selection and hydration timing, but chat transport will move to `useGuruChat` and `useChat`. History hydration will be explicit on thread changes via `setMessages(...)` rather than relying on `initialMessages`.

### 2. Behavior Parity

The v2 chat hook must preserve the existing side effects now performed by the legacy `handleSend` flow:

- persist user and assistant messages
- refresh thread metadata after writes
- mark topic progress after a successful assistant turn
- refresh session summary and tutor state after completion
- preserve grounded context inputs (`sessionSummary`, `sessionStateJson`, bounded study context, syllabus topic id, grounding title/context)
- preserve image generation and image rehydration

### 3. Model Selection

Chosen model ids from the chat model picker must influence the actual v2 model construction. The selected id should flow into the fallback model builder rather than remaining UI-only state.

### 4. App Import Surface

Code that imports `aiService` only for pass-through exports should move to `src/services/ai` directly. `aiService.ts` may remain temporarily only for true wrappers that still provide value:

- `addLlmStateListener`
- `fetchExamDates`
- any legacy name that still maps to a real v2-backed implementation

### 5. Compatibility Boundary

`src/services/ai/generate.ts` and `src/services/ai/v2/compat.ts` remain only if they are still serving real callers. They must stay wired to real v2 behavior, including chosen-model support where applicable.

## Risks

- Message hydration can drift across thread switches if the hook continues to treat `initialMessages` as mount-only state.
- Quick replies can send stale text if the input component keeps the current delayed send contract.
- Tool-generated images can disappear after reload if the context key does not match the assistant message timestamp used during history rehydration.
- Model picker regressions are likely unless chosen-model plumbing is verified end-to-end.

## Success Criteria

- Sending from `GuruChatScreen` uses only the v2 runtime path.
- Switching threads rehydrates the correct history.
- Switching models changes the actual provider/model path used for the next send.
- User and assistant messages are both persisted, threads refresh correctly, and session summary/state update after replies.
- Existing app features continue to use real AI implementations without stub layers.
