# Guru AI — UX/UI Audit

## CRITICAL (app-breaking)

| #   | Screen              | Issue                                                       | Status                                               |
| --- | ------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| 1   | `SessionScreen`     | Planning failure has no Retry — user stuck in error state   | ✅ Pre-existing retry button confirmed               |
| 2   | `SessionScreen`     | If agenda item is null → black screen, no escape            | ✅ Fixed — error screen + Back to Home               |
| 3   | `TopicDetailScreen` | Typed notes lost on back navigation (no discard warning)    | ✅ Fixed — discard confirmation on Cancel + collapse |
| 4   | `LectureModeScreen` | Proof-of-life fails with no pre-warning — just sudden alert | ✅ Fixed — 30s warning banner before trigger         |
| 5   | `GuruChatScreen`    | Switching AI model mid-conversation silently breaks context | ✅ Fixed — Alert to confirm switch                   |

## HIGH

| #   | Screen                    | Issue                                                                  | Status                                          |
| --- | ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| 6   | `SessionScreen`           | Pause overlay is fully opaque — user can't see what they were studying | ✅ Fixed — 0.55 alpha opacity                   |
| 7   | `LectureModeScreen`       | No visible indicator recording is actually happening                   | ✅ Fixed — red dot + "Recording" label          |
| 8   | `ReviewScreen`            | Content type chips tappable while loading → fires multiple requests    | ✅ Fixed — disabled + 0.4 opacity while loading |
| 9   | `TranscriptHistoryScreen` | Long-press selection mode with no visual announcement                  | ✅ Fixed — top banner on selection              |
| 10  | `SettingsScreen`          | No way to test if API key works before saving                          | ⬜ Pending                                      |
| 11  | `StudyPlanScreen`         | Empty missed topics section shows blank card                           | ✅ Already had empty state                      |
| 12  | `NotesHubScreen`          | Pending failed sessions list has no max-height                         | ✅ Fixed — capped at 220px with scroll          |

## MEDIUM

| #   | Screen                     | Issue                                                 | Status                                          |
| --- | -------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| 13  | `ManualNoteCreationScreen` | No hint what format to paste                          | ⬜ Pending                                      |
| 14  | `SessionScreen`            | No progress indicator ("3/7 cards") on tab row        | ✅ Fixed — X/N counter added                    |
| 15  | `TranscriptHistoryScreen`  | Detail modal content gets cut off on long transcripts | ⬜ Pending                                      |
| 16  | `NotesHubScreen`           | Retry button shows no transcription stage             | ⬜ Pending                                      |
| 17  | `CheckInScreen`            | Mood buttons have no selected state styling           | ✅ Fixed — highlight on tap                     |
| 18  | `ReviewScreen`             | Swipe-to-skip not discoverable                        | ✅ Already has "Tap to flip" hint on front card |

## LOW

| #   | Screen              | Issue                                                   | Status                     |
| --- | ------------------- | ------------------------------------------------------- | -------------------------- |
| 19  | `SessionScreen`     | No separator before destructive "End Session" menu item | ✅ Already has menuDivider |
| 20  | `SessionScreen`     | XP pop at fixed position can cover quiz answers         | ⬜ Pending                 |
| 21  | `SyllabusScreen`    | Sync button is emoji-only (🔄) — unclear action         | ⬜ Pending                 |
| 22  | `TopicDetailScreen` | Confidence dots use color only — not accessible         | ⬜ Pending                 |
| 23  | `StatsScreen`       | "Projected Score" shown with no explanation             | ⬜ Pending                 |
| 24  | `LectureModeScreen` | Timer font size hardcoded (64)                          | ⬜ Pending                 |
| 25  | `GuruChatScreen`    | Starter chip grid has inconsistent heights              | ⬜ Pending                 |
| 26  | `ReviewScreen`      | No "tap to flip" hint on first load                     | ✅ Already has hint        |
| 27  | `CheckInScreen`     | No visual feedback when mood is selected                | ✅ Fixed                   |
| 28  | `HomeScreen`        | "See full plan" link not visually distinct              | ⬜ Pending                 |
