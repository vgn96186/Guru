# Vercel AI SDK Strict Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully migrate Guru's live AI runtime to the existing v2 / Vercel-AI-style stack with no new dependencies and no placeholder wiring.

**Architecture:** Replace the duplicate legacy chat send path with a single `useGuruChat`-driven runtime, preserve existing persistence and grounding behavior inside the v2 path, and move pass-through app imports from `aiService` to `ai`. Keep only real compatibility helpers that still map to v2-backed implementations.

**Tech Stack:** React Native, Expo, TypeScript, Jest, custom AI v2 framework, Vercel AI SDK-style hooks/tools.

---

### Task 1: Lock model-selection behavior with tests

**Files:**

- Create: `src/services/ai/v2/providers/guruFallback.unit.test.ts`
- Modify: `src/services/ai/v2/providers/guruFallback.ts`
- Modify: `src/services/ai/v2/compat.ts`
- Modify: `src/screens/GuruChatScreen.tsx`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run it to verify chosen-model routing fails before implementation**
- [ ] **Step 3: Implement chosen-model parsing/plumbing in the fallback model builder**
- [ ] **Step 4: Pass `chosenModel` through every v2 chat/generate entrypoint that still accepts it**
- [ ] **Step 5: Make the live Guru chat model instance update when the picker changes**
- [ ] **Step 4: Run the targeted test again and keep it green**

### Task 2: Lock quick-reply send behavior with tests

**Files:**

- Create: `src/components/chat/GuruChatInput.unit.test.tsx`
- Modify: `src/components/chat/GuruChatInput.tsx`

- [ ] **Step 1: Write the failing test for explicit `onSend(text)` quick replies**
- [ ] **Step 2: Run it to verify the current delayed send contract fails**
- [ ] **Step 3: Update the input API to send the selected text explicitly**
- [ ] **Step 4: Run the targeted test again and keep it green**

### Task 3: Move chat parity into the v2 hook

**Files:**

- Create: `src/hooks/useGuruChat.unit.test.ts`
- Modify: `src/hooks/useGuruChat.ts`
- Modify: `src/services/ai/useChat.ts`
- Modify: `src/services/ai/chatTools.ts`

- [ ] **Step 1: Write failing tests for message persistence, hydration, image context key behavior, and assistant completion return values**
- [ ] **Step 2: Run them to verify the current hook misses required side effects**
- [ ] **Step 3: Remove placeholder runtime assumptions from `useChat`, including incomplete tool/result-history handling that blocks strict cutover**
- [ ] **Step 4: Implement the missing parity wiring for user write, assistant write, thread refresh after writes, topic-progress marking, session summary/state refresh, and image context keys**
- [ ] **Step 5: Propagate all grounded context inputs through the v2 send path: `sessionSummary`, `sessionStateJson`, bounded study context, `syllabusTopicId`, `groundingTitle`, and `groundingContext`**
- [ ] **Step 6: Run the targeted tests again and keep them green**

### Task 4: Cut GuruChatScreen to one runtime path

**Files:**

- Modify: `src/screens/GuruChatScreen.tsx`
- Modify: `src/screens/GuruChatScreen.unit.test.tsx`

- [ ] **Step 1: Add failing screen tests for send, hydration fallback, thread switching, and model selection through the v2 hook**
- [ ] **Step 2: Run them to verify the legacy-only runtime still controls the screen**
- [ ] **Step 3: Remove the `enableVercelAI` feature flag, the legacy `handleSend` runtime path, and the “disable v2 on error” escape hatch**
- [ ] **Step 4: Rewire the screen to a single v2 runtime path using `useGuruChat` and explicit message hydration via `setMessages(...)`**
- [ ] **Step 5: Run the targeted screen tests again and keep them green**

### Task 5: Move pass-through imports off `aiService`

**Files:**

- Modify: `src/components/GuruChatOverlay.tsx`
- Modify: `src/screens/BossBattleScreen.tsx`
- Modify: `src/screens/BreakScreen.tsx`
- Modify: `src/screens/ContentCard.tsx`
- Modify: `src/screens/DailyChallengeScreen.tsx`
- Modify: `src/screens/FlashcardsScreen.tsx`
- Modify: `src/screens/InertiaScreen.tsx`
- Modify: `src/screens/PomodoroQuizScreen.tsx`
- Modify: `src/screens/ReviewScreen.tsx`
- Modify: `src/screens/SessionScreen.tsx`
- Modify: `src/screens/SleepModeScreen.tsx`
- Modify: `src/services/notificationService.ts`
- Modify: `src/services/sessionPlanner.ts`
- Modify: `src/hooks/useLecturePipeline.ts`
- Modify: `src/hooks/useGuruPresence.ts`
- Modify: `src/types/chat.ts`

- [ ] **Step 1: Update imports to point at `src/services/ai` where behavior is already v2-backed**
- [ ] **Step 2: Update any unit-test mocks that depend on path changes**
- [ ] **Step 3: Run targeted tests for touched modules**

### Task 6: Verify compatibility surfaces still map to real implementations

**Files:**

- Modify: `src/services/ai/v2/compat.ts`
- Modify: `src/services/ai/generate.ts`
- Modify: `src/services/aiService.ts`
- Modify: `src/services/aiService.unit.test.ts`
- Modify: `src/services/aiService.compat.unit.test.ts`

- [ ] **Step 1: Add or update failing tests where chosen-model or legacy names are not wired through correctly**
- [ ] **Step 2: Implement the minimal real compatibility behavior still required**
- [ ] **Step 3: Audit every remaining `aiService` export and import to prove it is either a real wrapper or still-required compatibility surface**
- [ ] **Step 4: Run the targeted compatibility tests again**

### Task 7: Final verification

**Files:**

- Modify: only if verification finds issues

- [ ] **Step 1: Run the focused Jest suites touched by this migration**
- [ ] **Step 2: Run `npm run typecheck` if available in this environment**
- [ ] **Step 3: Run `npm run test:unit -- --runTestsByPath ...` or equivalent targeted Jest commands for changed areas**
- [ ] **Step 4: Summarize any remaining compatibility gaps before completion**
