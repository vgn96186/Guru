# Remaining Restore Audit

Branch: recovery/reconstruction
HEAD: fcef8b6
Generated: Tue Apr 28 18:29:51 IST 2026

## Stashes
stash@{2026-04-28 18:16:16 +0530}: On recovery/reconstruction: SAFETY leftover after NotesVault/Settings attempt
stash@{2026-04-28 18:11:10 +0530}: On recovery/reconstruction: SAFETY before cherry-pick notesvault/settings (2)
stash@{2026-04-28 17:31:20 +0530}: On recovery/reconstruction: SAFETY before NotesVault/Settings restore
stash@{2026-04-28 15:47:19 +0530}: On debug-4: SAFETY current uncommitted before recovery commander
stash@{2026-04-28 14:12:00 +0530}: On debug-4: SAFETY leftover after first stash
stash@{2026-04-28 14:11:39 +0530}: On debug-4: SAFETY before recovery 2026-04-28T14:11:39+0530
stash@{2026-04-28 13:54:07 +0530}: On debug-4: wip unrelated changes (embedding/notes/etc)
stash@{2026-04-28 13:34:15 +0530}: On debug-4: wip extra mocks
stash@{2026-04-28 13:33:31 +0530}: On debug-4: wip before unified logging task4

## Priority Refs Overview
- rescue/dangling-4e55f7f: 4e55f7f
- rescue/stash4-4aaf10e: 9481cb0
- rescue/stash2-040266c: b176d13
- rescue/stash1-61fca63: 38550b4
- rescue/dangling-dd7f636: dd7f636
- rescue/dangling-dff0790: dff0790

---
## Diff vs rescue/dangling-4e55f7f

**Changed files count**: 83

**Top diffstat**
 __mocks__/expo-audio.js                            |    8 -
 jest.unit.config.js                                |    1 -
 recovery/NOTESVAULT_DANGLING_4E55F7F_AUDIT.md      |   26 -
 recovery/NO_CHAT_MODULE_RECOVERY_MATRIX.md         |   50 -
 recovery/RECONSTRUCTION_SUMMARY.md                 |   40 -
 recovery/TYPECHECK_BLOCKERS_AUDIT.md               |   44 -
 recovery/module_labels.txt                         |   16 -
 recovery/no-chat-matrix/git-term-scan.txt          |  233 ---
 src/components/AudioPlayer.tsx                     |   86 +-
 src/components/AudioPlayer.unit.test.tsx           |   11 -
 src/components/FocusAudioPlayer.tsx                |   59 +-
 src/db/database.ts                                 |  103 +-
 src/db/drizzle-migrations/meta/_journal.json       |    7 -
 src/db/queries/aiCache.ts                          |   70 +-
 src/db/testing/createTestDatabase.ts               |    8 -
 src/db/testing/drizzleSchemaParity.unit.test.ts    |    2 -
 src/hooks/useLectureReturnRecovery.ts              |   34 +-
 src/hooks/useLectureReturnRecovery.unit.test.ts    |   32 +-
 src/screens/NotesHubScreen.tsx                     |   37 +-
 src/screens/NotesVaultScreen.tsx                   |   27 +-
 src/screens/QuestionBankScreen.tsx                 |    8 +-
 src/screens/SettingsScreen.tsx                     | 1637 +++++++++++++++++++-
 src/screens/SleepModeScreen.tsx                    |   12 +
 src/screens/SyllabusScreen.tsx                     |   15 +-
 src/screens/TranscriptHistoryScreen.tsx            |   12 +-
 src/screens/lectureMode/hooks/useLectureAudio.ts   |  100 +-
 .../settings/components/ProviderOrderEditor.tsx    |  119 +-
 .../settings/components/SettingsModelDropdown.tsx  |   40 +-
 .../settings/components/SettingsPermissionRow.tsx  |   14 +-
 .../settings/components/SettingsScreenShell.tsx    |   91 +-
 .../components/SettingsSectionAccordion.tsx        |   12 +-
 .../settings/hooks/useProviderApiKeyTests.ts       |   19 +
 .../settings/hooks/useSettingsController.ts        | 1550 ------------------
 .../settings/hooks/useSettingsPermissions.ts       |    6 +-
 .../settings/sections/AdvancedSettingsSection.tsx  |   10 +-
 .../settings/sections/AppIntegrationsSection.tsx   |   29 +-
 .../settings/sections/DashboardOverview.tsx        |   25 +-
 .../settings/sections/InterventionsSection.tsx     |   67 +-
 .../settings/sections/PlanningAlertsSection.tsx    |  121 +-
 src/screens/settings/sections/ProfileSection.tsx   |    7 +-

**By area (paths)**
- NotesVault (vaults/notes + NotesVaultScreen): 11
- Settings (SettingsScreen + screens/settings): 29
- AI services: 2
- DB: 5
- Navigation: 0
- Transcription: 2

**High-signal file list (filtered)**
src/components/AudioPlayer.tsx
src/components/AudioPlayer.unit.test.tsx
src/components/FocusAudioPlayer.tsx
src/db/database.ts
src/db/drizzle-migrations/meta/_journal.json
src/db/queries/aiCache.ts
src/db/testing/createTestDatabase.ts
src/db/testing/drizzleSchemaParity.unit.test.ts
src/hooks/useLectureReturnRecovery.ts
src/hooks/useLectureReturnRecovery.unit.test.ts
src/screens/NotesHubScreen.tsx
src/screens/NotesVaultScreen.tsx
src/screens/QuestionBankScreen.tsx
src/screens/SettingsScreen.tsx
src/screens/SleepModeScreen.tsx
src/screens/SyllabusScreen.tsx
src/screens/TranscriptHistoryScreen.tsx
src/screens/lectureMode/hooks/useLectureAudio.ts
src/screens/settings/components/ProviderOrderEditor.tsx
src/screens/settings/components/SettingsModelDropdown.tsx
src/screens/settings/components/SettingsPermissionRow.tsx
src/screens/settings/components/SettingsScreenShell.tsx
src/screens/settings/components/SettingsSectionAccordion.tsx
src/screens/settings/hooks/useProviderApiKeyTests.ts
src/screens/settings/hooks/useSettingsController.ts
src/screens/settings/hooks/useSettingsPermissions.ts
src/screens/settings/sections/AdvancedSettingsSection.tsx
src/screens/settings/sections/AppIntegrationsSection.tsx
src/screens/settings/sections/DashboardOverview.tsx
src/screens/settings/sections/InterventionsSection.tsx
src/screens/settings/sections/PlanningAlertsSection.tsx
src/screens/settings/sections/ProfileSection.tsx
src/screens/settings/sections/StorageSections.tsx
src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx
src/screens/settings/sections/ai-providers/components/CloudflareKeyRow.tsx
src/screens/settings/sections/ai-providers/components/LocalAiCard.tsx
src/screens/settings/sections/ai-providers/components/OAuthCard.tsx
src/screens/settings/sections/ai-providers/components/VertexKeyRow.tsx
src/screens/settings/sections/ai-providers/index.tsx
src/screens/settings/sections/ai-providers/subsections/ApiKeysSection.tsx
src/screens/settings/sections/ai-providers/subsections/ChatModelSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabDuoSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabPasteModal.tsx
src/screens/settings/sections/ai-providers/subsections/LocalAiSection.tsx
src/screens/settings/sections/ai-providers/types.ts
src/screens/settings/types.ts
src/screens/vaults/notes/NotesVaultScreen.tsx
src/screens/vaults/notes/components/NoteReaderModal.tsx
src/screens/vaults/notes/components/NotesVaultFilterSheet.tsx
src/screens/vaults/notes/components/NotesVaultSelectionBanner.tsx
src/screens/vaults/notes/components/NotesVaultSummaryCard.tsx
src/screens/vaults/notes/components/NotesVaultToolbar.tsx
src/screens/vaults/notes/hooks/useNotesVaultActions.ts
src/screens/vaults/notes/hooks/useNotesVaultData.ts
src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts
src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts
src/services/ai/embeddingService.unit.test.ts
src/services/ai/liveModelCatalog.ts
src/services/appLauncher/overlayStartupPrompt.unit.test.ts
src/services/appLauncher/storageStartupPrompt.ts
src/services/appLauncher/storageStartupPrompt.unit.test.ts
src/services/appPermissions.ts
src/services/appPermissions.unit.test.ts
src/services/examDateSyncService.ts
src/services/loggingService.ts
src/services/notificationService.ts
src/services/offlineTranscription/audioRecorder.ts
src/services/transcription/matching.ts
src/services/transcription/matching.unit.test.ts
src/services/webSearch/__tests__/orchestrator.test.ts
src/services/webSearch/providers/brave.ts
src/services/webSearch/providers/deepseekWeb.ts
src/services/webSearch/providers/duckduckgo.ts
src/store/splitSessionStorage.ts
src/store/splitSessionStorage.unit.test.ts

---
## Diff vs rescue/stash4-4aaf10e

**Changed files count**: 271

**Top diffstat**
 App.tsx                                            |    10 +-
 __mocks__/expo-audio.js                            |     8 -
 __mocks__/react-native-blob-util.js                |     0
 __mocks__/react-native-mmkv.js                     |    18 +
 __mocks__/react-native-pdf.js                      |     0
 __mocks__/react-native-vector-icons-ionicons.js    |     7 +
 __mocks__/react-native-view-shot.js                |     3 +
 __mocks__/shopify-flash-list.js                    |     2 +-
 __mocks__/sonner-native.js                         |    17 +
 __mocks__/zeego-dropdown-menu.js                   |     0
 babel-debug.log                                    |   595 +
 codemod_flatlist.js                                |    92 +
 codemod_jsx_condition.js                           |    30 +
 extract_canvas_hook.js                             |   194 +
 extract_edge_render.js                             |    95 +
 extract_transcript_hook.js                         |   186 +
 extract_transcript_item.js                         |   202 +
 fix.sh                                             |     3 +
 fix_duplicate_pressable.py                         |    28 +
 fix_duplicate_pressable_10.py                      |    26 +
 fix_duplicate_pressable_11.py                      |    26 +
 fix_duplicate_pressable_3.py                       |    20 +
 fix_duplicate_pressable_4.py                       |    21 +
 fix_duplicate_pressable_5.py                       |    29 +
 fix_duplicate_pressable_6.py                       |    27 +
 fix_duplicate_pressable_7.py                       |    27 +
 fix_duplicate_pressable_8.py                       |    26 +
 fix_duplicate_pressable_9.js                       |    18 +
 fix_flashlist.py                                   |    36 +
 fix_syntax.py                                      |    18 +
 fix_syntax.sh                                      |     3 +
 fix_syntax_2.py                                    |    32 +
 fix_syntax_3.py                                    |    20 +
 flatlist.log                                       |    10 +
 jest.unit.config.js                                |    11 +-
 jest.unit.logic.config.js                          |     4 +-
 metro-dev.err.log                                  |    17 +
 metro-dev.log                                      | 19829 +++++++++++++++++++
 .../applauncher/views/BootTransitionView.kt        |    16 +-
 .../modules/applauncher/views/LoadingOrbView.kt    |    14 +-

**By area (paths)**
- NotesVault (vaults/notes + NotesVaultScreen): 14
- Settings (SettingsScreen + screens/settings): 2
- AI services: 5
- DB: 9
- Navigation: 4
- Transcription: 2

**High-signal file list (filtered)**
modules/app-launcher/android/src/main/java/expo/modules/applauncher/views/BootTransitionView.kt
modules/app-launcher/android/src/main/java/expo/modules/applauncher/views/LoadingOrbView.kt
src/components/AppRecoveryScreen.tsx
src/components/AudioPlayer.tsx
src/components/AudioPlayer.unit.test.tsx
src/components/BannerSearchBar.tsx
src/components/BootTransition.tsx
src/components/BrainDumpFab.tsx
src/components/BrainDumpFab.unit.test.tsx
src/components/ConfidenceSelector.tsx
src/components/ContentFlagButton.tsx
src/components/DevConsole.tsx
src/components/DialogHost.tsx
src/components/FocusAudioPlayer.tsx
src/components/GuruChatOverlay.tsx
src/components/ImageLightbox.tsx
src/components/LectureReturnSheet.tsx
src/components/LectureReturnSheet.unit.test.tsx
src/components/LoadingOrb.tsx
src/components/LoadingOverlay.tsx
src/components/ResilientImage.tsx
src/components/ReviewCalendar.tsx
src/components/ReviewCalendar.unit.test.tsx
src/components/ScreenHeader.tsx
src/components/SharedOrbShell.tsx
src/components/StartButton.tsx
src/components/SubjectCard.tsx
src/components/SubjectSelectionCard.tsx
src/components/Toast.tsx
src/components/Toast.unit.test.tsx
src/components/TranscriptionSettingsPanel.tsx
src/components/TurbulentOrb.tsx
src/components/chat/ChatBubble.tsx
src/components/chat/ChatImagePreview.tsx
src/components/chat/GuruChatMessageItem.tsx
src/components/chat/GuruChatModelSelector.tsx
src/components/home/AgendaItem.tsx
src/components/home/AiStatusIndicator.tsx
src/components/home/CompactQuickStatsBar.tsx
src/components/home/DailyAgendaSection.tsx
src/components/home/ExamCountdownChips.tsx
src/components/home/ShortcutTile.tsx
src/components/home/TodayPlanCard.tsx
src/components/lectureReturn/LectureReturnActionButtons.tsx
src/components/lectureReturn/LectureReturnCompactBubble.tsx
src/components/lectureReturn/LectureReturnConfidenceSelector.tsx
src/components/lectureReturn/LectureReturnTopicRow.tsx
src/components/primitives/AppBottomSheet.tsx
src/components/primitives/Icon.tsx
src/components/primitives/LinearButton.tsx
src/components/primitives/LinearChipButton.tsx
src/components/primitives/LinearIconButton.tsx
src/components/primitives/LinearTextInput.tsx
src/components/settings/PermissionRow.tsx
src/components/settings/ProfileSection.tsx
src/components/settings/SettingsActionButton.tsx
src/components/settings/SettingsSidebar.tsx
src/components/settings/SidebarNavItem.tsx
src/components/sheets/SamsungBatterySheet.tsx
src/config/appConfig.ts
src/db/database.ts
src/db/drizzle-migrations/0003_embedding_provider.sql
src/db/drizzle-migrations/meta/_journal.json
src/db/drizzle-migrations/migrations.js
src/db/drizzleSchema.ts
src/db/queries/aiCache.ts
src/db/testing/createTestDatabase.ts
src/db/testing/drizzleSchemaParity.unit.test.ts
src/db/utils/drizzleProfileMapper.ts
src/hooks/useButtonFeedback.ts
src/hooks/useGuruChatModels.ts
src/hooks/useLectureReturnRecovery.ts
src/hooks/useLectureReturnRecovery.unit.test.ts
src/hooks/useScrollRestoration.ts
src/navigation/CustomTabBar.tsx
src/navigation/tabNavigatorOptions.ts
src/navigation/tabStacks.tsx
src/navigation/types.ts
src/screens/BedLockScreen.tsx
src/screens/BossBattleScreen.tsx
src/screens/BrainDumpReviewScreen.tsx
src/screens/BreakEnforcerScreen.tsx
src/screens/BreakScreen.tsx
src/screens/CheckInScreen.tsx
src/screens/ContentCard/cards/DetectiveCard.tsx
src/screens/ContentCard/cards/ErrorHuntCard.tsx
src/screens/ContentCard/cards/FlashcardCard.tsx
src/screens/ContentCard/cards/KeyPointsCard.tsx
src/screens/ContentCard/cards/ManualReviewCard.tsx
src/screens/ContentCard/cards/MnemonicCard.tsx
src/screens/ContentCard/cards/MustKnowCard.tsx
src/screens/ContentCard/cards/QuizCard.tsx
src/screens/ContentCard/cards/SocraticCard.tsx
src/screens/ContentCard/cards/StoryCard.tsx
src/screens/ContentCard/cards/TeachBackCard.tsx
src/screens/ContentCard/index.tsx
src/screens/ContentCard/shared/ConceptChip.tsx
src/screens/ContentCard/shared/ConfidenceRating.tsx
src/screens/ContentCard/shared/DeepExplanationBlock.tsx
src/screens/ContentCard/shared/ExplainablePoint.tsx
src/screens/ContentCard/shared/QuestionImage.tsx
src/screens/ContentCard/shared/QuizOptionBtn.tsx
src/screens/ContentCard/shared/TopicImage.tsx
src/screens/DailyChallengeScreen.tsx
src/screens/DeviceLinkScreen.tsx
src/screens/DoomscrollGuideScreen.tsx
src/screens/DoomscrollInterceptor.tsx
src/screens/FlaggedContentScreen.tsx
src/screens/FlaggedReviewScreen.tsx
src/screens/FlashcardsScreen.tsx
src/screens/GlobalTopicSearchScreen.tsx
src/screens/HomeScreen.tsx
src/screens/ImageVaultScreen.tsx
src/screens/InertiaScreen.tsx
src/screens/LectureModeScreen.tsx
src/screens/LocalModelScreen.tsx
src/screens/LockdownScreen.tsx
src/screens/ManualLogScreen.tsx
src/screens/ManualNoteCreationScreen.tsx
src/screens/MindMapScreen.tsx

---
## Diff vs rescue/stash2-040266c

**Changed files count**: 99

**Top diffstat**
 App.tsx                                            |   13 +-
 __mocks__/expo-audio.js                            |    8 -
 __mocks__/react-native-mmkv.js                     |    8 +
 app.json                                           |    2 +-
 babel-debug.log                                    |   20 +
 .../plans/2026-04-28-embedding-provider-plan.md    |  426 +++++
 .../plans/2026-04-28-logging-service-plan.md       |   10 +-
 .../plans/2026-04-28-notes-vault-refactor-plan.md  |  454 ++++++
 .../specs/2026-04-28-embedding-provider-design.md  |   42 +
 .../2026-04-28-notes-vault-refactor-design.md      |  116 ++
 jest.unit.config.js                                |    1 -
 recovery/NOTESVAULT_DANGLING_4E55F7F_AUDIT.md      |   26 -
 recovery/NO_CHAT_MODULE_RECOVERY_MATRIX.md         |   50 -
 recovery/RECONSTRUCTION_SUMMARY.md                 |   40 -
 recovery/TYPECHECK_BLOCKERS_AUDIT.md               |   44 -
 recovery/module_labels.txt                         |   16 -
 recovery/no-chat-matrix/git-term-scan.txt          |  233 ---
 src/components/AudioPlayer.tsx                     |   86 +-
 src/components/AudioPlayer.unit.test.tsx           |   11 -
 src/components/DevConsole.tsx                      |   85 +-
 src/components/FocusAudioPlayer.tsx                |   59 +-
 src/components/ScreenShell.tsx                     |    2 +-
 src/db/database.ts                                 |  103 +-
 src/db/drizzle-migrations/meta/_journal.json       |    7 -
 src/db/queries/aiCache.ts                          |   70 +-
 src/db/testing/createTestDatabase.ts               |    8 -
 src/db/testing/drizzleSchemaParity.unit.test.ts    |    2 -
 src/hooks/useLectureReturnRecovery.ts              |   34 +-
 src/hooks/useLectureReturnRecovery.unit.test.ts    |   32 +-
 src/hooks/useScrollRestoration.ts                  |    2 +-
 src/screens/NotesHubScreen.tsx                     |   37 +-
 src/screens/NotesVaultScreen.tsx                   |    7 +-
 src/screens/RecordingVaultScreen.tsx               |    2 +-
 src/screens/ReviewScreen.tsx                       |    2 +-
 src/screens/SettingsScreen.tsx                     | 1629 +++++++++++++++++++-
 src/screens/SleepModeScreen.tsx                    |   12 +
 src/screens/lectureMode/hooks/useLectureAudio.ts   |  100 +-
 .../lectureMode/hooks/useLectureModeController.ts  |    2 +-
 .../settings/components/ProviderOrderEditor.tsx    |  119 +-
 .../settings/components/SettingsModelDropdown.tsx  |   40 +-

**By area (paths)**
- NotesVault (vaults/notes + NotesVaultScreen): 11
- Settings (SettingsScreen + screens/settings): 29
- AI services: 2
- DB: 5
- Navigation: 0
- Transcription: 2

**High-signal file list (filtered)**
src/components/AudioPlayer.tsx
src/components/AudioPlayer.unit.test.tsx
src/components/DevConsole.tsx
src/components/FocusAudioPlayer.tsx
src/components/ScreenShell.tsx
src/db/database.ts
src/db/drizzle-migrations/meta/_journal.json
src/db/queries/aiCache.ts
src/db/testing/createTestDatabase.ts
src/db/testing/drizzleSchemaParity.unit.test.ts
src/hooks/useLectureReturnRecovery.ts
src/hooks/useLectureReturnRecovery.unit.test.ts
src/hooks/useScrollRestoration.ts
src/screens/NotesHubScreen.tsx
src/screens/NotesVaultScreen.tsx
src/screens/RecordingVaultScreen.tsx
src/screens/ReviewScreen.tsx
src/screens/SettingsScreen.tsx
src/screens/SleepModeScreen.tsx
src/screens/lectureMode/hooks/useLectureAudio.ts
src/screens/lectureMode/hooks/useLectureModeController.ts
src/screens/settings/components/ProviderOrderEditor.tsx
src/screens/settings/components/SettingsModelDropdown.tsx
src/screens/settings/components/SettingsPermissionRow.tsx
src/screens/settings/components/SettingsScreenShell.tsx
src/screens/settings/components/SettingsSectionAccordion.tsx
src/screens/settings/hooks/useSettingsController.ts
src/screens/settings/hooks/useSettingsPermissions.ts
src/screens/settings/sections/AdvancedSettingsSection.tsx
src/screens/settings/sections/AppIntegrationsSection.tsx
src/screens/settings/sections/DashboardOverview.tsx
src/screens/settings/sections/InterventionsSection.tsx
src/screens/settings/sections/PlanningAlertsSection.tsx
src/screens/settings/sections/ProfileSection.tsx
src/screens/settings/sections/StorageSections.tsx
src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx
src/screens/settings/sections/ai-providers/components/CloudflareKeyRow.tsx
src/screens/settings/sections/ai-providers/components/LocalAiCard.tsx
src/screens/settings/sections/ai-providers/components/OAuthCard.tsx
src/screens/settings/sections/ai-providers/components/VertexKeyRow.tsx
src/screens/settings/sections/ai-providers/index.tsx
src/screens/settings/sections/ai-providers/subsections/ApiKeysSection.tsx
src/screens/settings/sections/ai-providers/subsections/ChatModelSection.tsx
src/screens/settings/sections/ai-providers/subsections/EmbeddingModelSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabDuoSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabPasteModal.tsx
src/screens/settings/sections/ai-providers/subsections/LocalAiSection.tsx
src/screens/settings/sections/ai-providers/types.ts
src/screens/settings/types.ts
src/screens/vaults/notes/NotesVaultScreen.tsx
src/screens/vaults/notes/components/NoteReaderModal.tsx
src/screens/vaults/notes/components/NotesVaultFilterSheet.tsx
src/screens/vaults/notes/components/NotesVaultSelectionBanner.tsx
src/screens/vaults/notes/components/NotesVaultSummaryCard.tsx
src/screens/vaults/notes/components/NotesVaultToolbar.tsx
src/screens/vaults/notes/hooks/useNotesVaultActions.ts
src/screens/vaults/notes/hooks/useNotesVaultData.ts
src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts
src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts
src/services/ai/embeddingService.unit.test.ts
src/services/ai/liveModelCatalog.ts
src/services/appLauncher/overlayStartupPrompt.ts
src/services/appLauncher/overlayStartupPrompt.unit.test.ts
src/services/appLauncher/storageStartupPrompt.ts
src/services/appLauncher/storageStartupPrompt.unit.test.ts
src/services/appPermissions.ts
src/services/appPermissions.unit.test.ts
src/services/examDateSyncService.ts
src/services/logger.ts
src/services/logging/setup.ts
src/services/loggingService.ts
src/services/notificationService.ts
src/services/offlineTranscription/audioRecorder.ts
src/services/transcription/matching.ts
src/services/transcription/matching.unit.test.ts
src/services/webSearch/__tests__/orchestrator.test.ts
src/services/webSearch/providers/brave.ts
src/services/webSearch/providers/deepseekWeb.ts
src/services/webSearch/providers/duckduckgo.ts
src/store/splitSessionStorage.ts
src/store/splitSessionStorage.unit.test.ts
src/store/useAppStore.ts

---
## Diff vs rescue/stash1-61fca63

**Changed files count**: 98

**Top diffstat**
 __mocks__/expo-audio.js                            |    8 -
 babel-debug.log                                    |    7 +
 jest.unit.config.js                                |    1 -
 package-lock.json                                  |   26 +-
 package.json                                       |    1 -
 recovery/NOTESVAULT_DANGLING_4E55F7F_AUDIT.md      |   26 -
 recovery/NO_CHAT_MODULE_RECOVERY_MATRIX.md         |   50 -
 recovery/RECONSTRUCTION_SUMMARY.md                 |   40 -
 recovery/TYPECHECK_BLOCKERS_AUDIT.md               |   44 -
 recovery/module_labels.txt                         |   16 -
 recovery/no-chat-matrix/git-term-scan.txt          |  233 ---
 src/components/AudioPlayer.tsx                     |   19 +-
 src/components/AudioPlayer.unit.test.tsx           |   54 +-
 src/components/FocusAudioPlayer.tsx                |   59 +-
 src/db/database.ts                                 |  194 +--
 src/db/drizzle-migrations/meta/_journal.json       |    7 -
 src/db/drizzleSchema.ts                            |   10 +
 src/db/queries/aiCache.ts                          |   70 +-
 src/db/testing/createTestDatabase.ts               |    8 -
 src/db/testing/drizzleSchemaParity.unit.test.ts    |    2 -
 src/hooks/useLectureReturnRecovery.ts              |   34 +-
 src/hooks/useLectureReturnRecovery.unit.test.ts    |   32 +-
 src/hooks/useScrollRestoration.ts                  |    2 +-
 src/screens/ImageVaultScreen.tsx                   |    4 +-
 src/screens/NotesHubScreen.tsx                     |   37 +-
 src/screens/NotesVaultScreen.tsx                   |   44 +-
 src/screens/QuestionBankScreen.tsx                 |    8 +-
 src/screens/RecordingVaultScreen.tsx               |   14 +-
 src/screens/ReviewScreen.tsx                       |    2 +-
 src/screens/SettingsScreen.tsx                     | 1662 +++++++++++++++++++-
 src/screens/SleepModeScreen.tsx                    |   12 +
 src/screens/SyllabusScreen.tsx                     |   15 +-
 src/screens/SyllabusScreen.unit.test.tsx           |   22 +
 src/screens/TranscriptHistoryScreen.tsx            |   12 +-
 src/screens/TranscriptVaultScreen.tsx              |   10 +-
 src/screens/lectureMode/hooks/useLectureAudio.ts   |  100 +-
 .../lectureMode/hooks/useLectureModeController.ts  |    2 +-
 .../settings/components/ProviderOrderEditor.tsx    |  119 +-
 .../settings/components/SettingsModelDropdown.tsx  |   40 +-
 .../settings/components/SettingsPermissionRow.tsx  |   14 +-

**By area (paths)**
- NotesVault (vaults/notes + NotesVaultScreen): 12
- Settings (SettingsScreen + screens/settings): 31
- AI services: 2
- DB: 6
- Navigation: 0
- Transcription: 2

**High-signal file list (filtered)**
src/components/AudioPlayer.tsx
src/components/AudioPlayer.unit.test.tsx
src/components/FocusAudioPlayer.tsx
src/db/database.ts
src/db/drizzle-migrations/meta/_journal.json
src/db/drizzleSchema.ts
src/db/queries/aiCache.ts
src/db/testing/createTestDatabase.ts
src/db/testing/drizzleSchemaParity.unit.test.ts
src/hooks/useLectureReturnRecovery.ts
src/hooks/useLectureReturnRecovery.unit.test.ts
src/hooks/useScrollRestoration.ts
src/screens/ImageVaultScreen.tsx
src/screens/NotesHubScreen.tsx
src/screens/NotesVaultScreen.tsx
src/screens/QuestionBankScreen.tsx
src/screens/RecordingVaultScreen.tsx
src/screens/ReviewScreen.tsx
src/screens/SettingsScreen.tsx
src/screens/SleepModeScreen.tsx
src/screens/SyllabusScreen.tsx
src/screens/SyllabusScreen.unit.test.tsx
src/screens/TranscriptHistoryScreen.tsx
src/screens/TranscriptVaultScreen.tsx
src/screens/lectureMode/hooks/useLectureAudio.ts
src/screens/lectureMode/hooks/useLectureModeController.ts
src/screens/settings/components/ProviderOrderEditor.tsx
src/screens/settings/components/SettingsModelDropdown.tsx
src/screens/settings/components/SettingsPermissionRow.tsx
src/screens/settings/components/SettingsScreenShell.tsx
src/screens/settings/components/SettingsSectionAccordion.tsx
src/screens/settings/hooks/useApiKeyTesting.ts
src/screens/settings/hooks/useProviderApiKeyTests.ts
src/screens/settings/hooks/useSettingsController.ts
src/screens/settings/hooks/useSettingsDerivedStatus.ts
src/screens/settings/hooks/useSettingsPermissions.ts
src/screens/settings/sections/AdvancedSettingsSection.tsx
src/screens/settings/sections/AppIntegrationsSection.tsx
src/screens/settings/sections/DashboardOverview.tsx
src/screens/settings/sections/InterventionsSection.tsx
src/screens/settings/sections/PlanningAlertsSection.tsx
src/screens/settings/sections/ProfileSection.tsx
src/screens/settings/sections/StorageSections.tsx
src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx
src/screens/settings/sections/ai-providers/components/CloudflareKeyRow.tsx
src/screens/settings/sections/ai-providers/components/LocalAiCard.tsx
src/screens/settings/sections/ai-providers/components/OAuthCard.tsx
src/screens/settings/sections/ai-providers/components/VertexKeyRow.tsx
src/screens/settings/sections/ai-providers/index.tsx
src/screens/settings/sections/ai-providers/subsections/ApiKeysSection.tsx
src/screens/settings/sections/ai-providers/subsections/ChatModelSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabDuoSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabPasteModal.tsx
src/screens/settings/sections/ai-providers/subsections/LocalAiSection.tsx
src/screens/settings/sections/ai-providers/types.ts
src/screens/settings/types.ts
src/screens/vaults/notes/NotesVaultScreen.tsx
src/screens/vaults/notes/components/NoteReaderModal.tsx
src/screens/vaults/notes/components/NotesVaultFilterSheet.tsx
src/screens/vaults/notes/components/NotesVaultSelectionBanner.tsx
src/screens/vaults/notes/components/NotesVaultSummaryCard.tsx
src/screens/vaults/notes/components/NotesVaultToolbar.tsx
src/screens/vaults/notes/hooks/useNotesVaultActions.ts
src/screens/vaults/notes/hooks/useNotesVaultData.ts
src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts
src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts
src/screens/vaults/notes/styles.ts
src/services/ai/embeddingService.unit.test.ts
src/services/ai/liveModelCatalog.ts
src/services/appLauncher/overlayStartupPrompt.ts
src/services/appLauncher/overlayStartupPrompt.unit.test.ts
src/services/appLauncher/storageStartupPrompt.ts
src/services/appLauncher/storageStartupPrompt.unit.test.ts
src/services/appPermissions.unit.test.ts
src/services/examDateSyncService.ts
src/services/loggingService.ts
src/services/notificationService.ts
src/services/offlineTranscription/audioRecorder.ts
src/services/transcription/matching.ts
src/services/transcription/matching.unit.test.ts
src/services/webSearch/__tests__/orchestrator.test.ts
src/services/webSearch/providers/brave.ts
src/services/webSearch/providers/deepseekWeb.ts
src/services/webSearch/providers/duckduckgo.ts
src/store/splitSessionStorage.ts
src/store/splitSessionStorage.unit.test.ts

---
## Diff vs rescue/dangling-dd7f636

**Changed files count**: 82

**Top diffstat**
 App.tsx                                            |   13 +-
 __mocks__/expo-audio.js                            |    8 -
 jest.unit.config.js                                |    2 +-
 recovery/NOTESVAULT_DANGLING_4E55F7F_AUDIT.md      |   26 -
 recovery/NO_CHAT_MODULE_RECOVERY_MATRIX.md         |   50 -
 recovery/RECONSTRUCTION_SUMMARY.md                 |   40 -
 recovery/TYPECHECK_BLOCKERS_AUDIT.md               |   44 -
 recovery/module_labels.txt                         |   16 -
 recovery/no-chat-matrix/git-term-scan.txt          |  233 ---
 src/components/AudioPlayer.tsx                     |   86 +-
 src/components/AudioPlayer.unit.test.tsx           |   11 -
 src/components/FocusAudioPlayer.tsx                |   59 +-
 src/config/appConfig.ts                            |    5 +-
 src/db/database.ts                                 |  103 +-
 src/db/drizzle-migrations/meta/_journal.json       |    7 -
 src/db/drizzleSchema.ts                            |    2 -
 src/db/queries/aiCache.ts                          |   70 +-
 src/db/testing/createTestDatabase.ts               |    8 -
 src/db/testing/drizzleSchemaParity.unit.test.ts    |    2 -
 src/hooks/useLectureReturnRecovery.ts              |   34 +-
 src/hooks/useLectureReturnRecovery.unit.test.ts    |   32 +-
 src/screens/NotesHubScreen.tsx                     |   37 +-
 src/screens/SettingsScreen.tsx                     | 1629 +++++++++++++++++++-
 src/screens/SleepModeScreen.tsx                    |   12 +
 src/screens/lectureMode/hooks/useLectureAudio.ts   |  100 +-
 .../settings/components/ProviderOrderEditor.tsx    |  119 +-
 .../settings/components/SettingsModelDropdown.tsx  |   40 +-
 .../settings/components/SettingsPermissionRow.tsx  |   14 +-
 .../settings/components/SettingsScreenShell.tsx    |   91 +-
 .../components/SettingsSectionAccordion.tsx        |   12 +-
 .../settings/hooks/useSettingsController.ts        | 1550 -------------------
 .../settings/hooks/useSettingsPermissions.ts       |    6 +-
 .../settings/sections/AdvancedSettingsSection.tsx  |   10 +-
 .../settings/sections/AppIntegrationsSection.tsx   |   29 +-
 .../settings/sections/DashboardOverview.tsx        |   25 +-
 .../settings/sections/InterventionsSection.tsx     |   67 +-
 .../settings/sections/PlanningAlertsSection.tsx    |  121 +-
 src/screens/settings/sections/ProfileSection.tsx   |    7 +-
 src/screens/settings/sections/StorageSections.tsx  |   99 +-
 .../sections/ai-providers/components/ApiKeyRow.tsx |    7 +-

**By area (paths)**
- NotesVault (vaults/notes + NotesVaultScreen): 13
- Settings (SettingsScreen + screens/settings): 28
- AI services: 2
- DB: 6
- Navigation: 0
- Transcription: 2

**High-signal file list (filtered)**
src/components/AudioPlayer.tsx
src/components/AudioPlayer.unit.test.tsx
src/components/FocusAudioPlayer.tsx
src/config/appConfig.ts
src/db/database.ts
src/db/drizzle-migrations/meta/_journal.json
src/db/drizzleSchema.ts
src/db/queries/aiCache.ts
src/db/testing/createTestDatabase.ts
src/db/testing/drizzleSchemaParity.unit.test.ts
src/hooks/useLectureReturnRecovery.ts
src/hooks/useLectureReturnRecovery.unit.test.ts
src/screens/NotesHubScreen.tsx
src/screens/SettingsScreen.tsx
src/screens/SleepModeScreen.tsx
src/screens/lectureMode/hooks/useLectureAudio.ts
src/screens/settings/components/ProviderOrderEditor.tsx
src/screens/settings/components/SettingsModelDropdown.tsx
src/screens/settings/components/SettingsPermissionRow.tsx
src/screens/settings/components/SettingsScreenShell.tsx
src/screens/settings/components/SettingsSectionAccordion.tsx
src/screens/settings/hooks/useSettingsController.ts
src/screens/settings/hooks/useSettingsPermissions.ts
src/screens/settings/sections/AdvancedSettingsSection.tsx
src/screens/settings/sections/AppIntegrationsSection.tsx
src/screens/settings/sections/DashboardOverview.tsx
src/screens/settings/sections/InterventionsSection.tsx
src/screens/settings/sections/PlanningAlertsSection.tsx
src/screens/settings/sections/ProfileSection.tsx
src/screens/settings/sections/StorageSections.tsx
src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx
src/screens/settings/sections/ai-providers/components/CloudflareKeyRow.tsx
src/screens/settings/sections/ai-providers/components/LocalAiCard.tsx
src/screens/settings/sections/ai-providers/components/OAuthCard.tsx
src/screens/settings/sections/ai-providers/components/VertexKeyRow.tsx
src/screens/settings/sections/ai-providers/index.tsx
src/screens/settings/sections/ai-providers/subsections/ApiKeysSection.tsx
src/screens/settings/sections/ai-providers/subsections/ChatModelSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabDuoSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabPasteModal.tsx
src/screens/settings/sections/ai-providers/subsections/LocalAiSection.tsx
src/screens/settings/sections/ai-providers/types.ts
src/screens/settings/types.ts
src/screens/vaults/notes/NotesVaultScreen.tsx
src/screens/vaults/notes/components/NoteReaderModal.tsx
src/screens/vaults/notes/components/NotesVaultFilterSheet.tsx
src/screens/vaults/notes/components/NotesVaultSelectionBanner.tsx
src/screens/vaults/notes/components/NotesVaultSummaryCard.tsx
src/screens/vaults/notes/components/NotesVaultToolbar.tsx
src/screens/vaults/notes/hooks/useNotesVaultActions.ts
src/screens/vaults/notes/hooks/useNotesVaultData.ts
src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts
src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts
src/screens/vaults/notes/styles.ts
src/screens/vaults/notes/types.ts
src/screens/vaults/notes/utils.ts
src/services/ai/embeddingService.unit.test.ts
src/services/ai/liveModelCatalog.ts
src/services/appLauncher/overlayStartupPrompt.unit.test.ts
src/services/appLauncher/storageStartupPrompt.unit.test.ts
src/services/appPermissions.ts
src/services/appPermissions.unit.test.ts
src/services/logger.ts
src/services/notificationService.ts
src/services/notificationService.unit.test.ts
src/services/offlineTranscription/audioRecorder.ts
src/services/transcription/matching.ts
src/services/transcription/matching.unit.test.ts
src/services/webSearch/__tests__/orchestrator.test.ts
src/services/webSearch/providers/brave.ts
src/services/webSearch/providers/deepseekWeb.ts
src/services/webSearch/providers/duckduckgo.ts
src/store/splitSessionStorage.unit.test.ts

---
## Diff vs rescue/dangling-dff0790

**Changed files count**: 80

**Top diffstat**
 __mocks__/expo-audio.js                            |    8 -
 jest.unit.config.js                                |    2 +-
 recovery/NOTESVAULT_DANGLING_4E55F7F_AUDIT.md      |   26 -
 recovery/NO_CHAT_MODULE_RECOVERY_MATRIX.md         |   50 -
 recovery/RECONSTRUCTION_SUMMARY.md                 |   40 -
 recovery/TYPECHECK_BLOCKERS_AUDIT.md               |   44 -
 recovery/module_labels.txt                         |   16 -
 recovery/no-chat-matrix/git-term-scan.txt          |  233 ---
 src/components/AudioPlayer.tsx                     |   86 +-
 src/components/AudioPlayer.unit.test.tsx           |   11 -
 src/components/FocusAudioPlayer.tsx                |   59 +-
 src/config/appConfig.ts                            |   12 -
 src/db/database.ts                                 |  103 +-
 src/db/drizzle-migrations/meta/_journal.json       |    7 -
 src/db/queries/aiCache.ts                          |   70 +-
 src/db/testing/createTestDatabase.ts               |    8 -
 src/db/testing/drizzleSchemaParity.unit.test.ts    |    2 -
 src/hooks/useLectureReturnRecovery.ts              |   34 +-
 src/hooks/useLectureReturnRecovery.unit.test.ts    |   32 +-
 src/screens/NotesHubScreen.tsx                     |   37 +-
 src/screens/SettingsScreen.tsx                     | 1629 +++++++++++++++++++-
 src/screens/SleepModeScreen.tsx                    |   12 +
 src/screens/lectureMode/hooks/useLectureAudio.ts   |  100 +-
 .../settings/components/ProviderOrderEditor.tsx    |  119 +-
 .../settings/components/SettingsModelDropdown.tsx  |   40 +-
 .../settings/components/SettingsPermissionRow.tsx  |   14 +-
 .../settings/components/SettingsScreenShell.tsx    |   91 +-
 .../components/SettingsSectionAccordion.tsx        |   12 +-
 .../settings/hooks/useSettingsController.ts        | 1550 -------------------
 .../settings/hooks/useSettingsPermissions.ts       |    6 +-
 .../settings/sections/AdvancedSettingsSection.tsx  |   10 +-
 .../settings/sections/AppIntegrationsSection.tsx   |   29 +-
 .../settings/sections/DashboardOverview.tsx        |   25 +-
 .../settings/sections/InterventionsSection.tsx     |   67 +-
 .../settings/sections/PlanningAlertsSection.tsx    |  121 +-
 src/screens/settings/sections/ProfileSection.tsx   |    7 +-
 src/screens/settings/sections/StorageSections.tsx  |   99 +-
 .../sections/ai-providers/components/ApiKeyRow.tsx |    7 +-
 .../ai-providers/components/CloudflareKeyRow.tsx   |    7 +-
 .../ai-providers/components/LocalAiCard.tsx        |   22 +-

**By area (paths)**
- NotesVault (vaults/notes + NotesVaultScreen): 13
- Settings (SettingsScreen + screens/settings): 27
- AI services: 4
- DB: 5
- Navigation: 0
- Transcription: 2

**High-signal file list (filtered)**
src/components/AudioPlayer.tsx
src/components/AudioPlayer.unit.test.tsx
src/components/FocusAudioPlayer.tsx
src/config/appConfig.ts
src/db/database.ts
src/db/drizzle-migrations/meta/_journal.json
src/db/queries/aiCache.ts
src/db/testing/createTestDatabase.ts
src/db/testing/drizzleSchemaParity.unit.test.ts
src/hooks/useLectureReturnRecovery.ts
src/hooks/useLectureReturnRecovery.unit.test.ts
src/screens/NotesHubScreen.tsx
src/screens/SettingsScreen.tsx
src/screens/SleepModeScreen.tsx
src/screens/lectureMode/hooks/useLectureAudio.ts
src/screens/settings/components/ProviderOrderEditor.tsx
src/screens/settings/components/SettingsModelDropdown.tsx
src/screens/settings/components/SettingsPermissionRow.tsx
src/screens/settings/components/SettingsScreenShell.tsx
src/screens/settings/components/SettingsSectionAccordion.tsx
src/screens/settings/hooks/useSettingsController.ts
src/screens/settings/hooks/useSettingsPermissions.ts
src/screens/settings/sections/AdvancedSettingsSection.tsx
src/screens/settings/sections/AppIntegrationsSection.tsx
src/screens/settings/sections/DashboardOverview.tsx
src/screens/settings/sections/InterventionsSection.tsx
src/screens/settings/sections/PlanningAlertsSection.tsx
src/screens/settings/sections/ProfileSection.tsx
src/screens/settings/sections/StorageSections.tsx
src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx
src/screens/settings/sections/ai-providers/components/CloudflareKeyRow.tsx
src/screens/settings/sections/ai-providers/components/LocalAiCard.tsx
src/screens/settings/sections/ai-providers/components/OAuthCard.tsx
src/screens/settings/sections/ai-providers/components/VertexKeyRow.tsx
src/screens/settings/sections/ai-providers/index.tsx
src/screens/settings/sections/ai-providers/subsections/ApiKeysSection.tsx
src/screens/settings/sections/ai-providers/subsections/ChatModelSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabDuoSection.tsx
src/screens/settings/sections/ai-providers/subsections/GitlabPasteModal.tsx
src/screens/settings/sections/ai-providers/subsections/LocalAiSection.tsx
src/screens/settings/sections/ai-providers/types.ts
src/screens/vaults/notes/NotesVaultScreen.tsx
src/screens/vaults/notes/components/NoteReaderModal.tsx
src/screens/vaults/notes/components/NotesVaultFilterSheet.tsx
src/screens/vaults/notes/components/NotesVaultSelectionBanner.tsx
src/screens/vaults/notes/components/NotesVaultSummaryCard.tsx
src/screens/vaults/notes/components/NotesVaultToolbar.tsx
src/screens/vaults/notes/hooks/useNotesVaultActions.ts
src/screens/vaults/notes/hooks/useNotesVaultData.ts
src/screens/vaults/notes/hooks/useNotesVaultDiagnostics.ts
src/screens/vaults/notes/hooks/useNotesVaultRelabel.ts
src/screens/vaults/notes/styles.ts
src/screens/vaults/notes/types.ts
src/screens/vaults/notes/utils.ts
src/services/ai/embeddingService.ts
src/services/ai/embeddingService.unit.test.ts
src/services/ai/liveModelCatalog.ts
src/services/ai/providerHealth.ts
src/services/appLauncher/overlayStartupPrompt.unit.test.ts
src/services/appLauncher/storageStartupPrompt.unit.test.ts
src/services/appPermissions.ts
src/services/appPermissions.unit.test.ts
src/services/notificationService.ts
src/services/notificationService.unit.test.ts
src/services/offlineTranscription/audioRecorder.ts
src/services/transcription/matching.ts
src/services/transcription/matching.unit.test.ts
src/services/webSearch/__tests__/orchestrator.test.ts
src/services/webSearch/providers/brave.ts
src/services/webSearch/providers/deepseekWeb.ts
src/services/webSearch/providers/duckduckgo.ts
src/store/splitSessionStorage.unit.test.ts

---
## Unpinned stash stats (quick)
### stash@{0}
 babel-debug.log                                  |  3 ++
 src/services/pyqBackgroundTask.unit.test.ts      | 60 ++++++++++++++++++++++++
 src/services/transcription/matching.unit.test.ts | 22 +++++----
 3 files changed, 76 insertions(+), 9 deletions(-)

### stash@{1}
 babel-debug.log                                    |  28 +++++
 recovery/NOTESVAULT_STASH1_AUDIT.md                |  18 +++
 src/db/database.ts                                 |  50 +++++---
 .../aiCache.searchLectureNotes.unit.test.ts        |  68 ++++++++++
 src/db/queries/aiCache.ts                          |  13 +-
 src/db/testing/drizzleSchemaParity.unit.test.ts    |   1 +
 src/services/offlineQueueService.unit.test.ts      | 138 +++++++++++++++++++++
 src/services/transcription/matching.unit.test.ts   |  22 ++--
 8 files changed, 308 insertions(+), 30 deletions(-)

### stash@{2}
 babel-debug.log                                    |    5 +
 recovery/chat-mining/TRAE_CHAT_EXTRACTED_INDEX.md  |   22 +
 recovery/chat-mining/TRAE_CHAT_RECOVERY_SUMMARY.md |   50 +
 recovery/chat-mining/extract_trae_chats.py         |  179 ++++
 .../chat-20260428-14H04M-69f070-unknown-01.txt     | 1005 ++++++++++++++++++++
 src/components/chat/GuruChatModelSelector.tsx      |    1 +
 src/db/database.ts                                 |  199 ++--
 src/db/queries/aiCache.ts                          |   13 +-
 src/hooks/useGuruChatModels.ts                     |  376 ++++----
 .../settings/sections/ai-providers/index.tsx       |    3 +-
 .../ai-providers/subsections/ChatModelSection.tsx  |  160 ++--
 src/services/transcription/matching.ts             |   76 +-
 src/services/transcription/matching.unit.test.ts   |   24 +-
 src/types/chat.ts                                  |    1 +
 14 files changed, 1705 insertions(+), 409 deletions(-)

### stash@{3}
 __mocks__/expo-audio.js                            |   8 +
 app.json                                           |   7 +-
 babel-debug.log                                    |  35 ++++
 index.ts                                           |   1 -
 jest.unit.config.js                                |   1 +
 package-lock.json                                  |  31 ++--
 package.json                                       |   3 +-
 recovery/RECOVERY_STATUS.md                        | 105 +++++++++++
 recovery/candidate-files-from-rescue-stash1.txt    |  46 +++++
 recovery/candidate-files-from-rescue-stash4.txt    | 200 +++++++++++++++++++++
 recovery/debug-5-reflog.txt                        |   0
 recovery/debug-5-show-ref.txt                      |   0
 recovery/fsck.txt                                  |  79 ++++++++
 recovery/reflog-13xx.txt                           |  11 ++
 recovery/reflog-14xx.txt                           |  18 ++
 recovery/reflog-full.txt                           |  71 ++++++++
 recovery/show-ref.txt                              |  27 +++
 src/components/AudioPlayer.tsx                     |  86 ++++-----
 src/components/AudioPlayer.unit.test.tsx           |  11 ++
 src/components/FocusAudioPlayer.tsx                |  59 +-----
 src/db/database.ts                                 | 103 ++++++++++-
 src/db/queries/aiCache.ts                          |  70 +++++++-
 src/db/testing/createTestDatabase.ts               |   8 +
 src/db/testing/drizzleSchemaParity.unit.test.ts    |   2 +
 src/hooks/useLectureReturnRecovery.ts              |  34 ++--
 src/hooks/useLectureReturnRecovery.unit.test.ts    |  32 ++--
 src/screens/NotesHubScreen.tsx                     |  37 ++--
 src/screens/SettingsScreen.tsx                     |  29 ++-
 src/screens/SleepModeScreen.tsx                    |  12 --
 src/screens/lectureMode/hooks/useLectureAudio.ts   | 100 +++++------
 .../components/SettingsCategoryContent.tsx         |   4 +
 src/screens/settings/hooks/useApiKeyTesting.ts     |   6 +
 .../settings/hooks/useProviderApiKeyTests.ts       |  20 +++
 .../settings/hooks/useProviderReadyCount.ts        |   2 +
 .../settings/hooks/useSettingsDerivedStatus.ts     |   7 +
 .../settings/hooks/useSettingsPermissions.ts       |   6 +-
 .../settings/sections/ai-providers/index.tsx       |   7 +
 .../ai-providers/subsections/ApiKeysSection.tsx    |  18 ++
 .../ai-providers/subsections/EmbeddingSection.tsx  |  60 +++++++
 .../settings/sections/ai-providers/types.ts        |   1 +

### stash@{4}
 package.json                                  | 3 ++-
 src/screens/vaults/notes/NotesVaultScreen.tsx | 7 ++++---
 src/services/ai/embeddingService.unit.test.ts | 9 +++++++--
 3 files changed, 13 insertions(+), 6 deletions(-)

### stash@{5}
 babel-debug.log                                    |   7 +
 package-lock.json                                  |  26 +-
 package.json                                       |   1 -
 src/components/AudioPlayer.tsx                     |  85 ++---
 src/components/AudioPlayer.unit.test.tsx           |  51 +++
 src/db/database.ts                                 | 109 ++++++
 src/db/drizzleSchema.ts                            |  10 +
 src/hooks/useScrollRestoration.ts                  |   2 +-
 src/screens/ImageVaultScreen.tsx                   |   4 +-
 src/screens/NotesVaultScreen.tsx                   |  44 +--
 src/screens/QuestionBankScreen.tsx                 |   8 +-
 src/screens/RecordingVaultScreen.tsx               |  14 +-
 src/screens/ReviewScreen.tsx                       |   2 +-
 src/screens/SettingsScreen.tsx                     |  39 +-
 src/screens/SyllabusScreen.tsx                     |  15 +-
 src/screens/SyllabusScreen.unit.test.tsx           |  22 ++
 src/screens/TranscriptHistoryScreen.tsx            |  12 +-
 src/screens/TranscriptVaultScreen.tsx              |  10 +-
 .../lectureMode/hooks/useLectureModeController.ts  |   2 +-
 src/screens/settings/hooks/useApiKeyTesting.ts     |   6 +
 .../settings/hooks/useProviderApiKeyTests.ts       |  20 ++
 .../settings/hooks/useSettingsDerivedStatus.ts     |   6 +
 src/screens/vaults/notes/NotesVaultScreen.tsx      | 392 ++++++++++++++++++++-
 .../vaults/notes/components/NoteReaderModal.tsx    |  72 +++-
 .../notes/components/NotesVaultFilterSheet.tsx     | 170 ++++++++-
 .../notes/components/NotesVaultSelectionBanner.tsx |  34 +-
 .../notes/components/NotesVaultSummaryCard.tsx     |  68 +++-
 .../vaults/notes/components/NotesVaultToolbar.tsx  | 266 +++++++++++++-
 .../vaults/notes/hooks/useNotesVaultActions.ts     | 101 +++++-
 .../vaults/notes/hooks/useNotesVaultData.ts        |  41 ++-
 .../vaults/notes/hooks/useNotesVaultDiagnostics.ts |  86 ++++-
 .../vaults/notes/hooks/useNotesVaultRelabel.ts     |  85 ++++-
 src/screens/vaults/notes/styles.ts                 |  24 +-
 src/services/appLauncher/overlayStartupPrompt.ts   |   2 +-
 .../appLauncher/overlayStartupPrompt.unit.test.ts  |   2 +-
 src/services/appLauncher/storageStartupPrompt.ts   |   2 +-
 .../appLauncher/storageStartupPrompt.unit.test.ts  |   2 +-
 src/services/appPermissions.ts                     |  10 +-
 src/services/appPermissions.unit.test.ts           |  40 ++-
 src/services/examDateSyncService.ts                |   2 +-

