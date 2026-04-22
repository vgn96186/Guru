# AI v2 Migration Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Vercel AI SDK v2 migration: fix broken exports in llmRouting, migrate the last 2 caller screens to use v2 directly, then retire the legacy wrapper functions and update stale tests.

**Architecture:** Three phases — (1) fix type-errors in llmRouting.ts by exporting missing functions and adding `attemptLocalLLMStream`; (2) swap the 2 remaining screen callers from `generateJSONWithRouting` → `generateObject` from v2; (3) delete the thin wrapper functions from `generate.ts`, clean `ai/index.ts`, and update tests to mock the v2 layer they actually call.

**Tech Stack:** TypeScript, React Native / Expo SDK 54, expo-sqlite, Vercel AI SDK v2 (hand-rolled in `src/services/ai/v2/`), Jest

---

## Pre-flight: Current State

What's already done (no action needed):

- `generate.ts` delegates to `v2/compat.ts` ✅
- `chat.ts` uses v2 `streamText`/`generateObject` ✅
- `GuruChatScreen` uses `useChat` hook ✅
- All 4 P0.5 tools built in `medicalTools.ts` ✅
- `zodToJsonSchema` covers unions/records/ZodEffects ✅
- `useChat` multi-turn tool history + `addToolResult` ✅
- Gemini thinking-delta via `p.thought → reasoning-0 id` ✅

What actually remains (this plan):

- **Bug**: `callPoe`, `streamPoeChat`, `callGitLabDuo`, `streamGitLabDuoChat` not exported from `llmRouting.ts` (v2 poe/gitlab adapters import them)
- **Bug**: `attemptLocalLLMStream` missing from `llmRouting.ts` (v2 localLlm adapter imports it)
- **Bug**: `addLlmStateListener` re-exported from `ai/index.ts` but doesn't exist
- **P1**: `TranscriptVaultScreen.tsx` and `NotesVaultScreen.tsx` import `generateJSONWithRouting` from `generate.ts`
- **P3**: Wrapper functions in `generate.ts` can be deleted after screens migrate; tests mock these stale wrappers

---

## File Map

**Modified:**

- `src/services/ai/llmRouting.ts` — add `export` to `callPoe`, `streamPoeChat`, `callGitLabDuo`, `streamGitLabDuoChat`; add `attemptLocalLLMStream`; add `addLlmStateListener`
- `src/screens/TranscriptVaultScreen.tsx` — swap import
- `src/screens/NotesVaultScreen.tsx` — swap import
- `src/services/ai/generate.ts` — delete wrapper functions (file becomes empty/removed)
- `src/services/ai/index.ts` — remove stale re-exports
- `src/services/ai/generate.unit.test.ts` — repoint to v2 `generateObject`
- `src/services/transcription/analysis.unit.test.ts` — repoint mock to `../ai/v2/generateObject`
- `src/services/transcription/noteGeneration.unit.test.ts` — repoint mock to `../ai/v2/generateText`
- `src/services/aiService.unit.test.ts` — remove tests for deleted wrappers

---

## Task 1: Export missing functions from llmRouting.ts

**Files:**

- Modify: `src/services/ai/llmRouting.ts`

### Step 1a: Export callPoe and streamPoeChat

- [ ] **Step 1: Add `export` to `callPoe` and `streamPoeChat`**

At line 1321 change:

```ts
// before
async function callPoe(
// after
export async function callPoe(
```

At line 1378 change:

```ts
// before
async function streamPoeChat(
// after
export async function streamPoeChat(
```

- [ ] **Step 2: Add `export` to `callGitLabDuo` and `streamGitLabDuoChat`**

At line 1257 change:

```ts
// before
async function callGitLabDuo(
// after
export async function callGitLabDuo(
```

At line 1293 change:

```ts
// before
async function streamGitLabDuoChat(
// after
export async function streamGitLabDuoChat(
```

### Step 1b: Add `attemptLocalLLMStream`

The v2 `localLlm.ts` provider expects this signature:

```ts
attemptLocalLLMStream(
  messages: Message[],
  modelPath: string,
  textMode: boolean,
  onDelta: (delta: string) => void,
): Promise<void>
```

- [ ] **Step 3: Add `attemptLocalLLMStream` after `attemptLocalLLM` (~line 2478)**

```ts
export async function attemptLocalLLMStream(
  messages: Message[],
  localModelPath: string,
  _textMode: boolean,
  onDelta: (delta: string) => void,
): Promise<void> {
  await ensureLocalLlmLoaded(localModelPath);
  const release = await acquireContextLock();
  try {
    const chatMessages: LocalLlm.ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // Use chatStream if available, fall back to non-streaming chat with one delta.
    if (typeof LocalLlm.chatStream === 'function') {
      await LocalLlm.chatStream(chatMessages, { temperature: 0.7, topP: 0.9 }, onDelta);
    } else {
      const result = await LocalLlm.chat(chatMessages, { temperature: 0.7, topP: 0.9 });
      if (result.text) onDelta(result.text);
    }
  } finally {
    release();
  }
}
```

### Step 1c: Fix `addLlmStateListener` re-export

`ai/index.ts` re-exports `addLlmStateListener` from `llmRouting` but the function doesn't exist and isn't called anywhere. Remove the re-export rather than adding dead code.

- [ ] **Step 4: Remove `addLlmStateListener` from `ai/index.ts`**

In `src/services/ai/index.ts` at line 28:

```ts
// before
export { releaseLlamaContext, addLlmStateListener } from './llmRouting';
// after
export { releaseLlamaContext } from './llmRouting';
```

- [ ] **Step 5: Verify no other callers of `addLlmStateListener` exist**

Run:

```bash
grep -r "addLlmStateListener" src/
```

Expected: 0 matches (only the index.ts line you just deleted).

- [ ] **Step 6: Run unit tests**

```bash
npm run test:unit
```

Expected: all tests that were passing before still pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/ai/llmRouting.ts src/services/ai/index.ts
git commit -m "fix: export callPoe, callGitLabDuo, streamGitLabDuo, add attemptLocalLLMStream, remove dead addLlmStateListener re-export"
```

---

## Task 2: Migrate TranscriptVaultScreen to v2

**Files:**

- Modify: `src/screens/TranscriptVaultScreen.tsx:56`

The screen calls:

```ts
const { parsed } = await generateJSONWithRouting(
  messages,
  TranscriptLabelSchema,
  'low',
  false,
  'groq',
);
```

The `forceProvider: 'groq'` maps to `providerOrderOverride: ['groq']` in v2.

- [ ] **Step 1: Swap import in TranscriptVaultScreen.tsx**

Remove line 56–57:

```ts
import { generateJSONWithRouting } from '../services/ai/generate';
import type { Message } from '../services/ai/types';
```

Add:

```ts
import { generateObject } from '../services/ai/v2/generateObject';
import { createGuruFallbackModel } from '../services/ai/v2/providers/guruFallback';
import { profileRepository } from '../db/repositories/profileRepository';
import type { ModelMessage } from '../services/ai/v2/spec';
```

- [ ] **Step 2: Update the call site (~line 150)**

```ts
// before
const { parsed } = await generateJSONWithRouting(
  messages,
  TranscriptLabelSchema,
  'low',
  false,
  'groq',
);
```

```ts
// after
const profile = await profileRepository.getProfile();
const model = createGuruFallbackModel({ profile, forceOrder: ['groq'] });
const modelMsgs: ModelMessage[] = messages.map((m) => ({
  role: m.role as 'system' | 'user' | 'assistant',
  content: m.content,
}));
const { object: parsed } = await generateObject({
  model,
  messages: modelMsgs,
  schema: TranscriptLabelSchema,
});
```

- [ ] **Step 3: Remove the now-unused `Message` type import** (if it was only used for the old call)

Check line 57 — if `Message` is still referenced elsewhere in the file, keep the import. If it was only used for the removed call, delete it.

- [ ] **Step 4: Run unit tests**

```bash
npm run test:unit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TranscriptVaultScreen.tsx
git commit -m "feat: migrate TranscriptVaultScreen to v2 generateObject"
```

---

## Task 3: Migrate NotesVaultScreen to v2

**Files:**

- Modify: `src/screens/NotesVaultScreen.tsx:50`

Same pattern as TranscriptVaultScreen. The call at line 88:

```ts
const { parsed } = await generateJSONWithRouting(messages, NoteLabelSchema, 'low', false, 'groq');
```

- [ ] **Step 1: Swap import in NotesVaultScreen.tsx**

Remove:

```ts
import { generateJSONWithRouting } from '../services/ai/generate';
import type { Message } from '../services/ai/types';
```

Add:

```ts
import { generateObject } from '../services/ai/v2/generateObject';
import { createGuruFallbackModel } from '../services/ai/v2/providers/guruFallback';
import { profileRepository } from '../db/repositories/profileRepository';
import type { ModelMessage } from '../services/ai/v2/spec';
```

- [ ] **Step 2: Update the call site (~line 88)**

```ts
// before
const { parsed } = await generateJSONWithRouting(messages, NoteLabelSchema, 'low', false, 'groq');
return parsed;
```

```ts
// after
const profile = await profileRepository.getProfile();
const model = createGuruFallbackModel({ profile, forceOrder: ['groq'] });
const modelMsgs: ModelMessage[] = messages.map((m) => ({
  role: m.role as 'system' | 'user' | 'assistant',
  content: m.content,
}));
const { object: parsed } = await generateObject({
  model,
  messages: modelMsgs,
  schema: NoteLabelSchema,
});
return parsed;
```

- [ ] **Step 3: Remove unused `Message` type import** (same check as Task 2 Step 3)

- [ ] **Step 4: Run tests**

```bash
npm run test:unit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/NotesVaultScreen.tsx
git commit -m "feat: migrate NotesVaultScreen to v2 generateObject"
```

---

## Task 4: Delete generate.ts wrappers and clean ai/index.ts

Now the only callers of `generateJSONWithRouting`/`generateTextWithRouting`/`generateTextWithRoutingStream` are tests (which we update next). Delete the wrapper functions.

**Files:**

- Modify: `src/services/ai/generate.ts` — delete all 3 exported functions
- Modify: `src/services/ai/index.ts` — remove those 3 re-exports

- [ ] **Step 1: Delete src/services/ai/generate.ts entirely**

The file only contains the 3 thin wrapper functions that now have no production callers. Delete it:

```bash
rm src/services/ai/generate.ts
```

- [ ] **Step 2: Update ai/index.ts to remove generate.ts re-exports**

In `src/services/ai/index.ts`, remove lines 31–35:

```ts
// remove this entire block:
// Core generation
export {
  generateJSONWithRouting,
  generateTextWithRouting,
  generateTextWithRoutingStream,
} from './generate';
```

- [ ] **Step 3: Verify no non-test callers remain**

```bash
grep -r "generateJSONWithRouting\|generateTextWithRouting\|generateTextWithRoutingStream" src/ --include="*.ts" --include="*.tsx" | grep -v ".unit.test."
```

Expected: 0 matches.

- [ ] **Step 4: Commit partial**

```bash
git add src/services/ai/index.ts
git rm src/services/ai/generate.ts
git commit -m "chore: delete generate.ts thin wrappers — callers migrated to v2"
```

---

## Task 5: Fix stale test mocks

Tests mock `generateJSONWithRouting`/`generateTextWithRouting` but the implementation files (`analysis.ts`, `noteGeneration.ts`) already use v2 directly. The mocks are wiring to the wrong module and doing nothing useful.

### analysis.unit.test.ts

`analysis.ts` imports `generateObject` from `../ai/v2/generateObject`. The test mocks `generateJSONWithRouting` from `../aiService` — this mock is never invoked since `analysis.ts` doesn't use it.

**Files:**

- Modify: `src/services/transcription/analysis.unit.test.ts`

- [ ] **Step 1: Read the test file to understand its current mock structure**

```bash
head -30 src/services/transcription/analysis.unit.test.ts
```

- [ ] **Step 2: Update mock to target v2 `generateObject`**

Replace:

```ts
import { generateJSONWithRouting } from '../aiService';
jest.mock('../aiService', () => ({
  generateJSONWithRouting: jest.fn(),
}));
```

With:

```ts
jest.mock('../ai/v2/generateObject', () => ({
  generateObject: jest.fn(),
}));
jest.mock('../ai/v2/providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(() => ({
    provider: 'mock',
    modelId: 'mock',
    specificationVersion: 'v2',
    doGenerate: jest.fn(),
    doStream: jest.fn(),
  })),
}));
jest.mock('../../db/repositories/profileRepository', () => ({
  profileRepository: {
    getProfile: jest.fn().mockResolvedValue({ providerOrder: [], disabledProviders: [] }),
  },
}));
import { generateObject } from '../ai/v2/generateObject';
```

- [ ] **Step 3: Update the mock call sites in that test file**

Replace all instances of:

```ts
(generateJSONWithRouting as jest.Mock).mockResolvedValue({ parsed: { ... } });
```

With:

```ts
(generateObject as jest.Mock).mockResolvedValue({ object: { ... } });
```

And update the assertion:

```ts
// before
expect(generateJSONWithRouting).toHaveBeenCalledTimes(N);
// after
expect(generateObject).toHaveBeenCalledTimes(N);
```

- [ ] **Step 4: Run analysis tests**

```bash
npx jest src/services/transcription/analysis.unit.test.ts --no-coverage
```

Expected: all tests pass.

---

### noteGeneration.unit.test.ts

`noteGeneration.ts` imports `generateText` from `../ai/v2/generateText`. The test mocks `generateTextWithRouting` from `../aiService`.

**Files:**

- Modify: `src/services/transcription/noteGeneration.unit.test.ts`

- [ ] **Step 5: Update mock to target v2 `generateText`**

Replace:

```ts
import { generateTextWithRouting } from '../aiService';
jest.mock('../aiService', () => ({
  generateTextWithRouting: jest.fn(),
}));
```

With:

```ts
jest.mock('../ai/v2/generateText', () => ({
  generateText: jest.fn(),
}));
jest.mock('../ai/v2/providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(() => ({
    provider: 'mock',
    modelId: 'mock',
    specificationVersion: 'v2',
    doGenerate: jest.fn(),
    doStream: jest.fn(),
  })),
}));
jest.mock('../../db/repositories/profileRepository', () => ({
  profileRepository: {
    getProfile: jest.fn().mockResolvedValue({ providerOrder: [], disabledProviders: [] }),
  },
}));
import { generateText } from '../ai/v2/generateText';
```

- [ ] **Step 6: Update mock call sites**

Replace all instances of:

```ts
(generateTextWithRouting as jest.Mock).mockResolvedValue({ text: '...', modelUsed: '...' });
```

With:

```ts
(generateText as jest.Mock).mockResolvedValue({ text: '...' });
```

- [ ] **Step 7: Run noteGeneration tests**

```bash
npx jest src/services/transcription/noteGeneration.unit.test.ts --no-coverage
```

Expected: all pass.

---

### generate.unit.test.ts

This file tests `generateJSONWithRouting` from `./generate`. Since we deleted `generate.ts`, this file needs to be updated to test `generateObject` from v2 directly, or be deleted if it duplicates v2 tests.

**Files:**

- Modify or delete: `src/services/ai/generate.unit.test.ts`

- [ ] **Step 8: Evaluate whether generate.unit.test.ts still tests anything meaningful**

`generate.unit.test.ts` tested that `generateJSONWithRouting` correctly calls the underlying v2 `generateJSONV2`. Since we deleted the wrapper, this test is now testing the compat layer that no longer exists. The v2 layer has its own tests in `v2/fallback.unit.test.ts` and `v2/streamText.unit.test.ts`.

Delete the file:

```bash
git rm src/services/ai/generate.unit.test.ts
```

---

### aiService.unit.test.ts

This test calls `aiService.generateTextWithRouting` and `aiService.generateJSONWithRouting`. Since we removed those from `ai/index.ts`, the test will fail to find them.

**Files:**

- Modify: `src/services/aiService.unit.test.ts`

- [ ] **Step 9: Remove test cases that use the deleted wrappers**

Open `src/services/aiService.unit.test.ts`. Find all `describe`/`it`/`test` blocks that call `generateTextWithRouting` or `generateJSONWithRouting`. These test the routing behavior that's now covered by `v2/fallback.unit.test.ts`. Remove those test blocks.

Keep any tests that exercise functions still exported from `aiService.ts` (e.g., `chatWithGuru`, `planSessionWithAI`, content generation).

- [ ] **Step 10: Run full test suite**

```bash
npm run test:unit
```

Expected: all remaining tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/services/transcription/analysis.unit.test.ts
git add src/services/transcription/noteGeneration.unit.test.ts
git add src/services/aiService.unit.test.ts
git rm src/services/ai/generate.unit.test.ts
git commit -m "test: update stale mocks to target v2 layer; delete generate.unit.test.ts"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full CI check**

```bash
npm run verify:ci
```

Expected: lint passes, unit tests pass, coverage gate passes.

- [ ] **Step 2: Confirm no imports reference deleted files**

```bash
grep -r "from.*ai/generate" src/ --include="*.ts" --include="*.tsx"
grep -r "generateJSONWithRouting\|generateTextWithRouting" src/ --include="*.ts" --include="*.tsx"
```

Expected: 0 matches.

- [ ] **Step 3: Confirm v2 provider chain is intact**

Verify these imports exist and their targets are exported:

```bash
grep -n "export" src/services/ai/llmRouting.ts | grep -E "callPoe|streamPoe|callGitLab|streamGitLab|attemptLocalLLMStream"
```

Expected: 4–5 matches (all the functions we exported in Task 1).

- [ ] **Step 4: Final commit (if any unstaged changes)**

```bash
git status
# commit any remaining changes
```

---

## Summary of Changes

| File                                                     | Action                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `src/services/ai/llmRouting.ts`                          | Add `export` to 4 functions; add `attemptLocalLLMStream` |
| `src/services/ai/index.ts`                               | Remove `addLlmStateListener` + 3 generate re-exports     |
| `src/screens/TranscriptVaultScreen.tsx`                  | `generateJSONWithRouting` → `generateObject` from v2     |
| `src/screens/NotesVaultScreen.tsx`                       | Same                                                     |
| `src/services/ai/generate.ts`                            | **Delete**                                               |
| `src/services/ai/generate.unit.test.ts`                  | **Delete**                                               |
| `src/services/transcription/analysis.unit.test.ts`       | Repoint mock to v2 `generateObject`                      |
| `src/services/transcription/noteGeneration.unit.test.ts` | Repoint mock to v2 `generateText`                        |
| `src/services/aiService.unit.test.ts`                    | Remove deleted-wrapper test blocks                       |
