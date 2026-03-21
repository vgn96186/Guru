# UI/UX Audit — Per Page

Audit of every screen in the app for StatusBar, theme/hex, typography, touch targets, a11y, scroll padding, empty/error states, and placeholders. Screens are grouped by navigator.

---

## Summary

| Issue category                           | Screens affected                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Missing StatusBar**                    | StatsScreen, TranscriptHistoryScreen, LockdownScreen, SleepModeScreen, WakeUpScreen, BreakEnforcerScreen, DeviceLinkScreen, BrainDumpReviewScreen, BreakScreen, InertiaScreen (imports but doesn’t render)                                                                                                                |
| **StatusBar hex instead of theme**       | BossBattleScreen (battle phase `#2A0A0A`), LectureModeScreen (hex bg)                                                                                                                                                                                                                                                     |
| **Heavy hex / non-theme colors**         | LectureModeScreen, TranscriptHistoryScreen, FlaggedReviewScreen, TopicDetailScreen, StudyPlanScreen, NotesHubScreen, SessionScreen, StatsScreen, ReviewScreen, BossBattleScreen, DailyChallengeScreen, ManualLogScreen, CheckInScreen, BedLockScreen, DeviceLinkScreen, DoomscrollGuideScreen, BrainDumpReviewScreen      |
| **fontSize 10 or 9**                     | LectureModeScreen, TranscriptHistoryScreen, TopicDetailScreen, StudyPlanScreen, ReviewScreen, BossBattleScreen, MockTestScreen, NotesSearchScreen, GuruChatScreen, InertiaScreen                                                                                                                                          |
| **ScrollView/FlatList no paddingBottom** | StatsScreen, BossBattleScreen (grid/qContainer), ManualLogScreen (main), ManualNoteCreationScreen, SyllabusScreen (list), DoomscrollGuideScreen, BrainDumpReviewScreen                                                                                                                                                    |
| **Touchables without a11y**              | SyllabusScreen (sort chips, sync btn), FlaggedReviewScreen (cards, unflag), StudyPlanScreen (cards, mode chips), StatsScreen (none), DeviceLinkScreen (all), DoomscrollGuideScreen (tone, buttons), BrainDumpReviewScreen (Clear, Done), BreakScreen (buttons), MenuScreen (tiles), SettingsScreen (sections), and others |
| **Placeholder contrast**                 | All checked use `theme.colors.textMuted` ✓                                                                                                                                                                                                                                                                                |
| **Empty states**                         | Most list screens have ListEmptyComponent or conditional empty UI; BreakScreen has no explicit empty for quiz                                                                                                                                                                                                             |

---

## 1. Home stack

### HomeScreen

- **StatusBar:** ✓ theme
- **Scroll:** ✓ contentContainerStyle paddingBottom
- **Theme:** ✓ critical items use theme
- **Empty states:** ✓ DO THIS NOW / UP NEXT
- **A11y:** ✓ sections, critical, shortcuts
- **Issues:** None from this audit.

### SessionScreen

- **StatusBar:** ✓ theme
- **Hex:** `#6C63FF`, `#1A1A24`, `#1A1E2E` in styles → prefer theme.colors.primary, theme.colors.surface, theme.colors.card
- **A11y:** Some buttons have role/label; content tabs and other touchables may lack labels.
- **Scroll:** No explicit paddingBottom on main ScrollView.

### LectureModeScreen

- **StatusBar:** Hex `#2A0A0A` / `#0A0A14`; use theme (e.g. theme.colors.background, errorSurface) for consistency.
- **Hex:** Many (safe, safeWarn, content, proof-of-life, transcribeBtn, saveBtn, etc.); migrate to theme.colors.
- **fontSize 10:** “Processing...” text; use at least 11.
- **Placeholder:** ✓ theme.colors.textMuted (with proof-of-life variant).
- **Scroll:** content has paddingBottom 60 ✓.
- **A11y:** Many TouchableOpacity/buttons; add accessibilityRole/Label on primary actions.

### ManualLogScreen

- **StatusBar:** ✓ theme
- **Hex:** `#1A1A24` in card/topic styles → theme.colors.surface
- **Placeholder:** ✓ theme
- **Scroll:** contentContainerStyle on root ScrollView has no paddingBottom; add ~24–40 for tab bar.
- **A11y:** Improved; verify all topic chips and buttons have labels.

### MockTestScreen

- **StatusBar:** ✓ theme (multiple branches)
- **fontSize 10:** lockHint; use 11.
- **Scroll:** testContent/resultsContent have paddingBottom ✓.
- **A11y:** Add role/label on mode selection, start test, and result actions.

### ReviewScreen

- **StatusBar:** ✓ theme
- **Hex:** safe, nemesisBadge, btn, progressBar, chip, flipBtn, rateBtn → use theme
- **fontSize 10:** nemesisBadgeText; use 11.
- **Scroll:** backScrollContent has paddingBottom 40 ✓.
- **A11y:** Rating buttons and chips need accessibilityLabel.

### BossBattleScreen

- **StatusBar:** Battle phase uses `backgroundColor="#2A0A0A"`; use theme.colors.errorSurface or theme.colors.background.
- **Hex:** subjectCard, battleContainer, hud, hpTrack, optionBtn, retreatBtn, continueBtn, btn; use theme.
- **fontSize 10:** hpText; use 11.
- **Scroll:** grid and qContainer have no paddingBottom; add for safe scroll.
- **A11y:** Subject cards, options, retreat, continue need accessibilityRole/Label.

### InertiaScreen

- **StatusBar:** Imported but not rendered; add `<StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />`.
- **fontSize 10:** clueLabel; use 11.
- **A11y:** Commitment steps and buttons need labels.

### DailyChallengeScreen

- **StatusBar:** ✓ theme (multiple states)
- **Hex:** loadingProgress, progressTrack, topicBadge, feedbackCorrect/Wrong; use theme where possible.
- **Empty:** “No topics due for review yet” message ✓.
- **A11y:** Topic cards and answer options need labels.

### FlaggedReviewScreen

- **StatusBar:** ✓ theme
- **Hex:** safe, count, card, cardType, unflagBtn, preview → theme.colors (surface, warning, panel, etc.)
- **Scroll:** list has paddingBottom 40 ✓.
- **A11y:** Card press and unflag buttons need accessibilityRole/Label.

---

## 2. Syllabus stack

### SyllabusScreen

- **StatusBar:** ✓ theme
- **Placeholder:** ✓ theme
- **Scroll/List:** list has paddingBottom 40 ✓; FlatList has ListEmptyComponent ✓.
- **Hex:** ActivityIndicator `#6C63FF` → theme.colors.primary; pctText `#4CAF50` → theme.colors.success.
- **A11y:** Sort chips and sync button have no accessibilityRole/Label.

### TopicDetailScreen

- **StatusBar:** ✓ theme
- **Hex:** topicImage, pctBadge, progressTrack/Fill, contentCard, notesInput, notesSave/Cancel, studyNowBtn, bulk chips, reviewBadge, etc.; migrate to theme.
- **fontSize 10:** multiple badge/legend styles; use 11.
- **Placeholder:** ✓ theme
- **List:** paddingBottom 40 ✓; ListEmptyComponent ✓.
- **A11y:** Many touchables (topic rows, study now, notes); ensure role/label on key actions.

---

## 3. Menu stack

### MenuScreen

- **StatusBar:** ✓ theme
- **Scroll:** content has paddingBottom theme.spacing.xxxl ✓.
- **A11y:** Menu tiles (Pressable) may need accessibilityLabel.

### StudyPlanScreen

- **StatusBar:** ✓ theme
- **Hex:** card, cardWarning, progressBar, topicRow, rowCompleted, restBox, startHint, dayHeader border; use theme.
- **fontSize 10:** startHint and one other; use 11.
- **Scroll:** content paddingBottom 60 ✓.
- **A11y:** Plan mode chips, day cards, and topic rows need role/label.

### StatsScreen

- **StatusBar:** Missing; add `<StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />`.
- **Scroll:** container has no paddingBottom; add 24–40.
- **Empty:** “No study data yet” ✓.
- **Hex:** absoluteCard, weekChangeBadge, projectionNote, card, projectionCard, progressBar, masteredCard, subjectRow, etc.; use theme.
- **A11y:** No TouchableOpacity; mostly static. Ensure any interactive elements (e.g. tabs if added) have a11y.

### SettingsScreen

- **StatusBar:** ✓ theme
- **Scroll:** content paddingBottom 60 ✓.
- **A11y:** Section headers and toggles/links in ProfileSection, ApiKeySection, PermissionRow; verify from components.

### NotesHubScreen

- **StatusBar:** ✓ theme
- **Hex:** card, section, empty state, buttons; use theme.
- **Scroll:** content paddingBottom 40 ✓.
- **Empty:** “No saved notes yet”, section placeholders ✓.
- **A11y:** Card and action touchables have labels ✓.

### NotesSearchScreen

- **StatusBar:** ✓ theme
- **Placeholder:** ✓ theme
- **fontSize 10:** one style; use 11.
- **ListEmptyComponent:** ✓ when query length > 1.
- **A11y:** Search input and result items need labels.

### TranscriptHistoryScreen

- **StatusBar:** Missing; add with theme.colors.background.
- **Hex:** container, listContent, modal, confidence badge, empty icon color, RefreshControl tintColor, many modal styles; use theme.
- **fontSize 10:** one style; use 11.
- **Empty:** “No Transcripts Yet” and “No Results” ✓.
- **Scroll/List:** listContent paddingBottom 80 ✓; FlatList.
- **Modal:** Rename/Delete/Close have a11y ✓.
- **RefreshControl:** tintColor="#fff" → theme.colors.textPrimary or primary.

---

## 4. Chat stack

### GuruChatScreen

- **StatusBar:** ✓ theme
- **Placeholder:** ✓ theme
- **fontSize 10:** multiple (timestamp, meta); use 11.
- **A11y:** Send button and message list need labels.
- **Scroll:** messagesContent paddingBottom present ✓.

---

## 5. Root / overlay screens

### CheckInScreen

- **StatusBar:** ✓ theme
- **Hex:** safe, moodCard, button; use theme (safe → background, card → surface, button → primary).
- **A11y:** Mood and time options need accessibilityRole/Label (partially done).

### PunishmentMode

- **StatusBar:** ✓ theme
- **A11y:** Verify guilt/action buttons have labels.

### BedLockScreen

- **StatusBar:** ✓ theme (multiple branches)
- **Hex:** safe, buttons, inputs; use theme.

### DoomscrollInterceptor

- **StatusBar:** ✓ theme
- **A11y:** Dismiss and action buttons.

### DeviceLinkScreen

- **StatusBar:** Missing; add with theme.colors.background.
- **Hex:** safe, title, sub, card, label, input, saveBtn, cancelBtn; use theme throughout.
- **A11y:** Generate code, Save, Cancel have no accessibilityRole/Label.

### DoomscrollGuideScreen

- **StatusBar:** Missing; add with theme.colors.background.
- **Scroll:** container has no paddingBottom; add 24–40.
- **A11y:** Tone options and Activate/Deactivate buttons need role/label.

### LockdownScreen

- **StatusBar:** Missing; add with theme.colors.background.
- **A11y:** Start sprint and Exit have labels ✓.
- **Hex:** safe/container likely; use theme.

### SleepModeScreen

- **StatusBar:** Missing; add with theme.colors.background.
- **Hex/A11y:** Check and align with theme and a11y.

### WakeUpScreen

- **StatusBar:** Missing; add with theme.colors.background.

### BreakEnforcerScreen

- **StatusBar:** Missing; add with theme.colors.background.

### LocalModelScreen

- **StatusBar:** ✓ theme
- **Scroll:** content paddingBottom 60 ✓.

### ManualNoteCreationScreen

- **StatusBar:** ✓ theme
- **Placeholder:** ✓ theme
- **Scroll:** content has no paddingBottom; add 24–40.

### BrainDumpReviewScreen

- **StatusBar:** Missing; add with theme.colors.background.
- **Hex:** empty icon #4CAF50, card icon #6C63FF, clearBtn #F44336 → theme.colors.success, primary, error.
- **Scroll:** listContent paddingBottom 20; consider 40 for tab/safe area.
- **Empty:** “No thoughts parked” ✓.
- **A11y:** Clear All and Done buttons need accessibilityRole/Label.

### BreakScreen

- **StatusBar:** Missing; add with theme.colors.background (or parent handles it).
- **A11y:** Quiz option buttons and Done need accessibilityRole/Label (and correct answer announcement).
- **Empty:** If no quiz loaded, ensure fallback UI or message.

### ContentCard (shared)

- **Placeholder:** ✓ theme
- **Scroll:** container paddingBottom 60 ✓.
- **A11y:** Multiple content types; ensure Skip/Done/Answer buttons have labels (partially done).

---

## 6. Recommended fix order

1. **StatusBar (high):** Add to StatsScreen, TranscriptHistoryScreen, LockdownScreen, SleepModeScreen, WakeUpScreen, BreakEnforcerScreen, DeviceLinkScreen, BrainDumpReviewScreen, BreakScreen; fix InertiaScreen (render it). Use theme.colors.background. Replace hex in BossBattleScreen and LectureModeScreen StatusBar.
2. **Scroll padding (medium):** Add contentContainerStyle paddingBottom (24–40) to StatsScreen, BossBattleScreen (grid + qContainer), ManualLogScreen, ManualNoteCreationScreen, DoomscrollGuideScreen; ensure SyllabusScreen FlatList and BrainDumpReviewScreen have enough bottom padding.
3. **fontSize 10 → 11 (medium):** All screens listed in “fontSize 10 or 9” summary.
4. **A11y (medium):** Add accessibilityRole="button" and accessibilityLabel to main touchables on SyllabusScreen (sort, sync), FlaggedReviewScreen (card, unflag), StudyPlanScreen (mode, cards), DeviceLinkScreen (generate, save, cancel), DoomscrollGuideScreen (tone, activate/deactivate), BrainDumpReviewScreen (Clear, Done), BreakScreen (options, Done), MenuScreen (tiles), and remaining screens with unlabeled TouchableOpacity/Pressable.
5. **Hex → theme (lower, incremental):** Per-screen migration: start with LayoutScreen, DeviceLinkScreen, TranscriptHistoryScreen, FlaggedReviewScreen, then TopicDetailScreen, StudyPlanScreen, SessionScreen, StatsScreen, ReviewScreen, BossBattleScreen, others. Prefer theme.colors.\* and theme.spacing/typography/borderRadius.

---

## 7. Files reference

- **Navigation:** `src/navigation/TabNavigator.tsx`, `src/navigation/types.ts`
- **Theme:** `src/constants/theme.ts`
- **Screens:** `src/screens/*.tsx` (35 files)
- **Previous audits:** `docs/HOMESCREEN_UI_ANALYSIS.md`, `docs/UI_DEEP_ANALYSIS.md`, `docs/UI_UX_DEEP_AUDIT_2.md`
