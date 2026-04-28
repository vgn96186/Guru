# Notes Vault Refactor (Feature Folder)

## Context
- Current screen is a monolith: [NotesVaultScreen.tsx](file:///Users/vishnugnair/Guru-3/src/screens/NotesVaultScreen.tsx)
- It mixes DB IO, derived diagnostics (junk/dupes), AI relabel workflows, navigation (“Ask Guru”), multiple UI sections/modals, and a very large StyleSheet.
- Similar “vault” screens exist (e.g. Transcript/Recording/Image) with some shared patterns (cards extracted, `useVaultList` used for list mechanics).

## Goals
- Move Notes Vault into a dedicated feature folder to reduce file size and improve separation of concerns.
- Keep behavior functionally equivalent, with only small, low-risk UX polish.
- Preserve existing shared abstractions (`useVaultList`, `NoteCardItem`) unless there is clear reuse value.
- Keep CI stable: `npm run verify:ci` must pass.

## Non-Goals
- No redesign of vault UX or navigation structure.
- No changes to DB schema or note ingestion pipeline.
- No large visual overhaul of styling; any styling changes should be mechanical (moving StyleSheet, minor copy/pill changes).

## Proposed File Layout
- `src/screens/vaults/notes/NotesVaultScreen.tsx`
- `src/screens/vaults/notes/hooks/`
  - `useNotesVaultData.ts`
  - `useNotesVaultDiagnostics.ts`
  - `useNotesVaultRelabel.ts`
  - `useNotesVaultActions.ts`
- `src/screens/vaults/notes/components/`
  - `NotesVaultSummaryCard.tsx`
  - `NotesVaultSelectionBanner.tsx`
  - `NotesVaultToolbar.tsx`
  - `NotesVaultFilterSheet.tsx`
  - `NoteReaderModal.tsx`
- Optional transitional shim:
  - Keep `src/screens/NotesVaultScreen.tsx` as a re-export (if navigation imports are widespread), otherwise update navigation registration directly.

## Module Responsibilities

### NotesVaultScreen (composition)
- Owns layout composition and wiring between hooks + UI components.
- Owns persisted search input wiring (`usePersistedInput`) and scroll restoration (`useScrollRestoration`).
- Avoids embedding any DB loops, AI loops, or large derived `useMemo` blocks.

### useNotesVaultData
- Owns:
  - `loadNotes()` (DB fetch + “with processed notes only” filter)
  - focus refresh (`useFocusEffect`)
  - pull-to-refresh handler
- Inputs:
  - `pageSize` (used to reset display count)
- Outputs:
  - `notes`, `setNotes`, `loading`, `refreshing`, `reload()`

### useNotesVaultDiagnostics
- Owns pure derivations from `notes` and `visibleNotes`:
  - `junkNotes` (word count < 80)
  - `duplicateIds` (by note prefix grouping)
  - `unlabeledNotes` (no/generic subject or no summary/topics)
  - `badTitleNotes` (undesired title patterns)
  - `taggedNotesCount`
  - `wordCountMap` (memoized per visible note id)
- Outputs all sets/counts, plus helpers if needed.

### useNotesVaultRelabel
- Owns AI relabel workflow:
  - `runRelabel(targets)`
  - `relabelProgress`
  - `relabelUnlabeled()` and `fixBadTitles()` convenience actions
- Performs:
  - `aiRelabelNote(noteText)`
  - subject resolution (`getSubjectByName`)
  - `updateLectureAnalysisMetadata`
- Keeps UI interaction limited to:
  - confirm dialogs (`confirm`)
  - completion dialog (`showSuccess`)

### useNotesVaultActions
- Owns:
  - `deleteSingle(id)`
  - `deleteSelected(selectedIds)`
  - `deleteJunk(junkNotes)`
  - `deleteDuplicates(duplicateIds)`
- Handles:
  - confirmation (`confirmDestructive`)
  - errors (`showInfo`)
  - updating local state and triggering reload

### UI Components
- `NotesVaultSummaryCard`: “Study Library” summary + metric tiles
- `NotesVaultSelectionBanner`: selection mode actions (cancel/delete)
- `NotesVaultToolbar`: “X of Y shown”, chips for quick actions (Ask Guru, filters, cleanup actions, relabel actions), and sort/filter triggers
- `NotesVaultFilterSheet`: modal with subject/topic options and clear actions
- `NoteReaderModal`: modal renderer for a single note (markdown), plus actions (copy, Ask Guru from note)

## Small UX Cleanups (Allowed)
- Fix incorrect react-native import formatting present today (e.g. `Platform, Pressable }`).
- Replace generic “Filters on” pill with actual active filter summary (e.g. `Subject • Topic`).
- Disable action chips/buttons during long-running batch operations (relabel/delete junk/dupes) and display progress text more clearly.
- Ensure sort/filter popovers close predictably when opening the reader or navigating to chat.

## Data Flow (High Level)
1. `useNotesVaultData` loads notes from DB and provides `notes`.
2. `useVaultList` owns the view model: search/sort/filter/selection and yields `visibleNotes`.
3. `useNotesVaultDiagnostics(notes, visibleNotes)` computes diagnostics and counts for UI and actions.
4. Actions (`useNotesVaultActions`, `useNotesVaultRelabel`) update DB then call `reload()` and/or update `notes` state.
5. “Ask Guru” navigation uses grounding builders (kept as pure helpers in the feature folder).

## Testing & Verification
- Keep existing unit/snapshot tests passing.
- Run:
  - `npm run lint`
  - `npm run test:unit:coverage:logic`
  - `npm run verify:ci`

## Rollout / Risk Controls
- Prefer a re-export shim at the old path until navigation references are fully updated.
- Keep extraction mechanical: move logic into hooks/components without changing behavior first, then apply the small UX cleanups.

