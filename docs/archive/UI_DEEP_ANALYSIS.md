# Deep UI Analysis — Guru NEET Study App

Comprehensive analysis of UI/UX issues across screens, components, and patterns. Builds on `docs/UI_ISSUES_ANALYSIS.md` (text visibility/cut-off) and `docs/archive/UI_UX_AUDIT_REPORT.md` (a11y, theme, responsiveness). Reference: `src/constants/theme.ts`, `src/hooks/useResponsive.ts`.

---

## Executive Summary

| Category                      | Severity | Count / Notes                                                                                 |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| **Text cut-off / overflow**   | High     | 12+ locations — long names clip without ellipsis or wrap                                      |
| **Low contrast (visibility)** | High     | 8+ — grays (#555, #444, #888) on dark backgrounds fail WCAG AA                                |
| **Accessibility (a11y)**      | High     | ~90% of TouchableOpacity/Pressable lack `accessibilityRole` / `accessibilityLabel`            |
| **Theme adoption**            | Medium   | Theme exists; many screens still use hardcoded hex (35+ files with hex)                       |
| **Responsive scaling**        | Medium   | `useResponsive` (s, f, sz) used in ~20 screens but many StyleSheets use raw numbers           |
| **Very small font sizes**     | Medium   | 9px–10px in badges/labels (SubjectCard, LectureReturnSheet, StudyPlanScreen)                  |
| **StatusBar consistency**     | Low      | Mix of `theme.colors.background`, `#0F0F14`, `#0A0A14`                                        |
| **Touch targets**             | Low      | Some buttons use paddingVertical 8–12 (may be &lt; 44pt)                                      |
| **Keyboard avoidance**        | Low      | Only GuruChatOverlay, GuruChatScreen, DeviceLinkScreen, BrainDumpFab use KeyboardAvoidingView |
| **Empty / error states**      | Low      | Present but styling inconsistent (hardcoded colors in places)                                 |

---

## 1. Text Cut-Off and Overflow

### 1.1 Root cause

In React Native, a `Text` inside a `View` with `flex: 1` in a **row** does not shrink unless the flex child has `minWidth: 0`. Without it, long text overflows or clips. Missing `numberOfLines` and `ellipsizeMode` prevent predictable truncation.

### 1.2 Locations (detailed)

| Location               | Element                              | Issue                                                                                                   | Fix                                                                                                                                       |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **SubjectCard**        | Subject name                         | Already has `numberOfLines={2}`, `minWidth: 0` on nameWrap — **partially fixed**. Ensure no regression. | Keep; verify on very long names.                                                                                                          |
| **TopicDetailScreen**  | Topic row name                       | Row `topicInfo` (flex: 1) + `topicRight`; topic name can clip.                                          | Add `minWidth: 0` to topicInfo; `numberOfLines={2}` + `ellipsizeMode="tail"` on topic name.                                               |
| **TopicDetailScreen**  | Header subject name                  | Single-line header; long subject names can overlap back button.                                         | `numberOfLines={1}`, `ellipsizeMode="tail"`; `minWidth: 0` on header center.                                                              |
| **AgendaItem**         | Title, subtitle                      | Already has `numberOfLines` — **fixed**. Card wrapper in row: ensure `minWidth: 0` if in flex row.      | Verify in narrow layouts.                                                                                                                 |
| **ShortcutTile**       | Title                                | `minWidth: '30%'`; single-line fontSize 12. Long labels can wrap unevenly or clip.                      | `numberOfLines={2}` and consistent min height, or `numberOfLines={1}` + ellipsis.                                                         |
| **LectureReturnSheet** | Topic pills, compact card            | Pills: long AI topic names make one pill very wide. Compact: title/subtitle can cut off in dock.        | Pills: `numberOfLines={1}`, `ellipsizeMode="tail"`, `maxWidth: '80%'`. Compact: `minWidth: 0` on text wrap; `numberOfLines` on title/sub. |
| **ContentCard**        | Card title, quiz options             | `cardTitle` (topicName) and long quiz options can overflow.                                             | `numberOfLines={2}` on cardTitle; option text wrap or `numberOfLines={3}` with ellipsis.                                                  |
| **SessionScreen**      | Menu topic name, reveal/done screens | `item.topic.name`, `revealTopicName`, `topicDoneName` can clip.                                         | `numberOfLines={2}` + ellipsis; `minWidth: 0` on text containers.                                                                         |
| **StudyPlanScreen**    | Topic name in list                   | Long topic names overflow.                                                                              | `numberOfLines={2}` + ellipsis; `minWidth: 0` on text container.                                                                          |
| **GuruChatOverlay**    | Header topic name                    | Long topic names push or clip.                                                                          | `numberOfLines={1}` + ellipsis; `minWidth: 0` on header text container.                                                                   |
| **NotesHubScreen**     | Lecture subject, topic title         | Row with flex; subject and title can clip.                                                              | `numberOfLines={1}` (or 2 for title), ellipsis; `minWidth: 0` on flex child.                                                              |
| **Toast**              | Long messages                        | Already `numberOfLines={3}`.                                                                            | Optional: 4 lines or expand-on-tap for very long messages.                                                                                |

---

## 2. Low Contrast (Visibility)

### 2.1 WCAG and theme tokens

Small text on dark backgrounds should meet at least ~4.5:1 contrast (WCAG AA). Hardcoded grays like `#555`, `#444`, `#888` on `#0F0F14` or black are below that. Theme provides `textMuted` and `textSecondary`; these should replace raw hex.

### 2.2 Locations

| Location                     | Style / usage                                                    | Issue                                                                   | Fix                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **SleepModeScreen**          | `clock: color: '#333'`                                           | Clock on black — very low contrast.                                     | Use `theme.colors.textMuted` or lighter (e.g. `#9E9E9E`) for clock when dimmed; keep strong color for alarm state. |
| **SleepModeScreen**          | `setupText`, `trackingSub`, `backBtnText`                        | Already use `theme.colors.textMuted` / `textSecondary` in current code. | Verify on device; ensure no leftover `#555`/`#444`.                                                                |
| **ContentCard**              | `skipText: '#555'`, `ratingTitle: '#9E9E9E'`                     | Low contrast on dark.                                                   | Use `theme.colors.textMuted` / `textSecondary`.                                                                    |
| **SyllabusScreen**           | `pctText: '#888'`, `overallLabel: '#9E9E9E'`                     | Borderline on `#0F0F14`.                                                | Use theme tokens.                                                                                                  |
| **TopicDetailScreen**        | Placeholder `#555`/`#444`, `legendText: '#9E9E9E', fontSize: 11` | Placeholder and legend low contrast.                                    | `theme.colors.textMuted`; consider fontSize 12 for legend.                                                         |
| **SessionScreen**            | `revealSub: '#888'`, various `#9E9E9E`                           | Standardize to theme.                                                   | Replace `#888` with `theme.colors.textSecondary`; use tokens throughout.                                           |
| **StudyPlanScreen**          | `topicSub: '#666'`                                               | Low contrast.                                                           | `theme.colors.textMuted` or `textSecondary`.                                                                       |
| **LockdownScreen**           | `exitBtnText: '#555'`                                            | Hard to see.                                                            | `theme.colors.textSecondary` or `textMuted`.                                                                       |
| **ManualNoteCreationScreen** | Placeholders / labels                                            | Ensure not too faint.                                                   | Use `theme.colors.textMuted` for placeholders.                                                                     |

---

## 3. Accessibility (a11y)

### 3.1 Gap

Roughly **10 files** use `accessibilityRole` / `accessibilityLabel` (e.g. SubjectCard, AgendaItem, ShortcutTile, SessionScreen, TabNavigator, ReviewCalendar, ExternalToolsRow, MenuScreen, GuruChatScreen, CheckInScreen, StartButton). The rest of the app has **hundreds** of `TouchableOpacity` / `Pressable` with no role or label. Screen readers (TalkBack / VoiceOver) then announce “button” with no context or raw text, making the app hard to use for users who rely on assistive tech.

### 3.2 High-impact screens to fix first

- **HomeScreen** — Notes hub card, shortcut tiles, CRITICAL NOW cards, agenda items (AgendaItem has a11y; parent TouchableOpacity for CRITICAL NOW does not), section headers, Start button (has a11y).
- **SyllabusScreen** — Subject rows, filter chips, search.
- **SessionScreen** — Menu items, reveal/done actions, leave/skip buttons.
- **TopicDetailScreen** — Topic rows, filter pills, notes input, actions.
- **SettingsScreen** — All toggles, rows, and buttons.
- **LectureReturnSheet** — Primary actions (Mark as Studied, Quiz, Skip), topic pills, compact card tap target.
- **StatsScreen** — No interactive elements beyond scroll; ensure section headings have sensible semantics.
- **NotesHubScreen**, **StudyPlanScreen**, **ManualLogScreen** — List items and CTAs.

### 3.3 Pattern to apply

For every interactive element:

```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Short, actionable description"
  accessibilityHint="Optional: what happens on press"
  ...
>
```

Use `accessibilityRole="link"` for navigation that opens a new screen; `accessibilityRole="header"` for section titles if they are not focusable as buttons.

---

## 4. Theme and Hardcoded Values

### 4.1 Current state

- **theme.ts** defines colors, spacing, typography, borderRadius, shadows. Migration order in file comments: HomeScreen → SettingsScreen → StatsScreen → SessionScreen → SyllabusScreen.
- **Adoption:** Many screens still use raw hex. Grep shows 35+ files with hex literals in `src` (screens, components, navigation). Examples: `#0F0F14`, `#1A1A24`, `#6C63FF`, `#333`, `#888`, `#9E9E9E`, success/warning/error hex in StatsScreen and others.

### 4.2 Screens without theme import (incomplete list)

Screens that do **not** import `theme` and thus rely entirely on hardcoded values include (among others): WakeUpScreen, ManualLogScreen, TranscriptHistoryScreen, PunishmentMode, NotesSearchScreen, ReviewScreen, FlaggedReviewScreen, DeviceLinkScreen, DailyChallengeScreen, BrainDumpReviewScreen, BedLockScreen, BreakScreen, CheckInScreen, BossBattleScreen, DoomscrollGuideScreen, BreakEnforcerScreen. Any new styling there should use theme; existing styling should be migrated when touching those files.

### 4.3 Recommendations

1. Replace all grays used for text or borders with `theme.colors.textPrimary`, `textSecondary`, `textMuted`, `border`, `borderLight` as appropriate.
2. Replace background/surface hex with `theme.colors.background`, `surface`, `card`, etc.
3. Replace primary/accent/semantic hex with `theme.colors.primary`, `success`, `warning`, `error`.
4. Use `theme.spacing` and `theme.typography` for padding and font sizes where it makes sense.

---

## 5. Responsive Layout and Scaling

### 5.1 useResponsive

- **useResponsive()** exposes `s()` (spacing), `f()` (font), `sz()` (size), `isTablet`, `isLandscape`, `maxContentWidth`.
- **ResponsiveContainer** centers content on tablets and caps width with `maxContentWidth`.
- Used in: LockdownScreen, SyllabusScreen, NotesHubScreen, StudyPlanScreen, SessionScreen, LectureReturnSheet, ShortcutTile, ContentCard, SleepModeScreen, TopicDetailScreen, SubjectCard, Toast, HeroCard, TabNavigator, DoomscrollInterceptor, HomeScreen, DoomscrollGuideScreen, ManualLogScreen, BreakEnforcerScreen, ExternalToolsRow, TranscriptHistoryScreen, WakeUpScreen, SettingsScreen, LectureModeScreen, StatsScreen, NotesSearchScreen, ReviewScreen, MenuScreen, LocalModelScreen, GuruChatScreen, MockTestScreen, FlaggedReviewScreen, DeviceLinkScreen, DailyChallengeScreen, BedLockScreen, BreakScreen, BrainDumpReviewScreen, CheckInScreen, BossBattleScreen, etc.

### 5.2 Issue

Many `StyleSheet.create` objects use **fixed numbers** (e.g. `fontSize: 14`, `padding: 24`). Because StyleSheets are often static, `s()`, `f()`, `sz()` are not applied there. So on tablets, font and spacing do not scale unless components pass dynamic styles (e.g. from a hook). Result: UI can look small on tablets or cramped on small phones.

### 5.3 Options

1. **Dynamic styles:** In screens that use `useResponsive()`, build key styles with `s()`, `f()`, `sz()` and pass them as arrays (e.g. `style={[styles.card, { padding: s(16) }]}`). More verbose but precise.
2. **ResponsiveContainer only:** Rely on max width and flex; accept fixed font/padding on phone. Easiest.
3. **PixelRatio or Dimensions:** Scale a base value once per device and use in a shared layout context (larger refactor).

Recommendation: Use (1) for high-traffic screens (Home, Session, Syllabus, Plan, Stats) and (2) elsewhere for now.

---

## 6. Typography and Readability

### 6.1 Very small font sizes

- **SubjectCard:** `matchBadgeText` 9 → 11; `pctLabel` 10 → 11 or 12.
- **LectureReturnSheet:** `compactEyebrow` 10, `stagePillText` 11, `sectionLabel` 10 → at least 11, preferably 12 for labels.
- **TopicDetailScreen:** `reviewText` 10, meta 11 → 11 for badges, 12 for secondary meta if needed.
- **StudyPlanScreen:** Tags `tagReview`, `tagDeep`, `tagNew`, `tagHighYield` use **fontSize: 9** — too small. Prefer 11.
- **HeroCard:** `statLabel` 11 is at lower bound; consider 12 for exam labels.

### 6.2 Line height and wrap

Where text is allowed to wrap (e.g. 2 lines), add explicit `lineHeight` to avoid cramped or overlapping lines: e.g. SubjectCard name, AgendaItem title, ContentCard cardTitle and optionText. MarkdownRender already has body lineHeight 24; ensure list and heading spacing are consistent.

---

## 7. StatusBar and Safe Area

### 7.1 StatusBar

- Most screens use `StatusBar barStyle="light-content"` with `backgroundColor="#0F0F14"`.
- Some use `theme.colors.background` (ManualNoteCreationScreen, DoomscrollInterceptor, MenuScreen, GuruChatScreen).
- DoomscrollInterceptor uses `#0A0A14` for one variant.
- BossBattleScreen uses `#2A0A0A` for a specific state.
- **Recommendation:** Standardize to `theme.colors.background` (or a dedicated `theme.colors.statusBar`) so status bar matches app background and theme changes apply in one place.

### 7.2 SafeAreaView

All main screens use `SafeAreaView` from `react-native-safe-area-context`; no gaps found. Good.

---

## 8. Touch Targets and Feedback

### 8.1 Minimum size

Accessibility guidelines suggest at least **44×44 pt** for touch targets. Several buttons use `paddingVertical: 8`–`12` without a guaranteed `minHeight`, so on small devices they may be under 44pt. Audit: ShortcutTile, filter pills, small badge buttons, menu items in SessionScreen.

### 8.2 Haptics

SubjectCard, AgendaItem, and others use `expo-haptics` for press feedback. Ensure all primary actions have either haptics or clear visual feedback (opacity/scale).

---

## 9. Keyboard and Inputs

### 9.1 KeyboardAvoidingView

Only a few flows use it: **GuruChatOverlay**, **GuruChatScreen**, **DeviceLinkScreen**, **BrainDumpFab**. Any screen with a prominent `TextInput` that can be covered by the keyboard (e.g. ManualNoteCreationScreen, TopicDetailScreen notes, NotesSearchScreen) should consider wrapping content in `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` (or 'padding' on Android if it behaves better).

### 9.2 Placeholders

Use a single placeholder color from theme (`theme.colors.textMuted`) for all `TextInput` components to fix contrast and consistency.

---

## 10. Empty, Loading, and Error States

### 10.1 Presence

- Empty states: SyllabusScreen (no subjects matched), NotesHubScreen (no saved notes), StudyPlanScreen (nothing queued, no overdue), StatsScreen (no study data).
- Loading: LoadingOrb used on HomeScreen, SessionScreen, StatsScreen, etc.
- Error: SessionScreen shows AI error with retry; ErrorBoundary wraps ContentCard and shows fallback.

### 10.2 Consistency

Empty/error text and buttons sometimes use hardcoded colors (e.g. `#fff`, `#80869A`, `#9A9AAC`). Prefer theme tokens so empty states match the rest of the app and stay accessible.

---

## 11. Cross-Cutting Recommendations

1. **Theme tokens:** Replace hardcoded grays and semantic colors with `theme.colors` (and spacing/typography) everywhere.
2. **Flex + text:** For any `Text` in a `View` with `flex: 1` in a row, add `minWidth: 0` to that View so text can shrink and ellipsize or wrap.
3. **Long content:** Consistently use `numberOfLines` and `ellipsizeMode="tail"` for topic/subject names and titles; add `lineHeight` where wrapping is allowed.
4. **Minimum font size:** Avoid fontSize &lt; 11 for readable text; prefer 12 for labels and secondary text.
5. **Accessibility:** Add `accessibilityRole` and `accessibilityLabel` (and optional `accessibilityHint`) to every TouchableOpacity and Pressable, starting with Home, Syllabus, Session, TopicDetail, Settings, LectureReturnSheet.
6. **StatusBar:** Use `theme.colors.background` (or a single theme key) for all StatusBar backgrounds.
7. **Touch targets:** Ensure primary actions have at least 44pt height or padding; add `minHeight` where needed.
8. **Keyboard:** Add KeyboardAvoidingView to screens with main TextInputs that could be obscured.

---

## 12. Suggested Fix Order

| Phase | Focus                                                                                                                                  | Impact                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1     | SubjectCard/TopicDetailScreen text overflow; SleepModeScreen clock/contrast; ContentCard skip/rating contrast                          | High visibility, high traffic |
| 2     | AgendaItem/ShortcutTile/LectureReturnSheet overflow; SessionScreen topic names and contrast; TopicDetailScreen header and placeholders | Core flows                    |
| 3     | A11y on HomeScreen, SyllabusScreen, SessionScreen, TopicDetailScreen, SettingsScreen, LectureReturnSheet                               | Accessibility compliance      |
| 4     | Replace all gray/semantic hex with theme tokens across screens and components                                                          | Consistency, future theming   |
| 5     | Bump 9px/10px fonts to 11/12; add lineHeight where text wraps                                                                          | Readability                   |
| 6     | StatusBar standardization; touch target audit; KeyboardAvoidingView on input screens                                                   | Polish and edge cases         |

---

## References

- **Existing:** `docs/UI_ISSUES_ANALYSIS.md`, `docs/archive/UI_UX_AUDIT_REPORT.md`
- **Design tokens:** `src/constants/theme.ts`
- **Responsive:** `src/hooks/useResponsive.ts`, `ResponsiveContainer`
- **Context:** `CLAUDE.md`, `REPO_MAP.md`
