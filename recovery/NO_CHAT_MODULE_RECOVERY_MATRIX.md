# No-Chat Module Recovery Matrix

This matrix intentionally avoids Trae chat transcripts. It is built from Git artifacts only: commits, stashes, rescue/recovery branches, dangling commits/trees, and (optionally) editor/Trae snapshots.

## Evidence Anchors

- Base branch (pre-reconstruction): `recovery/inventory-base` @ `027bd15`
- Reconstruction branch: `recovery/reconstruction`
- Safety stashes (timestamps): see [RECOVERY_STATUS.md](file:///Users/vishnugnair/Guru-3/recovery/RECOVERY_STATUS.md#L12-L18)
- Key rescue branches:
  - `rescue/stash5-49d89a6` (commit `fd32641`) — snapshot of the latest safety stash (15:47)
  - `rescue/stash4-4aaf10e` (commit `9481cb0`) — large WIP snapshot (13:33)
  - `rescue/stash1-61fca63` (commit `38550b4`) — WIP snapshot (14:11)
  - Dangling pins: `rescue/dangling-*` (see [RECOVERY_STATUS.md](file:///Users/vishnugnair/Guru-3/recovery/RECOVERY_STATUS.md#L23-L30))

## Status Legend

- SAFE_ALREADY_COMMITTED
- RECOVERABLE_FROM_BRANCH
- RECOVERABLE_FROM_STASH
- RECOVERABLE_FROM_DANGLING_TREE
- NEEDS_TRAE_SNAPSHOT
- NEEDS_MANUAL_CHAT_COPY

## Module Matrix

| # | Module label | Status | Primary artifact(s) | Evidence |
|---:|---|---|---|---|
| 1 | expo-av to expo-audio migration | RECOVERABLE_FROM_BRANCH | `rescue/stash5-49d89a6` + reconstructed commits | Term scan shows `expo-av`/`expo-audio` hits in recovery work; reconstruction includes audio changes (see [RECONSTRUCTION_SUMMARY.md](file:///Users/vishnugnair/Guru-3/recovery/RECONSTRUCTION_SUMMARY.md#L10-L18)). |
| 2 | SQLite-vec semantic search | RECOVERABLE_FROM_BRANCH | `rescue/stash5-49d89a6` + `recover(db)` commit(s) | Term scan hits for `sqlite-vec`/`vec0` and DB work landed on `recovery/reconstruction` (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L26-L37)). |
| 3 | Jina AI embedding implementation | SAFE_ALREADY_COMMITTED | `debug-4` history | `feat(db): add embedding_provider…` (`e0c529c`) + `feat(ai): add Jina embedding…` (`58902fe`) on `debug-4` (see [RECOVERY_STATUS.md](file:///Users/vishnugnair/Guru-3/recovery/RECOVERY_STATUS.md#L44-L51) and [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L38-L63)). |
| 4 | Model/provider UI improvements | RECOVERABLE_FROM_BRANCH | `rescue/stash5-49d89a6` + reconstructed commits | Applied on `recovery/reconstruction` via `recover(settings)` commits (see [RECONSTRUCTION_SUMMARY.md](file:///Users/vishnugnair/Guru-3/recovery/RECONSTRUCTION_SUMMARY.md#L10-L14)). |
| 5 | App transparency fixes | SAFE_ALREADY_COMMITTED | `debug-4` history | Term scan hits older commits containing “transparency”; example `5c1b189` is reachable from `debug-4` (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L78-L86)). |
| 6 | Header size standardization | SAFE_ALREADY_COMMITTED | `debug-4` history | Term scan hits header-related commits; example `5614e6b` is reachable from `debug-4` (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L87-L105)). |
| 7 | Codebase monolith refactors | SAFE_ALREADY_COMMITTED | `debug-4` history | Term scan shows monolith refactor commits (`3e58563`, `106c4e2`, etc.) (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L106-L127)). |
| 8 | FlashList v2 migration | RECOVERABLE_FROM_STASH | `rescue/stash4-4aaf10e` | Term scan hits `FlashList`/`flash-list`; stash4 snapshot is the most likely source (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L128-L152)). |
| 9 | expo-sqlite/kv-store migration | RECOVERABLE_FROM_STASH | `rescue/stash4-4aaf10e` | Term scan hits `mmkv` and stash4 is known to contain `src/store/mmkv.ts` (from prior stash4 snapshot); treat stash4 as primary recovery source (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L153-L171)). |
| 10 | Logging service improvements | SAFE_ALREADY_COMMITTED | `debug-4` history | Logging design + logger + sinks are committed on `debug-4` (see [RECOVERY_STATUS.md](file:///Users/vishnugnair/Guru-3/recovery/RECOVERY_STATUS.md#L84-L87)). |
| 11 | Android edge-to-edge fixes | SAFE_ALREADY_COMMITTED | `debug-4` history | Term scan hits edge-to-edge work in existing commits; example `1444c93` is reachable from `debug-4` (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L172-L182)). |
| 12 | useDeferredValue search optimization | RECOVERABLE_FROM_STASH | `rescue/stash1-61fca63` | `useDeferredValue` appears in `src/screens/TranscriptHistoryScreen.tsx` on `rescue/stash1-61fca63` (see [grep output](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L183-L185)). |
| 13 | TouchableOpacity migration | RECOVERABLE_FROM_STASH | `rescue/stash4-4aaf10e` | Term scan + stash4 contains navigation/UI bulk changes; this needs careful, file-by-file restore to avoid noise from `.bak/.tmp` artifacts (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L186-L197)). |
| 14 | JS bottom tabs fix | RECOVERABLE_FROM_STASH | `rescue/stash4-4aaf10e` | stash4 changes include [CustomTabBar.tsx](file:///Users/vishnugnair/Guru-3/src/navigation/CustomTabBar.tsx) and related tab files (diff name-only evidence recorded during forensics). |
| 15 | Falsy rendering crash fixes | RECOVERABLE_FROM_STASH | `rescue/stash4-4aaf10e` | `falsy` appears in stash4’s `LinearText.tsx` compatibility work and related tests (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L210-L216)). |
| 16 | npm audit/test/CI fixes | RECOVERABLE_FROM_STASH | `rescue/stash2-040266c` (and older commits) | Term scan hits `verify:ci` and points at `rescue/stash2-040266c` as a likely uncommitted CI/tooling source (see [git-term-scan.txt](file:///Users/vishnugnair/Guru-3/recovery/no-chat-matrix/git-term-scan.txt#L221-L232)). |

## Next Recovery Actions (No Chats)

1. Promote module 12/8/9/13/14/15/16 from stashes into `recovery/reconstruction` one module at a time (file-by-file) with diff review.
2. Prefer `rescue/stash4-4aaf10e` for large UI/navigation migrations; it contains many changes but needs filtering to avoid `.bak/.tmp` clutter.
3. Only if a module cannot be found in any stash/rescue branch/dangling tree: attempt Trae/editor snapshots; only then request manual chat copy for that specific module.
