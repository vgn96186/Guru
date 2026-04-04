# Primitive Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Linear/glass primitive layer and shared chrome so migrated screens inherit a more consistent visual language without requiring broad screen rewrites.

**Architecture:** Keep the public primitive contracts stable and concentrate visual cleanup in `linearTheme`, primitive components, and a small set of shared chrome wrappers. Use lightweight gradient-and-border treatments rather than blur or extra runtime-heavy wrappers so Android performance and layout behavior stay stable.

**Tech Stack:** React Native, Expo, TypeScript, Jest, React Native Testing Library

---

### Task 1: Normalize Shared Glass Tokens

**Files:**

- Modify: `src/theme/linearTheme.ts`
- Test: existing consumers via targeted unit tests in later tasks

- [ ] **Step 1: Inspect current surface, border, tint, and alpha tokens**

Read `src/theme/linearTheme.ts` and note every token currently used by `LinearSurface`, `LinearButton`, `LinearBadge`, `LinearDivider`, and `LinearTextInput`.

- [ ] **Step 2: Add one RED check before token edits**

Use the first directly affected consumer test as the pre-change check. If no consumer test covers the token impact, add a minimal one before editing tokens.

- [ ] **Step 3: Make the minimal token adjustments**

Tighten existing surface/background/border/highlight/tint values. Do not rename existing tokens. Add a new token only if at least two target components need it.

- [ ] **Step 4: Run the most directly affected primitive/shared tests**

Run: `npm run test:unit -- --runTestsByPath <first-affected-test-file>`
Expected: PASS.

### Task 2: Polish `LinearSurface` and `LinearText`

**Files:**

- Modify: `src/components/primitives/LinearSurface.tsx`
- Modify: `src/components/primitives/LinearText.tsx`
- Test: add or update `src/components/home/QuickStatsCard.unit.test.tsx` only if needed for style contract, otherwise validate through existing consumers

- [ ] **Step 1: Define the smallest style contract worth testing**

If needed, add a focused test that ensures `LinearSurface` can render in Jest and preserves compact/default structure without changing children behavior.

- [ ] **Step 2: Run the test to verify RED**

Run: `npm run test:unit -- --runTestsByPath <surface-related-test-file>`
Expected: FAIL for the intended contract only.

- [ ] **Step 3: Implement the surface polish**

Adjust base fill, frost layer, top-edge highlight, and compact/default density while preserving the current props: `borderColor`, `padded`, `compact`.

- [ ] **Step 4: Implement any typography-token cleanup needed in `LinearText`**

Keep the API stable and only normalize typography behavior that affects shared chrome consistency.

- [ ] **Step 5: Re-run the focused test**

Run: `npm run test:unit -- --runTestsByPath <surface-related-test-file>`
Expected: PASS.

### Task 3: Align Buttons, Badges, Dividers, and Inputs

**Files:**

- Modify: `src/components/primitives/LinearButton.tsx`
- Modify: `src/components/primitives/LinearBadge.tsx`
- Modify: `src/components/primitives/LinearDivider.tsx`
- Modify: `src/components/primitives/LinearTextInput.tsx`
- Test: existing unit tests for any touched consumers; add focused primitive tests only where variant behavior changes

- [ ] **Step 1: Add or update one failing test per changed behavior**

Examples:

- Button variant styling contract
- Badge variant rendering contract
- Input focus/disabled shell contract

- [ ] **Step 2: Run each focused test to verify RED**

Run: `npm run test:unit -- --runTestsByPath <test-file>`
Expected: FAIL for the changed behavior.

- [ ] **Step 3: Implement minimal control polish**

Reduce shadow-led glass button styling, unify tinted states, and keep current props/variants intact.

- [ ] **Step 4: Re-run the focused tests**

Run: `npm run test:unit -- --runTestsByPath <test-file>`
Expected: PASS.

### Task 4: Update Search and Header Chrome

**Files:**

- Modify: `src/components/BannerSearchBar.tsx`
- Modify: `src/components/ScreenBannerFrame.tsx`
- Modify: `src/components/ScreenHeader.tsx`
- Test: any existing tests covering these components; otherwise validate by focused render tests only if behavior changes

- [ ] **Step 1: Capture the non-regression constraints in tests if needed**

If no test exists for preserved behavior, add a minimal render test that checks:

- component still renders
- core controls remain present
- key accessibility labels remain intact

- [ ] **Step 2: Run the new or updated test to verify RED**

Run: `npm run test:unit -- --runTestsByPath <test-file>`
Expected: FAIL for the intended contract only.

- [ ] **Step 3: Implement the chrome cleanup**

Replace opaque shells with primitive-aligned treatment while preserving:

- header height
- safe-area behavior
- icon sizing
- touch target size
- search input usability

- [ ] **Step 4: Re-run focused tests**

Run: `npm run test:unit -- --runTestsByPath <test-file>`
Expected: PASS.

### Task 5: Update Feedback and Pill/Card Chrome

**Files:**

- Modify: `src/components/Toast.tsx`
- Modify: `src/components/TopicPillRow.tsx`
- Modify: `src/components/SubjectCard.tsx`
- Modify: `src/components/SubjectSelectionCard.tsx`
- Test: `src/components/TopicPillRow.unit.test.tsx`
- Test: `src/components/SubjectCard.unit.test.tsx`
- Test: add focused tests only where missing

- [ ] **Step 1: Extend the relevant tests first**

Add the smallest expectations needed to preserve:

- existing labels/content
- warning/due-state semantics
- pill/card rendering presence

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npm run test:unit -- --runTestsByPath src/components/TopicPillRow.unit.test.tsx
npm run test:unit -- --runTestsByPath src/components/SubjectCard.unit.test.tsx
```

Expected: FAIL only where the new expectations are added.

- [ ] **Step 3: Implement the minimal visual cleanup**

Convert flat opaque pills/cards/alerts into token-driven glass-tinted versions while keeping semantics, subject color cues, and warning emphasis.

- [ ] **Step 4: Re-run the focused tests**

Run the same commands.
Expected: PASS.

### Task 6: Typecheck and Final Verification

**Files:**

- Verify all modified files from Tasks 1-6

- [ ] **Step 1: Run targeted unit tests for all touched files**

Run each focused `npm run test:unit -- --runTestsByPath ...` command used above.
Expected: PASS.

- [ ] **Step 2: Run the repo typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run a normal push-blocking validation for the original failure path**

Run: `npm run test:unit -- --runTestsByPath src/components/home/QuickStatsCard.unit.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit the primitive polish pass**

```bash
git add src/theme/linearTheme.ts \
  src/components/primitives/LinearSurface.tsx \
  src/components/primitives/LinearText.tsx \
  src/components/primitives/LinearButton.tsx \
  src/components/primitives/LinearBadge.tsx \
  src/components/primitives/LinearDivider.tsx \
  src/components/primitives/LinearTextInput.tsx \
  src/components/BannerSearchBar.tsx \
  src/components/ScreenBannerFrame.tsx \
  src/components/ScreenHeader.tsx \
  src/components/Toast.tsx \
  src/components/TopicPillRow.tsx \
  src/components/SubjectCard.tsx \
  src/components/SubjectSelectionCard.tsx \
  docs/superpowers/specs/2026-04-04-primitive-polish-design.md \
  docs/superpowers/plans/2026-04-04-primitive-polish.md
git commit -m "feat: polish glass primitives and shared chrome"
```
