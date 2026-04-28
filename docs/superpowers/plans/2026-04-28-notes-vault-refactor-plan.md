# Notes Vault Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move NotesVaultScreen into a dedicated feature folder with extracted hooks/components, keeping behavior equivalent with small UX polish.

**Architecture:** Keep `useVaultList` as the list state machine and extract NotesVault’s DB IO, diagnostics derivations, and side-effectful actions into dedicated hooks. Extract large UI sections into leaf components under the feature folder. Keep a re-export shim at the old screen path to avoid broad navigation churn.

**Tech Stack:** React Native + Expo, React Navigation, @shopify/flash-list, existing Guru primitives (LinearSurface/LinearText), existing dialogs, existing vault hooks (`useVaultList`).

---

## File Map (Create/Modify)

**Create**
- `src/screens/vaults/notes/NotesVaultScreen.tsx`
- `src/screens/vaults/notes/styles.ts`
- `src/screens/vaults/notes/types.ts`
- `src/screens/vaults/notes/utils.ts`
- `src/screens/vaults/notes/hooks/useNotesVaultData.ts`
- `src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts`
- `src/screens/vaults/notes/hooks/useNotesVaultActions.ts`
- `src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts`
- `src/screens/vaults/notes/components/NotesVaultSummaryCard.tsx`
- `src/screens/vaults/notes/components/NotesVaultSelectionBanner.tsx`
- `src/screens/vaults/notes/components/NotesVaultToolbar.tsx`
- `src/screens/vaults/notes/components/NotesVaultFilterSheet.tsx`
- `src/screens/vaults/notes/components/NoteReaderModal.tsx`

**Modify**
- `src/screens/NotesVaultScreen.tsx` (convert to re-export shim)
- `src/navigation/TabNavigator.unit.test.tsx` (mock the shim path; should remain unchanged if shim is used)

**Verify**
- `npm run lint`
- `npm run test:unit:coverage:logic`
- `npm run verify:ci`

---

### Task 1: Create Notes Vault feature folder skeleton

**Files:**
- Create: `src/screens/vaults/notes/{NotesVaultScreen.tsx,styles.ts,types.ts,utils.ts}`
- Create: `src/screens/vaults/notes/{hooks/*,components/*}` (empty exports initially)

- [ ] **Step 1: Create `types.ts`**

```ts
import type { LectureHistoryItem } from '../../../db/queries/aiCache';

export type NoteItem = LectureHistoryItem;
export type SortOption = 'date' | 'subject' | 'words';
```

- [ ] **Step 2: Create `utils.ts`**

```ts
import type { NoteItem } from './types';

export function countWords(text: string): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

export function getTitle(item: NoteItem): string {
  const summary = item.summary?.trim();
  if (
    summary &&
    !/^lecture content recorded(\.|\. review transcript for details\.)?$/i.test(summary) &&
    !/^lecture summary captured\.?$/i.test(summary)
  ) {
    return summary;
  }
  if (item.topics.length > 0) return item.topics.slice(0, 3).join(', ');
  return item.note?.slice(0, 60) || 'Untitled Note';
}

export function buildNoteGroundingContext(item: NoteItem): string {
  return [
    `Title: ${getTitle(item)}`,
    `Subject: ${item.subjectName || 'Unknown'}`,
    item.topics.length > 0 ? `Topics: ${item.topics.join(', ')}` : null,
    item.summary ? `Summary: ${item.summary}` : null,
    item.appName ? `Source: ${item.appName}` : null,
    `Saved note:\n${item.note.trim().slice(0, 4500)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildVaultGroundingContext(notes: NoteItem[]): string {
  return notes
    .slice(0, 5)
    .map((note, index) => `Note ${index + 1}\n${buildNoteGroundingContext(note)}`)
    .join('\n\n---\n\n');
}
```

- [ ] **Step 3: Create a placeholder `styles.ts` that re-exports the existing StyleSheet**

```ts
import { StyleSheet } from 'react-native';
import { linearTheme as n } from '../../../theme/linearTheme';
import { errorAlpha, warningAlpha, successAlpha, blackAlpha } from '../../../theme/colorUtils';

export const styles = StyleSheet.create({});

export { n, errorAlpha, warningAlpha, successAlpha, blackAlpha };
```

- [ ] **Step 4: Create placeholder components/hooks files exporting stubs**

Expected stubs:
- Each hook file exports a function returning minimal shape so the new screen compiles during incremental build.
- Each component returns `null` temporarily.

- [ ] **Step 5: Commit**

```bash
git add src/screens/vaults/notes
git commit -m "refactor(notes-vault): add feature folder skeleton"
```

---

### Task 2: Move StyleSheet + fix import formatting

**Files:**
- Modify: `src/screens/NotesVaultScreen.tsx`
- Modify/Create: `src/screens/vaults/notes/styles.ts`

- [ ] **Step 1: Copy the StyleSheet block from the old screen into `styles.ts`**
- [ ] **Step 2: Fix obvious `react-native` import formatting issues (e.g. `Platform, Pressable }`) while moving**
- [ ] **Step 3: Update the new `NotesVaultScreen.tsx` to import `styles` from `./styles`**
- [ ] **Step 4: Commit**

```bash
git add src/screens/vaults/notes/styles.ts src/screens/vaults/notes/NotesVaultScreen.tsx
git commit -m "refactor(notes-vault): extract styles"
```

---

### Task 3: Extract DB loading lifecycle into `useNotesVaultData`

**Files:**
- Create: `src/screens/vaults/notes/hooks/useNotesVaultData.ts`
- Modify: `src/screens/vaults/notes/NotesVaultScreen.tsx`

- [ ] **Step 1: Implement hook**

```ts
import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getLectureHistory } from '../../../../db/queries/aiCache';
import type { NoteItem } from '../types';

export function useNotesVaultData(opts: {
  pageSize: number;
  setDisplayCount: (n: number) => void;
  setNotes: (updater: NoteItem[] | ((prev: NoteItem[]) => NoteItem[])) => void;
  setLoading: (v: boolean) => void;
  setRefreshing: (v: boolean) => void;
}) {
  const { pageSize, setDisplayCount, setNotes, setLoading, setRefreshing } = opts;

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getLectureHistory(500);
      const withNotes = all.filter((n) => n.note?.trim() && n.note.length > 20);
      setNotes(withNotes);
      setDisplayCount(pageSize);
    } finally {
      setLoading(false);
    }
  }, [pageSize, setDisplayCount, setLoading, setNotes]);

  useFocusEffect(
    useCallback(() => {
      void loadNotes();
    }, [loadNotes]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotes();
    setRefreshing(false);
  }, [loadNotes, setRefreshing]);

  return { loadNotes, refresh };
}
```

- [ ] **Step 2: Update screen to use the hook and remove duplicated load/refresh logic**
- [ ] **Step 3: Run logic tests**

Run: `npm run test:unit:coverage:logic`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/screens/vaults/notes/hooks/useNotesVaultData.ts src/screens/vaults/notes/NotesVaultScreen.tsx
git commit -m "refactor(notes-vault): extract data loading hook"
```

---

### Task 4: Extract diagnostics derivations into `useNotesVaultDiagnostics`

**Files:**
- Create: `src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts`
- Modify: `src/screens/vaults/notes/NotesVaultScreen.tsx`

- [ ] **Step 1: Implement hook**

```ts
import { useMemo } from 'react';
import type { NoteItem } from '../types';
import { countWords } from '../utils';

export function useNotesVaultDiagnostics(opts: { notes: NoteItem[]; visibleNotes: NoteItem[] }) {
  const { notes, visibleNotes } = opts;

  const junkNotes = useMemo(() => notes.filter((n) => countWords(n.note) < 80), [notes]);

  const duplicateIds = useMemo(() => {
    const groups = new Map<string, NoteItem[]>();
    for (const n of notes) {
      if (!n.note || countWords(n.note) < 5) continue;
      const key = n.note.trim().slice(0, 200);
      const group = groups.get(key) ?? [];
      group.push(n);
      groups.set(key, group);
    }
    const dupes = new Set<number>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => b.createdAt - a.createdAt);
      for (let i = 1; i < group.length; i++) dupes.add(group[i].id);
    }
    return dupes;
  }, [notes]);

  const unlabeledNotes = useMemo(
    () =>
      notes.filter((n) => {
        if (countWords(n.note) < 80) return false;
        const subj = (n.subjectName ?? '').toLowerCase();
        return (
          !subj ||
          subj === 'general' ||
          subj === 'unknown' ||
          subj === 'lecture' ||
          (!n.summary && n.topics.length === 0)
        );
      }),
    [notes],
  );

  const badTitleNotes = useMemo(
    () =>
      notes.filter((n) => {
        const s = (n.summary ?? '').toLowerCase();
        return (
          !!s &&
          (/\b(covers?|focuses?|discusses?|overview of|about the|this note)\b/.test(s) ||
            /^lecture content recorded(\. review transcript for details\.)?$/.test(s) ||
            /^lecture summary captured\.?$/.test(s))
        );
      }),
    [notes],
  );

  const taggedNotesCount = useMemo(
    () => notes.filter((note) => note.topics.length > 0).length,
    [notes],
  );

  const wordCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const note of visibleNotes) {
      map.set(note.id, countWords(note.note));
    }
    return map;
  }, [visibleNotes]);

  return { junkNotes, duplicateIds, unlabeledNotes, badTitleNotes, taggedNotesCount, wordCountMap };
}
```

- [ ] **Step 2: Update screen to consume diagnostics from hook**
- [ ] **Step 3: Commit**

```bash
git add src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts src/screens/vaults/notes/NotesVaultScreen.tsx
git commit -m "refactor(notes-vault): extract diagnostics hook"
```

---

### Task 5: Extract destructive actions into `useNotesVaultActions`

**Files:**
- Create: `src/screens/vaults/notes/hooks/useNotesVaultActions.ts`
- Modify: `src/screens/vaults/notes/NotesVaultScreen.tsx`

- [ ] **Step 1: Implement hook (delete single, batch delete, delete junk, delete dupes)**

Key API calls (already used today):
- `deleteLectureNote`
- dialogs: `confirmDestructive`, `showInfo`

Implementation requirements:
- Keep identical dialog copy unless UX polish is explicitly desired.
- Ensure local state is updated and `loadNotes()` is called at the end.

- [ ] **Step 2: Update screen to call hook functions**
- [ ] **Step 3: Commit**

```bash
git add src/screens/vaults/notes/hooks/useNotesVaultActions.ts src/screens/vaults/notes/NotesVaultScreen.tsx
git commit -m "refactor(notes-vault): extract delete actions"
```

---

### Task 6: Extract AI relabel workflow into `useNotesVaultRelabel`

**Files:**
- Create: `src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts`
- Modify: `src/screens/vaults/notes/NotesVaultScreen.tsx`

- [ ] **Step 1: Implement hook**

Key API calls (already used today):
- `aiRelabelNote`
- `getSubjectByName`
- `updateLectureAnalysisMetadata`
- dialogs: `confirm`, `showSuccess`

Implementation requirements:
- Preserve `relabelProgress` string format (`"${i + 1}/${targets.length}"`).
- Keep best-effort behavior (count failed, continue).

- [ ] **Step 2: Update screen to consume the hook**
- [ ] **Step 3: Commit**

```bash
git add src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts src/screens/vaults/notes/NotesVaultScreen.tsx
git commit -m "refactor(notes-vault): extract AI relabel hook"
```

---

### Task 7: Extract UI sections into components

**Files:**
- Create: `src/screens/vaults/notes/components/*.tsx`
- Modify: `src/screens/vaults/notes/NotesVaultScreen.tsx`

- [ ] **Step 1: Extract Summary card into `NotesVaultSummaryCard`**
  - Inputs: `visibleCount`, `notesCount`, `subjectCount`, `taggedCount`, `unlabeledCount`

- [ ] **Step 2: Extract selection banner into `NotesVaultSelectionBanner`**
  - Inputs: `selectedCount`, `onCancel`, `onDeleteSelected`

- [ ] **Step 3: Extract toolbar into `NotesVaultToolbar`**
  - Inputs: counts + filter summary + sort label + callbacks (Ask Guru, open filter, open sort, delete junk/dupes, relabel, fix bad titles)
  - UX polish: show active filter summary instead of “Filters on”
  - UX polish: disable action chips when `relabelProgress` is non-null

- [ ] **Step 4: Extract filter sheet into `NotesVaultFilterSheet`**
  - Inputs: `open`, `onClose`, `subjectOptions`, `topicOptions`, `subjectFilter`, `topicFilter`, setters

- [ ] **Step 5: Extract reader modal into `NoteReaderModal`**
  - Inputs: `open`, `onClose`, `note`, `title`, `onCopy`, `onAskGuru`

- [ ] **Step 6: Commit**

```bash
git add src/screens/vaults/notes/components src/screens/vaults/notes/NotesVaultScreen.tsx
git commit -m "refactor(notes-vault): extract UI components"
```

---

### Task 8: Add shim at old path + update navigation mocks if needed

**Files:**
- Modify: `src/screens/NotesVaultScreen.tsx`
- Verify: `src/navigation/tabStacks.tsx`, `src/navigation/TabNavigator.unit.test.tsx`

- [ ] **Step 1: Replace old screen implementation with a re-export**

```ts
export { default } from './vaults/notes/NotesVaultScreen';
```

- [ ] **Step 2: Ensure `tabStacks.tsx` import still resolves (it should)**
- [ ] **Step 3: Ensure `TabNavigator.unit.test.tsx` mock still resolves (it should)**
- [ ] **Step 4: Commit**

```bash
git add src/screens/NotesVaultScreen.tsx src/navigation
git commit -m "refactor(notes-vault): re-export screen from feature folder"
```

---

### Task 9: Final verification

**Files:**
- No code changes unless needed for lint/test failures

- [ ] **Step 1: Run lint**

Run: `npm run lint`  
Expected: PASS

- [ ] **Step 2: Run logic coverage**

Run: `npm run test:unit:coverage:logic`  
Expected: PASS

- [ ] **Step 3: Run full CI verification**

Run: `npm run verify:ci`  
Expected: PASS

- [ ] **Step 4: Commit (only if changes were needed)**

```bash
git add -A
git commit -m "refactor(notes-vault): finalize refactor"
```

---

## Self-Review Checklist
- Plan covers: feature folder migration, hooks extraction, UI extraction, shim, tests.
- No placeholders remain for core code paths (hooks/components have explicit responsibilities and required APIs).
- No naming mismatch: `NoteItem`, `SortOption`, `countWords`, `getTitle` remain consistent.

## Execution Choice
Plan complete and saved to `docs/superpowers/plans/2026-04-28-notes-vault-refactor-plan.md`.

Two execution options:
1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks
2. **Inline Execution** — Execute tasks in this session with checkpoints

Which approach?

