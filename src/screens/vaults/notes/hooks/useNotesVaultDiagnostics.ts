export function useNotesVaultDiagnostics() {
  return {
    junkNotes: [],
    duplicateIds: new Set(),
    unlabeledNotes: [],
    badTitleNotes: [],
    taggedNotesCount: 0,
    wordCountMap: new Map(),
  };
}
