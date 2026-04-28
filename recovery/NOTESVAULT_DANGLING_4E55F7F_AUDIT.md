# NotesVault Audit — rescue/dangling-4e55f7f

Base branch: recovery/reconstruction
Compare ref: rescue/dangling-4e55f7f (4e55f7f)
Generated: Tue Apr 28 16:49:05 IST 2026

| File | In reconstruction? | In rescue/dangling-4e55f7f? | Diff? | Restore? | Reason |
|---|:---:|:---:|:---:|:---:|---|
| src/screens/vaults/notes/types.ts | yes | yes | no | no | identical |
| src/screens/vaults/notes/utils.ts | yes | yes | no | no | identical |
| src/screens/vaults/notes/styles.ts | yes | yes | no | no | identical |
| src/screens/vaults/notes/hooks/useNotesVaultActions.ts | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/hooks/useNotesVaultData.ts | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/components/NoteReaderModal.tsx | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/components/NotesVaultFilterSheet.tsx | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/components/NotesVaultSelectionBanner.tsx | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/components/NotesVaultSummaryCard.tsx | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/components/NotesVaultToolbar.tsx | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/vaults/notes/NotesVaultScreen.tsx | yes | yes | yes | no | dangling version is a minified one-liner stub; reconstruction already has the same stub (formatting-only diff) |
| src/screens/NotesVaultScreen.tsx | yes | yes | yes | no | dangling version appears older/partial (it removes the `renderNote` implementation), would overwrite newer behavior |

## Notes
- This dangling ref contains the NotesVault feature-folder scaffold but not the decomposed implementation; most diffs are formatting-only stubs.
- The legacy screen diff is negative-value (removes `renderNote`), so it was not restored.
