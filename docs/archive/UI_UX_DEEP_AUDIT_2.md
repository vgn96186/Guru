# UI/UX Deep Audit — Second Pass (Thorough)

Second-pass analysis to surface **deeper** UI/UX issues beyond the first round of fixes. Builds on `docs/UI_DEEP_ANALYSIS.md` and `docs/UI_ISSUES_ANALYSIS.md`. No new dependencies; recommendations use existing `theme` and patterns.

---

## 1. Accessibility (a11y) — Remaining Gaps

### 1.1 Scale of the gap

| Metric                                                 | Count    |
| ------------------------------------------------------ | -------- |
| Files with `TouchableOpacity` or `Pressable`           | ~45      |
| Files with `accessibilityRole` or `accessibilityLabel` | ~16      |
| Approx. interactive elements still unlabeled           | **250+** |

Many screens have **zero** a11y on touchables: ManualLogScreen, NotesHubScreen, WakeUpScreen, ManualNoteCreationScreen, DoomscrollGuideScreen, BreakEnforcerScreen, LectureModeScreen, DoomscrollInterceptor, TranscriptHistoryScreen, PunishmentMode, NotesSearchScreen, MockTestScreen, DeviceLinkScreen, DailyChallengeScreen, InertiaScreen, FlaggedReviewScreen, LocalModelScreen, BrainDumpReviewScreen, BreakScreen, BossBattleScreen, BedLockScreen, and most settings sub-sections.

### 1.2 High-impact areas (priority order)

1. **ManualLogScreen** — App grid, subject chips, topic chips, duration chips, Submit: all need `accessibilityRole="button"` and `accessibilityLabel` (e.g. "Select Marrow", "Subject Anatomy", "Submit log").
2. **NotesHubScreen** — Paste Transcript card, empty-state CTA, "View all", each lecture card, "Search notes", each topic card. Labels like "Open lecture note: {subject}", "View all transcripts".
3. **GuruChatOverlay** — Backdrop (dismiss), close button, send button. Modal should have `accessibilityViewIsModal={true}` and a short label for the overlay.
4. **TranscriptHistoryScreen** — Search, list items, modal close, modal actions. Detail modal needs focus trap and dismiss label.
5. **BrainDumpFab** — FAB, modal overlay, close, submit. "Add quick note", "Close", "Save brain dump".
6. **ErrorBoundary** — Retry/Reset button: `accessibilityRole="button"`, `accessibilityLabel="Reload app"` or "Reset view".
7. **Toast** — Toast item is tappable when `onPress` is set; add `accessibilityRole="button"` and `accessibilityLabel={payload.message}` (and "Tap to act" when `payload.onPress` exists).
8. **TabNavigator** — Tab bar buttons (Home, Syllabus, Chat, Menu, center action). Use `tabBarButton` with `accessibilityRole="tab"`, `accessibilityLabel`, `accessibilityState={{ selected }}`.
9. **Settings sections** — ProfileSection, ApiKeySection, NotificationSection, ContentPreferencesSection, AdvancedToolsSection, PermissionRow: every toggle and button needs role + label.
10. **ReviewScreen, InertiaScreen, DailyChallengeScreen, MockTestScreen, etc.** — All rating buttons, navigation, and primary actions.

### 1.3 Modal-specific a11y

- **GuruChatOverlay** — `Modal` with `accessibilityViewIsModal={true}`, and ensure first focusable element is the input or close (not the backdrop).
- **TranscriptHistoryScreen** — Detail modal: same; close and action buttons must be labeled.
- **BrainDumpFab** — Modal: label for "Quick note" and close/save.

---

## 2. Placeholder and Input Contrast

### 2.1 Low-contrast placeholders

| Location                          | Current                              | Issue                       | Fix                                                                              |
| --------------------------------- | ------------------------------------ | --------------------------- | -------------------------------------------------------------------------------- |
| ManualLogScreen                   | `#555` (topic, duration)             | Too dark on dark bg         | `theme.colors.textMuted`                                                         |
| SyllabusScreen                    | `#666` (search)                      | Borderline                  | `theme.colors.textMuted`                                                         |
| ManualNoteCreationScreen          | `#666`                               | Same                        | `theme.colors.textMuted`                                                         |
| LectureModeScreen                 | `#444` / `#FF980088` (proof-of-life) | Very low contrast           | Use `theme.colors.textMuted`; for placeholder-over-red use a lighter opaque gray |
| TranscriptHistoryScreen           | `#888` (search), `#777` (title)      | Faint                       | `theme.colors.textMuted`                                                         |
| NotesSearchScreen                 | `#666`                               | Same                        | `theme.colors.textMuted`                                                         |
| GuruChatScreen                    | `#4A4F62`                            | Dark on dark                | `theme.colors.textMuted`                                                         |
| DeviceLinkScreen                  | `#666`                               | Same                        | `theme.colors.textMuted`                                                         |
| ProfileSection                    | `#7B8193`                            | Acceptable but inconsistent | Prefer `theme.colors.textMuted`                                                  |
| StudyGoalsSection / ApiKeySection | `PLACEHOLDER_COLOR = '#7B8193'`      | Local constant              | Import theme, use `theme.colors.textMuted` for consistency                       |

### 2.2 Recommendation

Use a **single** placeholder color app-wide: `theme.colors.textMuted`. Replace every `placeholderTextColor` hex and `PLACEHOLDER_COLOR` with it.

---

## 3. Very Small Font Sizes (9–10px)

Readable text should be at least 11px; many labels are 9–10px.

| Location                  | Style / usage                       | Current  | Fix                               |
| ------------------------- | ----------------------------------- | -------- | --------------------------------- |
| LectureReturnSheet        | topicHint, sectionLabel             | 10       | 11 or 12                          |
| StudyPlanScreen           | startHint, reasonPill               | 10       | 11                                |
| TopicDetailScreen         | highYieldBadge, dueBadge, weakBadge | 10       | 11                                |
| AgendaItem                | badge                               | 10       | 11                                |
| TabNavigator              | tab label                           | 10       | 11                                |
| ReviewCalendar            | one style                           | 9        | 11                                |
| LectureModeScreen         | "Processing..."                     | 10       | 12                                |
| TodayPlanCard             | one label                           | 10       | 11                                |
| NotesSearchScreen         | one style                           | 10       | 11                                |
| ReviewScreen              | nemesisBadgeText                    | 10       | 11                                |
| StatsScreen               | weekLabel, weekSub                  | 10       | 11; also fix color (see below)    |
| TranscriptHistoryScreen   | one style                           | 10       | 11                                |
| MockTestScreen            | lockHint                            | 10       | 11                                |
| InertiaScreen             | clueLabel                           | 10       | 11                                |
| FlaggedReviewScreen       | cardModel                           | 10, #555 | 11 + `theme.colors.textSecondary` |
| GuruChatScreen            | multiple                            | 10       | 11                                |
| CheckInScreen             | yesterdayTag                        | **9**    | 11                                |
| BossBattleScreen          | hpText                              | 10       | 11                                |
| ContentPreferencesSection | chipX                               | 10       | 11                                |
| QuickStatsCard            | metaChipText                        | 10       | 11                                |

---

## 4. Hardcoded Hex (Theme Migration)

Screens with the **most** remaining hex usage (for prioritization):

| Screen                  | Approx. hex count | Notes                                             |
| ----------------------- | ----------------- | ------------------------------------------------- |
| MockTestScreen          | 45                | Buttons, cards, results                           |
| TranscriptHistoryScreen | 41                | List, modal, meta                                 |
| LectureModeScreen       | 46                | Full screen layout                                |
| TopicDetailScreen       | 46                | Already partially themed                          |
| NotesHubScreen          | 38                | Cards, empty state, icons                         |
| StatsScreen             | 36                | Cards, streak, week comparison                    |
| DailyChallengeScreen    | 28                | Tiles, states                                     |
| SyllabusScreen          | 21                | Badges, progress                                  |
| BedLockScreen           | 21                | States                                            |
| BossBattleScreen        | 20                | HP, buttons                                       |
| DoomscrollGuideScreen   | 15                | Content                                           |
| FlaggedReviewScreen     | 15                | Cards                                             |
| CheckInScreen           | 15                | Tags, cards                                       |
| BreakScreen             | 14                | Timer, actions                                    |
| LocalModelScreen        | 14                | List                                              |
| GuruChatScreen          | 13                | Bubbles, input                                    |
| ManualLogScreen         | 12                | Grid, chips (after theme add)                     |
| SessionScreen           | 12                | Some already themed                               |
| StudyPlanScreen         | 43                | Many already themed; remaining #333, card borders |
| Others                  | various           | See grep                                          |

**Pattern:** Replace text/UI hex with `theme.colors.*` (e.g. `textPrimary`, `textSecondary`, `textMuted`, `primary`, `success`, `error`, `warning`, `border`, `surface`, `card`). Keep semantic meaning (e.g. success green, error red) via theme tokens.

---

## 5. Low Contrast (Text on Dark)

| Location                        | Style                            | Current        | Fix                                |
| ------------------------------- | -------------------------------- | -------------- | ---------------------------------- |
| StatsScreen                     | weekLabel                        | `#888`         | `theme.colors.textSecondary`       |
| StatsScreen                     | weekSub                          | `#666`         | `theme.colors.textMuted`           |
| FlaggedReviewScreen             | cardModel                        | `#555`, 10px   | `theme.colors.textSecondary`, 11px |
| TranscriptHistoryScreen (modal) | modalMetaText, modalSectionTitle | `#888`         | `theme.colors.textSecondary`       |
| CheckInScreen                   | yesterdayTag                     | `#9E9E9E`, 9px | `theme.colors.textSecondary`, 11px |

---

## 6. Modals and Overlays

### 6.1 GuruChatOverlay

- **Modal:** Add `accessibilityViewIsModal={true}` and optional `accessibilityLabel="Study Guru chat"`.
- **Backdrop:** `accessibilityRole="button"`, `accessibilityLabel="Close chat"` (and `onPress={handleClose}` if not already).
- **Close button:** `accessibilityRole="button"`, `accessibilityLabel="Close"`.
- **Send button:** `accessibilityRole="button"`, `accessibilityLabel="Send message"`.
- **Header topic:** Already `numberOfLines={1}`; ensure parent has `minWidth: 0` so it doesn’t overflow on small devices.

### 6.2 TranscriptHistoryScreen detail modal

- **Overlay:** Dismiss action with a11y label.
- **modalMetaText / modalSectionTitle:** Replace `#888` with theme; consider 12px for section title.
- **Modal close and actions:** Full a11y on every button.

### 6.3 BrainDumpFab modal

- **FAB:** `accessibilityRole="button"`, `accessibilityLabel="Add quick note"`.
- **Modal:** `accessibilityViewIsModal={true}`.
- **Close and Save:** Role + label.

---

## 7. Lists and Text Overflow

### 7.1 Already in good shape

- NotesHubScreen: lecture cards use `numberOfLines` on subject, preview; topic cards on title and preview.
- TopicDetailScreen, SessionScreen, ContentCard: topic/title truncation addressed in first pass.

### 7.2 Remaining risks

- **ManualLogScreen** — Horizontal `ScrollView` of topic chips: `t.name` can be very long. Add `numberOfLines={1}` and `ellipsizeMode="tail"` to the topic chip text, and ensure chip has `maxWidth` or flex shrink so one long name doesn’t dominate.
- **TranscriptHistoryScreen** — List row and modal: ensure list item title and modal title have `numberOfLines` and `minWidth: 0` where in a row.
- **NotesSearchScreen / FlaggedReviewScreen** — Any row that shows topic or note title in a flex row: `minWidth: 0` on the text container and `numberOfLines={1}` or `{2}` with `ellipsizeMode="tail"`.

### 7.3 FlatList

- All main lists use `keyExtractor`; **no** `getItemLayout` anywhere. For long, fixed-height rows, `getItemLayout` would reduce scroll jank; optional optimization.
- NotesSearchScreen: `keyExtractor={(item, idx) => ...}` — ensure the key is stable (prefer `item.id` or similar, not `idx`).

---

## 8. Touch Targets

Minimum recommended **44×44 pt** for primary actions.

- **SessionScreen leaveBtn:** `paddingVertical: 12` only → total height can be &lt; 44pt. Add `minHeight: 44` or increase padding.
- **Filter/sort chips (SyllabusScreen, TopicDetailScreen, StudyPlanScreen):** `paddingVertical: 8` or `6` → small. Prefer at least 10–12 vertical padding or `minHeight: 44` for chips that are primary actions.
- **Tab bar:** Usually fine; verify with insets.
- **Small icon-only buttons (e.g. close, back):** Use `hitSlop` (GuruChatOverlay close already has it) and/or ensure container is at least 44pt.

---

## 9. Keyboard and Scroll

- **ManualNoteCreationScreen** — Single main TextInput; consider `KeyboardAvoidingView` or extra `paddingBottom` when keyboard is open so content isn’t covered.
- **NotesSearchScreen** — Search input at top; list below. KeyboardAvoidingView or scroll-to-focused input helps on small screens.
- **TranscriptHistoryScreen** — Modal with title input; same idea.
- **GuruChatOverlay / GuruChatScreen / DeviceLinkScreen / BrainDumpFab** — Already use KeyboardAvoidingView.

---

## 10. StatusBar Consistency

Screens still using **hardcoded** StatusBar background (e.g. `#0F0F14` or `#0A0A14`):

- PunishmentMode
- NotesSearchScreen
- ReviewScreen
- LocalModelScreen
- FlaggedReviewScreen
- DailyChallengeScreen
- MockTestScreen
- BedLockScreen
- BossBattleScreen
- CheckInScreen
- DoomscrollInterceptor (`#0A0A14`)

**Recommendation:** Use `theme.colors.background` everywhere (and ensure theme is imported). If a screen needs a different status bar (e.g. error state), use a semantic token like `theme.colors.errorSurface` or a dedicated `statusBarError` in theme.

---

## 11. ErrorBoundary and Toast

### 11.1 ErrorBoundary

- **Retry/Reset button:** Add `accessibilityRole="button"` and `accessibilityLabel={canReload ? 'Reload app' : 'Reset view'}`.
- **State after "Reset View" without reload:** Documented in CRITICAL_ISSUES_ANALYSIS — remount key or message when reload isn’t available. No UI change in this audit; behavioral fix is separate.

### 11.2 Toast

- **TouchableOpacity (inner):** When `payload.onPress` is set, add `accessibilityRole="button"` and `accessibilityLabel={payload.message}` (and hint "Double tap to act" or similar when `onPress` exists).
- **Colors:** `COLORS` (info, success, error, warning) could map to `theme.colors.primary`, `theme.colors.success`, `theme.colors.error`, `theme.colors.warning` for consistency and future theming.

---

## 12. Specific Screen Notes

### 12.1 ReviewScreen

- **RATINGS** colors: `#F44336`, `#FF9800`, `#2ECC71`, `#3498DB` → use `theme.colors.error`, `theme.colors.warning`, `theme.colors.success`, `theme.colors.info`.
- No `theme` import currently; add it and use for all UI colors.
- All rating and nav buttons: add a11y.

### 12.2 StatsScreen

- **projectionVal** (projected score): `#FF9800` → `theme.colors.warning`.
- **weekLabel / weekSub:** Fix color (#888, #666) and font size (10 → 11) as in section 3 and 5.
- **Empty state:** Already clear; no change needed.

### 12.3 DoomscrollInterceptor

- Background `#0A0A14` → `theme.colors.background` (or a dedicated dark variant in theme if product wants a different shade).

### 12.4 StudyPlanScreen

- **dayHeader** `borderBottomColor: '#333'` → `theme.colors.border`.
- Any remaining #333 / #222 in cards → theme.

---

## 13. Suggested Fix Order (Second Pass)

| Phase | Focus                                                                            | Rationale                                         |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1     | Placeholder contrast (all TextInputs) + theme for placeholders                   | One token, many files; quick win for readability. |
| 2     | ErrorBoundary + Toast a11y and Toast theme colors                                | Global components; high impact.                   |
| 3     | GuruChatOverlay + BrainDumpFab modal a11y and Modal props                        | High-traffic overlays.                            |
| 4     | ManualLogScreen a11y + placeholder + topic chip overflow                         | Critical flow for logging.                        |
| 5     | NotesHubScreen a11y + any hex in empty/cards                                     | Menu hub.                                         |
| 6     | StatusBar theme in remaining 10 screens                                          | Consistency.                                      |
| 7     | Font size 9/10 → 11 in all listed styles                                         | Readability.                                      |
| 8     | StatsScreen + FlaggedReviewScreen + TranscriptHistoryScreen contrast and theme   | Data-heavy screens.                               |
| 9     | TabNavigator tab a11y                                                            | Every tab change.                                 |
| 10    | Remaining screens: a11y on all touchables, theme where hex remains               | Systematic pass.                                  |
| 11    | Touch target audit (leaveBtn, chips): minHeight 44 or padding                    | Optional polish.                                  |
| 12    | KeyboardAvoidingView on ManualNoteCreation, NotesSearch, TranscriptHistory modal | Optional UX.                                      |

---

## 14. References

- **First pass:** `docs/UI_DEEP_ANALYSIS.md`, `docs/UI_ISSUES_ANALYSIS.md`
- **Theme:** `src/constants/theme.ts`
- **Critical/security:** `docs/CRITICAL_ISSUES_ANALYSIS.md`
