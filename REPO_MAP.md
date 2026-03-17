---
Generated: 2026-03-17. To refresh file listing, run: `npm run repo-map`
---

# Repo map (Guru / neet_study)

**For AIs:** This file is the canonical map of the repository. Prefer `CLAUDE.md` for architecture, DB, AI routing, and lecture flows; use this file for _where things live_. Re-run `npm run repo-map` after adding/removing source files so the listing stays accurate.

**Stack:** React Native (Expo), TypeScript, expo-sqlite, Zustand. NEET-PG/INICET study app.

---

## Root

| File                                                  | Role                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `App.tsx`                                             | Root component; runs `runAppBootstrap()`                       |
| `index.ts`                                            | Entry                                                          |
| `app.json` / `app.config.js`                          | Expo config                                                    |
| `package.json`                                        | Scripts, deps                                                  |
| `tsconfig.json`, `metro.config.js`, `babel.config.js` | Build                                                          |
| `jest.setup.js`, `jest.unit.config.js`                | Unit tests                                                     |
| `CLAUDE.md`                                           | **Canonical AI context** (architecture, DB, AI, lecture flows) |

---

## Source tree (generated)

Paths below are relative to repo root. Only `src/`, `modules/`, `e2e/`, `scripts/` and root config are included; `node_modules`, `.git`, `build`, `docs/archive` are excluded.

```
App.tsx
app.config.js
app.json
babel.config.js
eas.json
eslint.config.js
index.ts
jest.setup.js
jest.unit.config.js
metro.config.js
package.json
react-native.config.js
tsconfig.json
e2e/adhd-screenshots.test.ts
e2e/adhd-ux-audit.test.ts
e2e/checkin.test.ts
e2e/home.test.ts
e2e/jest.config.js
e2e/lecture-app-launch.test.ts
e2e/lecture-mode.test.ts
e2e/pomodoro-anatomy.test.ts
e2e/session.test.ts
e2e/settings.test.ts
e2e/starter.test.ts
e2e/syllabus.test.ts
e2e/tab-navigation.test.ts
e2e/youtube-launch.test.ts
modules/app-launcher/expo-module.config.json
modules/app-launcher/index.ts
modules/app-launcher/package.json
modules/app-launcher/withAppLauncher.js
modules/app-launcher/android/src/main/java/expo/modules/applauncher/AppLauncherModule.kt
modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt
modules/app-launcher/android/src/main/java/expo/modules/applauncher/RecordingService.kt
scripts/force_seed.ts
scripts/generate-repo-map.js
scripts/generateStaticSeed.js
src/components/BrainDumpFab.tsx
src/components/ErrorBoundary.tsx
src/components/ExternalToolsRow.tsx
src/components/FocusAudioPlayer.tsx
src/components/GuruChatOverlay.tsx
src/components/LectureReturnSheet.tsx
src/components/LoadingOrb.tsx
src/components/MarkdownRender.tsx
src/components/ReviewCalendar.tsx
src/components/StartButton.tsx
src/components/SubjectCard.tsx
src/components/Toast.tsx
src/components/VisualTimer.tsx
src/components/home/AgendaItem.tsx
src/components/home/HeroCard.tsx
src/components/home/QuickStatsCard.tsx
src/components/home/ShortcutTile.tsx
src/components/home/TodayPlanCard.tsx
src/components/settings/AdvancedToolsSection.tsx
src/components/settings/ApiKeySection.tsx
src/components/settings/ContentPreferencesSection.tsx
src/components/settings/NotificationSection.tsx
src/components/settings/PermissionRow.tsx
src/components/settings/ProfileSection.tsx
src/components/settings/StudyGoalsSection.tsx
src/components/settings/StudyPreferencesSection.tsx
src/config/appConfig.ts
src/constants/externalApps.ts
src/constants/gamification.ts
src/constants/prompts.ts
src/constants/syllabus.ts
src/constants/theme.ts
src/constants/vaultTopics.ts
src/db/database.ts
src/db/migrations.ts
src/db/schema.ts
src/db/queries/aiCache.ts
src/db/queries/brainDumps.ts
src/db/queries/externalLogs.ts
src/db/queries/progress.ts
src/db/queries/sessionMetrics.ts
src/db/queries/sessionMetrics.unit.test.ts
src/db/queries/sessions.ts
src/db/queries/topics.ts
src/db/repositories/dailyAgendaRepository.ts
src/db/repositories/dailyAgendaRepository.unit.test.ts
src/db/repositories/dailyLogRepository.ts
src/db/repositories/index.ts
src/db/repositories/profileRepository.ts
src/hooks/useAppBootstrap.ts
src/hooks/useAppInitialization.ts
src/hooks/useFaceTracking.ts
src/hooks/useGuruPresence.ts
src/hooks/useHomeDashboardData.ts
src/hooks/useIdleTimer.ts
src/hooks/useLecturePipeline.ts
src/hooks/useLectureReturnRecovery.ts
src/hooks/useLectureTranscription.ts
src/hooks/useResponsive.ts
src/navigation/RootNavigator.tsx
src/navigation/TabNavigator.tsx
src/navigation/linking.ts
src/navigation/navigationRef.ts
src/navigation/types.ts
src/schemas/ai.ts
src/schemas/core.ts
src/schemas/index.ts
src/screens/BedLockScreen.tsx
src/screens/BossBattleScreen.tsx
src/screens/BrainDumpReviewScreen.tsx
src/screens/BreakEnforcerScreen.tsx
src/screens/BreakScreen.tsx
src/screens/CheckInScreen.tsx
src/screens/ContentCard.tsx
src/screens/DailyChallengeScreen.tsx
src/screens/DeviceLinkScreen.tsx
src/screens/DoomscrollGuideScreen.tsx
src/screens/DoomscrollInterceptor.tsx
src/screens/FlaggedReviewScreen.tsx
src/screens/GuruChatScreen.tsx
src/screens/HomeScreen.tsx
src/screens/InertiaScreen.tsx
src/screens/LectureModeScreen.tsx
src/screens/LocalModelScreen.tsx
src/screens/LockdownScreen.tsx
src/screens/ManualLogScreen.tsx
src/screens/ManualNoteCreationScreen.tsx
src/screens/MenuScreen.tsx
src/screens/MockTestScreen.tsx
src/screens/NotesHubScreen.tsx
src/screens/NotesSearchScreen.tsx
src/screens/PunishmentMode.tsx
src/screens/ReviewScreen.tsx
src/screens/SessionScreen.tsx
src/screens/SettingsScreen.tsx
src/screens/SleepModeScreen.tsx
src/screens/StatsScreen.tsx
src/screens/StudyPlanScreen.tsx
src/screens/SyllabusScreen.tsx
src/screens/TopicDetailScreen.tsx
src/screens/TranscriptHistoryScreen.tsx
src/screens/WakeUpScreen.tsx
src/screens/__tests__/ManualNoteCreationScreen.unit.test.ts
src/services/aiService.ts
src/services/aiService.unit.test.ts
src/services/appBootstrap.ts
src/services/appLauncher.ts
src/services/backgroundBackupService.ts
src/services/backgroundTasks.ts
src/services/backupService.ts
src/services/cryptoUtils.ts
src/services/databaseEvents.ts
src/services/deviceMemory.ts
src/services/deviceSyncService.ts
src/services/deviceSyncService.unit.test.ts
src/services/examDateSyncService.ts
src/services/fsrsHelpers.ts
src/services/fsrsHelpers.unit.test.ts
src/services/fsrsService.ts
src/services/imageService.ts
src/services/jsonBackupService.ts
src/services/lectureSessionMonitor.ts
src/services/localModelBootstrap.ts
src/services/notificationService.ts
src/services/offlineQueue.ts
src/services/offlineQueueBootstrap.ts
src/services/offlineQueueBootstrap.unit.test.ts
src/services/offlineQueueErrors.ts
src/services/offlineQueueState.ts
src/services/offlineQueueState.unit.test.ts
src/services/recordingValidation.ts
src/services/recordingValidation.unit.test.ts
src/services/sessionPlanner.ts
src/services/studyPlanner.ts
src/services/studyPlannerBuckets.ts
src/services/studyPlannerBuckets.unit.test.ts
src/services/syncCrypto.ts
src/services/syncCrypto.unit.test.ts
src/services/transcriptStorage.ts
src/services/transcriptStorage.unit.test.ts
src/services/transcriptionService.ts
src/services/transcriptionService.unit.test.ts
src/services/xpService.ts
src/services/ai/catalyze.ts
src/services/ai/chat.ts
src/services/ai/config.ts
src/services/ai/content.ts
src/services/ai/embeddingService.ts
src/services/ai/generate.ts
src/services/ai/index.ts
src/services/ai/jsonRepair.ts
src/services/ai/jsonRepair.unit.test.ts
src/services/ai/llmRouting.ts
src/services/ai/medicalSearch.ts
src/services/ai/medicalSearch.unit.test.ts
src/services/ai/notifications.ts
src/services/ai/planning.ts
src/services/ai/schemas.ts
src/services/ai/types.ts
src/services/ai/validation.ts
src/services/appLauncher/overlay.ts
src/services/appLauncher/permissions.ts
src/services/lecture/health.ts
src/services/lecture/persistence.ts
src/services/lecture/transcription.ts
src/services/offlineTranscription/audioRecorder.ts
src/services/offlineTranscription/batchTranscriber.ts
src/services/offlineTranscription/index.ts
src/services/offlineTranscription/realtimeTranscriber.ts
src/services/offlineTranscription/transcriptMerger.ts
src/services/offlineTranscription/types.ts
src/services/offlineTranscription/whisperModelManager.ts
src/services/transcription/analysis.ts
src/services/transcription/engines.ts
src/services/transcription/matching.ts
src/services/transcription/noteGeneration.ts
src/store/useAppStore.ts
src/store/useSessionStore.ts
src/types/index.ts
```

---

## Key entry points (static)

- **App:** `App.tsx` → `runAppBootstrap()` (`src/services/appBootstrap.ts`); post-mount `useAppBootstrap` (`src/hooks/useAppBootstrap.ts`).
- **DB:** `getDb()` in `src/db/database.ts`; migrations in `src/db/migrations.ts`; repositories in `src/db/repositories/`.
- **AI:** `src/services/aiService.ts` re-exports `src/services/ai/` (Groq → OpenRouter → local).
- **Lecture (external):** `ExternalToolsRow` → `appLauncher` → native `RecordingService` / `OverlayService` → return → `transcriptionService` + `markTopicsFromLecture`.
- **Lecture (in-app):** `LectureModeScreen` + `transcription/` and `offlineTranscription/`.
- **Navigation:** `src/navigation/RootNavigator.tsx` (modal stack), `TabNavigator.tsx` (5 tabs), `types.ts` (param lists).

---

## Conventions for AIs

1. **Canonical context:** `CLAUDE.md` — use it for rules, schema, API keys, lecture flows; do not rely on `docs/archive/` for current behavior.
2. **Where to look:** Use this map to locate screens (`src/screens/`), components (`src/components/`), services (`src/services/`, `src/services/ai/`), DB (`src/db/`), and native module (`modules/app-launcher/`).
3. **Refresh:** After structural changes, run `npm run repo-map` to regenerate the source tree section above.
