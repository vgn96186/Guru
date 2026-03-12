# Archive Manifest — Deprecated Patch Scripts

This document records the 24 regex-based patch scripts moved to `scripts/archive/` on the migration to eliminate the fragile patching system. All features listed below are **already present in source**; these scripts were one-time migrations that have been applied.

| Script | Target Files | Feature | Verified in Source |
|--------|--------------|---------|---------------------|
| patch_app.js | App.tsx | registerBackgroundFetch | App.tsx L12, L102 |
| patch_break_enforcer_nav.js | RootNavigator, HomeScreen, LectureModeScreen | BreakEnforcer screen + sync | RootNavigator L9, L63; HomeScreen L96; LectureModeScreen L190, L199 |
| patch_break_enforcer_types.js | deviceSyncService, types.ts | BreakEnforcer types | deviceSyncService L6-7; types.ts L8 |
| patch_break_alarms.js | notificationService.ts | scheduleBreakEndAlarms | notificationService.ts L229 |
| patch_contentcard.js | ContentCard.tsx | Read Aloud (may not be applied) | N/A — patch may not have been applied |
| patch_devicelink_nav.js | RootNavigator, types, SettingsScreen | DeviceLink screen | RootNavigator L8, L62; types.ts L9 |
| patch_doomscroll_nav.js | RootNavigator, types, HomeScreen | DoomscrollGuide screen | RootNavigator L7, L61; types.ts L10 |
| patch_harassment.js | notificationService.ts | scheduleHarassment | notificationService.ts L202 |
| patch_home_sync.js | HomeScreen.tsx | Device sync listener | HomeScreen.tsx (connectToRoom, LECTURE_STARTED) |
| patch_homescreen.js | HomeScreen.tsx | Inertia button UI | HomeScreen — Inertia Helper in quick actions |
| patch_inertia.js | InertiaScreen.tsx | forcedMinutes: 5 | InertiaScreen.tsx L148 |
| patch_lecture_audio.js | LectureModeScreen.tsx | Auto-Scribe recording | LectureModeScreen (Audio, recording state) |
| patch_lecture_sync.js | LectureModeScreen.tsx | Device sync + doomscroll overlay | LectureModeScreen (connectToRoom, sendSyncMessage) |
| patch_session.js | SessionScreen.tsx | forcedMinutes param | SessionScreen.tsx L41, L49, L189 |
| patch_sync_db.js | schema.ts, database.ts | sync_code column | schema.ts L115; database.ts |
| patch_ai_audio.js | aiService.ts | transcribeAndSummarizeAudio | aiService.ts |
| update_app.js | aiService, HomeScreen, backupService, schema, database | Zod, QuickStatsCard, backup, is_flagged | Multiple files |
| update_fsrs.js | schema.ts, database.ts | FSRS columns | schema.ts L37-44; database.ts |
| update_profile_sync.js | types, progress.ts | syncCode in UserProfile | types/index.ts; progress.ts L11, L63 |
| update_strict_mode.js | LockdownScreen (creates file) | Lockdown screen | LockdownScreen.tsx exists |
| update_topics_progress.js | topics.ts | FSRS in topic queries | topics.ts |
| update_types.js | types/index.ts | FSRS types | types/index.ts |
| update_planner.js | sessionPlanner.ts | scoreTopicForSession FSRS | sessionPlanner.ts |
| fix_aiservice.js | aiService.ts | parseJsonResponse fix | aiService.ts |
| fix_lockdown.js | RootNavigator | Lockdown import | RootNavigator L6 |
| fix_root_nav.js | RootNavigator | Lockdown import | RootNavigator L6 |

**Deleted (incomplete):** update_progress.js — only wrote temp_queries.log; no real patch logic.

**Kept in scripts/:** force_seed.ts, generateStaticSeed.js, android-dev.sh
