# Guru UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incrementally land the approved `Launchpad + Tree` redesign on `v2.0` without breaking the existing React Native study flows, lecture pipeline, or stored progress.

**Architecture:** Implement the redesign in slices that keep the app working after every task: shell and navigation first, then Home, then the mastery/tree data foundation, then Tree/Vault/Stats/chat surfaces, then GuruBrain and lecture companion upgrades. Use `Gemini CLI` for UI generation and visual exploration, but treat the approved design spec as the behavioral and architectural source of truth while integrating the resulting UI into the existing Expo/React Native codebase.

**Tech Stack:** Expo SDK 54, React Native 0.81, React Navigation 7, Zustand, expo-sqlite, Expo Modules Android native code (`modules/app-launcher`), Jest, Detox, Gemini CLI

---

## Scope Strategy

The approved spec spans multiple subsystems. Do not attempt a one-shot rewrite. Execute this plan in order so each task yields a working, testable slice:

1. Shell and route restructuring
2. Home launchpad redesign
3. Mastery/tree data foundation
4. Tree screen implementation
5. Vault, Stats, and floating Guru chat shell
6. GuruBrain adaptive start and user-state slider
7. Lecture companion and post-lecture conversion
8. Final verification and cleanup

`Gemini CLI` should be used before UI-heavy tasks to generate visual references for the exact surfaces being built. Save prompts and accepted exports under a local working directory such as `docs/ui/gemini/` or another non-production folder, then translate only the accepted direction into code.

## File Structure

### Existing files to modify

- `src/navigation/types.ts` — replace the old `Syllabus / ActionHub / Chat / Menu` top-level model with `Home / Tree / Vault / Stats`, add modal routes for `GuruChat` and `Settings`, and preserve nested routes that still matter.
- `src/navigation/TabNavigator.tsx` — replace the current 5-tab shell with the approved 4-destination shell and route existing screens into the right stacks.
- `src/navigation/RootNavigator.tsx` — host modal routes for `GuruChat`, `Settings`, and any launch-flow screens that should no longer live under the old Menu stack.
- `src/navigation/linking.ts` — update deep links to the new shell names and ensure old links still resolve or intentionally redirect.
- `src/screens/HomeScreen.tsx` — convert the current dashboard-like screen into a simple launchpad with countdown, `Start`, `Lecture capture`, collapsed `Today's path`, and collapsible `Tools`.
- `src/screens/SyllabusScreen.tsx` — either replace its contents with the Tree entry surface or reduce it to a compatibility wrapper while `KnowledgeTreeScreen` becomes the real implementation.
- `src/screens/NotesHubScreen.tsx` — evolve or wrap this into the new `Vault` surface.
- `src/screens/StatsScreen.tsx` — keep as top-level but refocus content around mastery, source coverage, recovery patterns, and question pressure.
- `src/components/StartButton.tsx` — preserve the big anti-inertia CTA but align it with the new adaptive `Start` flow.
- `src/components/LectureReturnSheet.tsx` — evolve into the hybrid post-lecture payoff + next-actions surface.
- `src/components/home/TodayPlanCard.tsx` — simplify into a collapsed `Today's path` surface rather than a dashboard centerpiece.
- `src/store/useAppStore.ts` — hold any new shell-level state, home toggles, and profile-backed flags.
- `src/services/studyPlanner.ts` — remain the planning core but begin consuming the richer mastery and source signal model.
- `src/services/sessionPlanner.ts` — wire the adaptive `Start` recommendation into existing session paths such as `warmup`.
- `src/services/lectureSessionMonitor.ts` — expose post-lecture plan/action conversion hooks and break-time consolidation metadata.
- `src/services/appLauncher.ts` — pass richer overlay payload/state to the native overlay.
- `src/services/appLauncher/overlay.ts` — keep permission handling while supporting the redesigned companion overlay.
- `src/db/schema.ts` — add mastery- and tree-related schema primitives.
- `src/db/migrations.ts` — append new migrations after version `86`.
- `src/db/queries/topics.ts` — expose tree-ready topic and mastery queries.
- `src/db/queries/progress.ts` — extend profile and daily-log persistence for the state slider and new profile flags.
- `src/types/index.ts` — add explicit types for mastery, source coverage, and tree nodes.
- `src/schemas/core.ts` — extend enums/types if new persisted states require schema support.
- `modules/app-launcher/index.ts` — update the JS-facing overlay contract for the lecture companion.
- `modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt` — implement the redesigned study-companion overlay.
- `modules/app-launcher/android/src/main/java/expo/modules/applauncher/AppLauncherModule.kt` — update native method signatures if overlay payloads expand.

### New files to create

- `src/screens/KnowledgeTreeScreen.tsx` — the new top-level Tree destination.
- `src/screens/VaultScreen.tsx` — the new top-level Vault entry point, wrapping recent artifacts plus topic-based access.
- `src/components/home/HomeToolsSection.tsx` — collapsible tools icon grid.
- `src/components/home/HomeTodayPathSection.tsx` — collapsed `Today's path` section extracted from `TodayPlanCard`.
- `src/components/home/LectureCaptureCard.tsx` — the prominent secondary lecture-capture action on Home.
- `src/components/home/StateSlider.tsx` — quick energy/paralysis slider replacing the heavier check-in feel.
- `src/components/tree/DigitalTreeCanvas.tsx` — tablet/phone tree rendering surface.
- `src/components/tree/MasteryLegend.tsx` — mastery color legend separate from urgency markers.
- `src/components/tree/SourceOverlayToggle.tsx` — controls for `BTR / DBMCI / Marrow` overlays and connections mode.
- `src/components/GuruChatFab.tsx` — floating entry point for Guru chat outside Home.
- `src/services/tree/buildTreeViewModel.ts` — pure data transformer from topic rows to tree nodes plus optional connection overlays.
- `src/services/tree/buildTreeViewModel.unit.test.ts` — tests for tree shaping logic.
- `src/services/guruBrain/recommendStartPath.ts` — pure logic for `smart default with override`.
- `src/services/guruBrain/recommendStartPath.unit.test.ts` — tests for bad-day and good-day start recommendations.
- `src/services/lecture/buildPostLectureActions.ts` — convert lecture analysis into next tasks, question prompts, and plan deltas.
- `src/services/lecture/buildPostLectureActions.unit.test.ts` — tests for post-lecture action derivation.
- `src/navigation/TabNavigator.shell.unit.test.tsx` — focused shell regression test for the new tab model.
- `src/screens/HomeScreen.unit.test.tsx` — launchpad-specific tests.
- `src/screens/VaultScreen.unit.test.tsx` — vault default mode tests.
- `src/screens/KnowledgeTreeScreen.unit.test.tsx` — tree-surface smoke tests.

## Preflight: Gemini CLI Baselines

Before Tasks 2, 4, 5, and 7:

- run `gemini` locally to generate the target surface for the specific slice you are about to build
- use the approved spec file as the input source of truth:
  - `docs/superpowers/specs/2026-03-21-guru-ui-overhaul-design.md`
- save the accepted outputs or screenshots in a local reference folder
- do not start coding until the slice has a concrete visual target

If the local `gemini` command requires authentication or different flags on this machine, resolve that once and reuse it consistently across all UI-heavy tasks.

### Task 1: Restructure the App Shell

**Files:**

- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/TabNavigator.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/navigation/linking.ts`
- Create: `src/screens/KnowledgeTreeScreen.tsx`
- Create: `src/screens/VaultScreen.tsx`
- Test: `src/navigation/TabNavigator.shell.unit.test.tsx`
- Test: `src/navigation/RootNavigator.unit.test.tsx`

- [ ] **Step 1: Write the failing shell tests**

```tsx
it('renders the new top-level tabs', () => {
  const { getByText } = render(<TabNavigator />);
  expect(getByText('Home')).toBeTruthy();
  expect(getByText('Tree')).toBeTruthy();
  expect(getByText('Vault')).toBeTruthy();
  expect(getByText('Stats')).toBeTruthy();
});
```

- [ ] **Step 2: Run the targeted shell tests to verify they fail**

Run: `npm run test:unit -- src/navigation/TabNavigator.shell.unit.test.tsx src/navigation/RootNavigator.unit.test.tsx`

Expected: FAIL because `TreeTab` / `VaultTab` routes and modal chat/settings routes do not exist yet.

- [ ] **Step 3: Replace the old tab model in `src/navigation/types.ts`**

```ts
export type TreeStackParamList = {
  KnowledgeTree: undefined;
  TopicDetail: {
    subjectId: number;
    subjectName: string;
    initialTopicId?: number;
    initialSearchQuery?: string;
  };
};

export type VaultStackParamList = {
  VaultHome: undefined;
  NotesSearch: undefined;
  ManualNoteCreation: undefined;
  TranscriptHistory: { noteId?: number } | undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  TreeTab: NavigatorScreenParams<TreeStackParamList> | undefined;
  VaultTab: NavigatorScreenParams<VaultStackParamList> | undefined;
  StatsTab: undefined;
};
```

- [ ] **Step 4: Update `TabNavigator` and `RootNavigator` to the new shell**

```tsx
<Tab.Screen name="HomeTab" component={HomeStackNav} />
<Tab.Screen name="TreeTab" component={TreeStackNav} />
<Tab.Screen name="VaultTab" component={VaultStackNav} />
<Tab.Screen name="StatsTab" component={StatsScreen} />
```

Add modal routes in `RootNavigator` for:

- `GuruChatModal`
- `SettingsModal`

Do not delete old feature screens yet. Re-home or temporarily route them through the new stacks so the app remains usable after this task.

- [ ] **Step 5: Add minimal temporary `KnowledgeTreeScreen` and `VaultScreen` screen stubs**

```tsx
export default function KnowledgeTreeScreen() {
  return (
    <SafeAreaView>
      <Text>Knowledge Tree</Text>
    </SafeAreaView>
  );
}
```

- [ ] **Step 6: Run the shell tests again**

Run: `npm run test:unit -- src/navigation/TabNavigator.shell.unit.test.tsx src/navigation/RootNavigator.unit.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/navigation/types.ts src/navigation/TabNavigator.tsx src/navigation/RootNavigator.tsx src/navigation/linking.ts src/screens/KnowledgeTreeScreen.tsx src/screens/VaultScreen.tsx src/navigation/TabNavigator.shell.unit.test.tsx src/navigation/RootNavigator.unit.test.tsx
git commit -m "feat: add launchpad tree vault stats shell"
```

### Task 2: Rebuild Home as a Launchpad

**Files:**

- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/components/StartButton.tsx`
- Modify: `src/components/home/TodayPlanCard.tsx`
- Create: `src/components/home/HomeTodayPathSection.tsx`
- Create: `src/components/home/HomeToolsSection.tsx`
- Create: `src/components/home/LectureCaptureCard.tsx`
- Test: `src/screens/HomeScreen.unit.test.tsx`
- Test: `src/components/StartButton.unit.test.tsx`

- [ ] **Step 1: Write the failing Home launchpad test**

```tsx
it('renders countdown, Start, lecture capture, and collapsed sections', () => {
  const { getByText, queryByText } = render(<HomeScreen />);
  expect(getByText(/INICET/i)).toBeTruthy();
  expect(getByText(/START/i)).toBeTruthy();
  expect(getByText(/Lecture capture/i)).toBeTruthy();
  expect(queryByText(/Mind maps/i)).toBeNull();
});
```

- [ ] **Step 2: Run the Home tests to verify they fail**

Run: `npm run test:unit -- src/screens/HomeScreen.unit.test.tsx src/components/StartButton.unit.test.tsx`

Expected: FAIL because the current Home still renders dashboard-heavy cards and has no launchpad-specific tools section.

- [ ] **Step 3: Extract the collapsible Home sections**

Create:

- `HomeTodayPathSection.tsx`
- `HomeToolsSection.tsx`
- `LectureCaptureCard.tsx`

Use the existing study/lecture services instead of introducing new launch code.

- [ ] **Step 4: Replace the dashboard-heavy `HomeScreen` composition**

The new render order should be:

1. exam countdown
2. `StartButton`
3. `LectureCaptureCard`
4. collapsed `HomeTodayPathSection`
5. collapsed `HomeToolsSection`

Keep the heavier stats and shortcut surfaces off the default Home path.

- [ ] **Step 5: Wire `HomeToolsSection` to the existing feature routes**

Expose icon actions for:

- mind maps
- audio transcription
- MCQs
- find from clues
- random topic
- note from transcript

Prefer reusing existing screens or session modes before inventing new routes.

- [ ] **Step 6: Run the Home tests again**

Run: `npm run test:unit -- src/screens/HomeScreen.unit.test.tsx src/components/StartButton.unit.test.tsx src/hooks/useHomeDashboardData.unit.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/screens/HomeScreen.tsx src/components/StartButton.tsx src/components/home/TodayPlanCard.tsx src/components/home/HomeTodayPathSection.tsx src/components/home/HomeToolsSection.tsx src/components/home/LectureCaptureCard.tsx src/screens/HomeScreen.unit.test.tsx
git commit -m "feat: redesign home as launchpad"
```

### Task 3: Add the Mastery and Tree Data Foundation

**Files:**

- Modify: `src/db/schema.ts`
- Modify: `src/db/migrations.ts`
- Modify: `src/types/index.ts`
- Modify: `src/db/queries/topics.ts`
- Modify: `src/db/queries/progress.ts`
- Create: `src/services/tree/buildTreeViewModel.ts`
- Test: `src/services/tree/buildTreeViewModel.unit.test.ts`

- [ ] **Step 1: Write the failing tree-data test**

```ts
it('groups atomic topics into a stable tree and preserves mastery metadata', () => {
  const model = buildTreeViewModel(mockTopics);
  expect(model.subjectBranches).toHaveLength(2);
  expect(model.subjectBranches[0].children[0].masteryLevel).toBe(4);
});
```

- [ ] **Step 2: Run the tree-data test to verify it fails**

Run: `npm run test:unit -- src/services/tree/buildTreeViewModel.unit.test.ts`

Expected: FAIL because `buildTreeViewModel` and the new mastery fields do not exist.

- [ ] **Step 3: Append schema migrations after version `86`**

Add migrations for:

- `topic_progress.mastery_level INTEGER NOT NULL DEFAULT 0`
- `topic_progress.btr_stage INTEGER NOT NULL DEFAULT 0`
- `topic_progress.dbmci_stage INTEGER NOT NULL DEFAULT 0`
- `topic_progress.marrow_attempted_count INTEGER NOT NULL DEFAULT 0`
- `topic_progress.marrow_correct_count INTEGER NOT NULL DEFAULT 0`
- `daily_log.energy_score INTEGER`
- `user_profile.home_chat_enabled INTEGER NOT NULL DEFAULT 0`
- `topic_connections` table for optional cross-topic links

Also update `LATEST_VERSION`.

- [ ] **Step 4: Extend the runtime types and queries**

```ts
export interface TopicProgress {
  masteryLevel: number;
  btrStage: number;
  dbmciStage: number;
  marrowAttemptedCount: number;
  marrowCorrectCount: number;
}
```

Update `TOPIC_SELECT` and row mapping in `src/db/queries/topics.ts` so the new fields hydrate automatically for any screen using `TopicWithProgress`.

- [ ] **Step 5: Create `buildTreeViewModel` as a pure transformer**

The service should:

- build subject branches from `parent_topic_id`
- compute tablet and phone entry nodes
- expose badges/overlay info for `BTR`, `DBMCI`, and `Marrow`
- keep connections separate so the default tree stays calm

- [ ] **Step 6: Run the tree-data tests again**

Run: `npm run test:unit -- src/services/tree/buildTreeViewModel.unit.test.ts src/db/database.unit.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/migrations.ts src/types/index.ts src/db/queries/topics.ts src/db/queries/progress.ts src/services/tree/buildTreeViewModel.ts src/services/tree/buildTreeViewModel.unit.test.ts
git commit -m "feat: add mastery and tree data foundation"
```

### Task 4: Implement the Knowledge Tree Surface

**Files:**

- Modify: `src/screens/KnowledgeTreeScreen.tsx`
- Modify: `src/screens/TopicDetailScreen.tsx`
- Create: `src/components/tree/DigitalTreeCanvas.tsx`
- Create: `src/components/tree/MasteryLegend.tsx`
- Create: `src/components/tree/SourceOverlayToggle.tsx`
- Test: `src/screens/KnowledgeTreeScreen.unit.test.tsx`
- Test: `src/services/tree/buildTreeViewModel.unit.test.ts`

- [ ] **Step 1: Write the failing Knowledge Tree screen test**

```tsx
it('renders the tablet tree and the source overlay controls', () => {
  const { getByText } = render(<KnowledgeTreeScreen />);
  expect(getByText(/Mastery/i)).toBeTruthy();
  expect(getByText(/BTR/i)).toBeTruthy();
  expect(getByText(/DBMCI/i)).toBeTruthy();
  expect(getByText(/Marrow/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the Knowledge Tree tests to verify they fail**

Run: `npm run test:unit -- src/screens/KnowledgeTreeScreen.unit.test.tsx src/services/tree/buildTreeViewModel.unit.test.ts`

Expected: FAIL because the tree screen is still a temporary stub.

- [ ] **Step 3: Build the first working Tree screen**

`KnowledgeTreeScreen` must:

- show the last active area plus surrounding context on tablet
- show the active area by default on phone
- render mastery color, not urgency color
- expose a connections toggle and source overlay toggle without enabling them by default

- [ ] **Step 4: Use `TopicDetailScreen` as the deep drill-down rather than rebuilding topic detail immediately**

Route branch/twig presses into:

- `TopicDetail` for existing detail workflows
- branch expansion for the tree view itself

Keep this slice practical: do not rebuild topic detail in the same task.

- [ ] **Step 5: Run the Tree tests again**

Run: `npm run test:unit -- src/screens/KnowledgeTreeScreen.unit.test.tsx src/services/tree/buildTreeViewModel.unit.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/KnowledgeTreeScreen.tsx src/screens/TopicDetailScreen.tsx src/components/tree/DigitalTreeCanvas.tsx src/components/tree/MasteryLegend.tsx src/components/tree/SourceOverlayToggle.tsx src/screens/KnowledgeTreeScreen.unit.test.tsx
git commit -m "feat: add digital knowledge tree screen"
```

### Task 5: Promote Vault and Add Floating Guru Chat

**Files:**

- Modify: `src/screens/VaultScreen.tsx`
- Modify: `src/screens/NotesHubScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Create: `src/components/GuruChatFab.tsx`
- Test: `src/screens/VaultScreen.unit.test.tsx`
- Test: `src/navigation/RootNavigator.unit.test.tsx`

- [ ] **Step 1: Write the failing Vault and chat-shell tests**

```tsx
it('shows recent artifacts above topic-based organization', () => {
  const { getByText } = render(<VaultScreen />);
  expect(getByText(/Recent/i)).toBeTruthy();
  expect(getByText(/By topic/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the Vault tests to verify they fail**

Run: `npm run test:unit -- src/screens/VaultScreen.unit.test.tsx src/navigation/RootNavigator.unit.test.tsx`

Expected: FAIL because Vault is still a temporary stub and Guru chat has no floating shell entry.

- [ ] **Step 3: Reframe `NotesHubScreen` as the implementation base for `VaultScreen`**

Use `VaultScreen` to compose:

- recent lecture/transcript/note artifacts at the top
- topic-linked access below
- existing recovery and upload flows from `NotesHubScreen`

Do not delete `NotesHubScreen` yet. Convert it into a thin wrapper or shared child during the transition.

- [ ] **Step 4: Add the floating Guru chat entry**

Create `GuruChatFab.tsx` and mount it outside Home in the shell.

Initial implementation can open `GuruChatScreen` as a root-stack modal:

```ts
navigation.navigate('GuruChatModal', { topicName, initialQuestion });
```

- [ ] **Step 5: Run the Vault tests again**

Run: `npm run test:unit -- src/screens/VaultScreen.unit.test.tsx src/navigation/RootNavigator.unit.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/VaultScreen.tsx src/screens/NotesHubScreen.tsx src/navigation/RootNavigator.tsx src/components/GuruChatFab.tsx src/screens/VaultScreen.unit.test.tsx
git commit -m "feat: add vault surface and floating guru chat"
```

### Task 6: Implement the Hybrid State Slider and Adaptive Start Logic

**Files:**

- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/store/useAppStore.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrations.ts`
- Modify: `src/db/queries/progress.ts`
- Modify: `src/services/sessionPlanner.ts`
- Create: `src/components/home/StateSlider.tsx`
- Create: `src/services/guruBrain/recommendStartPath.ts`
- Test: `src/services/guruBrain/recommendStartPath.unit.test.ts`
- Test: `src/screens/HomeScreen.unit.test.tsx`

- [ ] **Step 1: Write the failing adaptive-start tests**

```ts
it('prefers warmup review paths on low-energy days', () => {
  const result = recommendStartPath({ energyScore: 15, backlogCount: 12 });
  expect(result.kind).toBe('warmup_review');
});
```

- [ ] **Step 2: Run the adaptive-start tests to verify they fail**

Run: `npm run test:unit -- src/services/guruBrain/recommendStartPath.unit.test.ts src/screens/HomeScreen.unit.test.tsx`

Expected: FAIL because no recommendation engine or state slider exists.

- [ ] **Step 3: Persist the slider signal**

Add `daily_log.energy_score` and thread it through `getUserProfile`/daily-log queries or a lightweight helper so Home can restore the latest explicit state.

- [ ] **Step 4: Implement `recommendStartPath` as a pure function**

It should:

- prefer rescue flows on bad days
- reuse existing session modes like `warmup`
- keep override options minimal
- remain deterministic enough to unit test

- [ ] **Step 5: Wire the recommendation into Home**

The Home launchpad should:

- show the slider
- compute the smart default
- allow one-tap override before entering the session

- [ ] **Step 6: Run the adaptive-start tests again**

Run: `npm run test:unit -- src/services/guruBrain/recommendStartPath.unit.test.ts src/screens/HomeScreen.unit.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/screens/HomeScreen.tsx src/store/useAppStore.ts src/db/schema.ts src/db/migrations.ts src/db/queries/progress.ts src/services/sessionPlanner.ts src/components/home/StateSlider.tsx src/services/guruBrain/recommendStartPath.ts src/services/guruBrain/recommendStartPath.unit.test.ts
git commit -m "feat: add adaptive start and state slider"
```

### Task 7: Upgrade the Lecture Companion and Post-Lecture Conversion

**Files:**

- Modify: `src/components/LectureReturnSheet.tsx`
- Modify: `src/services/lectureSessionMonitor.ts`
- Modify: `src/services/appLauncher.ts`
- Modify: `src/services/appLauncher/overlay.ts`
- Modify: `modules/app-launcher/index.ts`
- Modify: `modules/app-launcher/android/src/main/java/expo/modules/applauncher/AppLauncherModule.kt`
- Modify: `modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt`
- Create: `src/services/lecture/buildPostLectureActions.ts`
- Test: `src/components/LectureReturnSheet.unit.test.tsx`
- Test: `src/services/lecture/buildPostLectureActions.unit.test.ts`

- [ ] **Step 1: Write the failing post-lecture action tests**

```ts
it('turns lecture topics into payoff + next-action groups', () => {
  const actions = buildPostLectureActions(mockAnalysis);
  expect(actions.summaryCard).toBeDefined();
  expect(actions.nextTasks.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the lecture tests to verify they fail**

Run: `npm run test:unit -- src/components/LectureReturnSheet.unit.test.tsx src/services/lecture/buildPostLectureActions.unit.test.ts`

Expected: FAIL because there is no post-lecture action builder and the return sheet is still the old shape.

- [ ] **Step 3: Implement `buildPostLectureActions`**

This pure helper should produce:

- immediate payoff cards
- extracted topic payloads
- plan follow-up actions
- break-time consolidation prompts

Keep it pure so the lecture pipeline and the UI can share it.

- [ ] **Step 4: Refactor `LectureReturnSheet` into the approved hybrid surface**

Top section:

- summary
- note preview
- extracted topics
- visible reward/progress signal

Lower section:

- plan changes
- follow-up tasks
- linked question prompts

- [ ] **Step 5: Expand the overlay payload plumbing**

Update the JS/native overlay API so the overlay can support:

- stable Guru avatar identity
- timer/pomodoro state
- quiet body-doubling presentation
- lecture-aware break prompts

Keep the first native slice conservative: do not overanimate the overlay before the shell is stable.

- [ ] **Step 6: Run the lecture tests again**

Run: `npm run test:unit -- src/components/LectureReturnSheet.unit.test.tsx src/services/lecture/buildPostLectureActions.unit.test.ts src/services/lectureSessionMonitor.unit.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/LectureReturnSheet.tsx src/services/lectureSessionMonitor.ts src/services/appLauncher.ts src/services/appLauncher/overlay.ts modules/app-launcher/index.ts modules/app-launcher/android/src/main/java/expo/modules/applauncher/AppLauncherModule.kt modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt src/services/lecture/buildPostLectureActions.ts src/services/lecture/buildPostLectureActions.unit.test.ts
git commit -m "feat: add lecture companion and post-lecture actions"
```

### Task 8: End-to-End Verification and Cleanup

**Files:**

- Modify: `docs/superpowers/specs/2026-03-21-guru-ui-overhaul-design.md` (only if implementation discoveries require explicit design follow-up notes)
- Modify: `docs/superpowers/plans/2026-03-21-guru-ui-overhaul-implementation.md` (check off progress if desired)
- Modify: `.gitignore` (add `.superpowers/` if it should remain local-only)

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS

- [ ] **Step 3: Run the focused redesign unit tests**

Run: `npm run test:unit -- src/navigation/TabNavigator.shell.unit.test.tsx src/screens/HomeScreen.unit.test.tsx src/screens/KnowledgeTreeScreen.unit.test.tsx src/screens/VaultScreen.unit.test.tsx src/services/tree/buildTreeViewModel.unit.test.ts src/services/guruBrain/recommendStartPath.unit.test.ts src/services/lecture/buildPostLectureActions.unit.test.ts`

Expected: PASS

- [ ] **Step 4: Run the CI verification suite**

Run: `npm run verify:ci`

Expected: PASS

- [ ] **Step 5: Run the critical Detox flows if the environment is available**

Run: `npm run detox:test:critical`

Expected: PASS on the available emulator/device configuration

- [ ] **Step 6: Commit any final cleanup**

```bash
git add .gitignore docs/superpowers/specs/2026-03-21-guru-ui-overhaul-design.md docs/superpowers/plans/2026-03-21-guru-ui-overhaul-implementation.md
git commit -m "chore: verify Guru UI overhaul slice"
```

## Local Review Notes

Review this plan against:

- `docs/superpowers/specs/2026-03-21-guru-ui-overhaul-design.md`

Check for:

- missing shell routes
- mismatch between Home simplicity and the implementation tasks
- schema drift between tree/mastery features and the current FSRS-based progress model
- lecture overlay scope creeping beyond the conservative first slice
- any task that would leave the app unusable between commits

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-21-guru-ui-overhaul-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
