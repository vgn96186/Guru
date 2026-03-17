# HomeScreen UI & Layout — Deep Analysis

Analysis of `HomeScreen.tsx`, its child components (`HeroCard`, `QuickStatsCard`, `ShortcutTile`, `AgendaItem`, `TodayPlanCard`), `StartButton`, and associated hooks/data flow. Focus: layout, responsiveness, theme consistency, empty states, a11y, and maintainability.

---

## 1. Structure & Data Flow

### 1.1 Component tree

```
HomeScreen
├── SafeAreaView
│   ├── StatusBar
│   ├── ScrollView
│   │   └── ResponsiveContainer (content padding 16)
│   │       ├── HeroCard
│   │       ├── QuickStatsCard
│   │       ├── TodayPlanCard
│   │       ├── View (startArea) → StartButton
│   │       ├── View (collapsibleSection) → CRITICAL NOW
│   │       ├── View (gridLandscape when tablet) | Sections
│   │       │   ├── Section "DO THIS NOW" → AgendaItem(s) [0..1]
│   │       │   ├── Section "UP NEXT" → AgendaItem(s) [0..2] + "See full plan"
│   │       │   └── Section "QUICK ACCESS" → ShortcutTile × 4
│   │       └── TouchableOpacity "TOOLS & ADVANCED" (collapsible) → more links
│   └── LectureReturnSheet (conditional)
```

### 1.2 Data

- **useHomeDashboardData:** `weakTopics` (max 3), `todayTasks` (max 2 from getTodaysAgendaWithTimes), `todayMinutes`, `completedSessions`, `isLoading`, `reload`. On load failure shows `Alert.alert('Load Failed', ...)`.
- **Profile / levelInfo:** From `useAppStore`. If missing or loading, screen shows full-screen `LoadingOrb`.
- **heroCta:** Derived from session state, then `todayTasks[0]`, else generic "START SESSION" with `profile.preferredSessionLength`.

### 1.3 Issues

- **TodayPlanCard default goal:** `profile.dailyGoalMinutes || 480` is passed to `generateDailyAgendaWithRouting`. Rest of app uses `120` as default daily goal (minutes). If 480 is intended as “available minutes per day” for the AI, it should be a named constant; if it should match user goal, use the same default as elsewhere (e.g. 120 or `appConfig.DEFAULT_DAILY_GOAL_MINUTES`).
- **Navigation type in TodayPlanCard:** `const navigation = useNavigation<any>();` and `navigation.navigate('MenuTab', { screen: 'StudyPlan' })` — typing as `any` is fragile; should use proper tab param list.
- **Agenda time label:** `t.timeLabel.split(' ')[0]` assumes a single space; if `timeLabel` format changes, this can break or show wrong value.

---

## 2. Layout & Responsiveness

### 2.1 ResponsiveContainer

- **useResponsive:** Tablet breakpoint 600px, landscape 900px. Tablet gets `maxContentWidth` (portrait cap 800, landscape 95% width) and centering. **HomeScreen does not use `s()`, `f()`, `sz()`** — padding and font sizes are fixed (e.g. `content: { padding: 16 }`, `sectionLabel` 11px). On tablet, content is capped but spacing/typography do not scale.
- **Recommendation:** Use responsive spacing for content padding and section margins (e.g. `padding: theme.spacing.lg` and, on tablet, multiply by hook factor or use `s(16)` if you pass the hook into a wrapper).

### 2.2 Grid (tablet landscape)

- When `width >= 900 && width > height`, `gridLandscape` applies: `flexDirection: 'row', gap: 16`. Left column `flex: 1.1`, right `flex: 0.9`. “DO THIS NOW” + “UP NEXT” sit in the left column; “QUICK ACCESS” in the right. Works, but left column can feel tight if “UP NEXT” has two long topic names.

### 2.3 ShortcutTile

- `flex: 1`, `minWidth: '30%'` in a `flexWrap: 'wrap'` row. On phones this typically gives 3 tiles per row; a fourth wraps. **No minimum touch target** (e.g. 44pt height). Tile padding 14; icon wrap 40×40. Total tap area can be below 44pt on small devices.
- **Recommendation:** Add `minHeight: 44` (or theme-based min) to the tile container so touch target meets a11y guidance.

### 2.4 StartButton

- Fixed **SIZE = 240** (diameter). On very small phones or in landscape, 240px can dominate the fold; label/sublabel use `numberOfLines={2}` and `adjustsFontSizeToFit` which helps. No overflow observed in code, but the fixed size does not scale with layout.
- **Recommendation:** Optional: drive size from `useWindowDimensions()` with a max (e.g. `Math.min(240, width * 0.65)`) so it scales down on narrow viewports.

### 2.5 ScrollView

- **No `contentContainerStyle` paddingBottom.** With a tab bar or keyboard, the last items (e.g. “TOOLS & ADVANCED” links) can sit under the tab bar or feel cramped.
- **Recommendation:** Add `contentContainerStyle={{ paddingBottom: 24 }}` (or theme.spacing.xxl) so the last section has breathing room above the tab bar.

---

## 3. Empty States

### 3.1 “DO THIS NOW”

- Renders `Section` with `weakTopics.slice(0, 1)`. If `weakTopics` is empty, the section shows only the label “DO THIS NOW” and **no children** — no message like “No weak topics” or “Generate plan to get suggestions.”
- **Recommendation:** When `weakTopics.length === 0`, render a short placeholder (e.g. “No weak topic highlighted — start a session or generate a plan”) or hide the section.

### 3.2 “UP NEXT”

- Renders `todayTasks.slice(0, 2)`. If `todayTasks` is empty, section shows only “UP NEXT” and no items. “See full plan →” appears only when `todayTasks.length > 2`.
- **Recommendation:** When `todayTasks.length === 0`, show a single line (e.g. “Nothing scheduled — tap to open Study Plan”) and optionally keep a “See full plan” link so the section stays actionable.

### 3.3 TodayPlanCard

- Empty state is handled: no plan → “Guru hasn't planned your day yet” + “GENERATE DAILY PLAN”. When plan exists, content and “VIEW FULL SCHEDULE” are shown. **Good.**

---

## 4. Theme & Hardcoded Values

### 4.1 HomeScreen

- **criticalItems:** `accent: '#FF5252'` and `accent: '#FFB300'`. Theme already has `theme.colors.error` and `theme.colors.warning`; use those so dark/light theme or token changes stay consistent.
- **StatusBar:** Only `barStyle="light-content"`. Other screens set `backgroundColor={theme.colors.background}`; HomeScreen does not. Can cause a visible status bar strip on some devices.
- **Recommendation:** Use `theme.colors.error` / `theme.colors.warning` for critical item accents; set `StatusBar` `backgroundColor={theme.colors.background}`.

### 4.2 HeroCard

- **Pulse color:** `outputRange: [theme.colors.textPrimary, '#FFD700']`. Theme defines `accentAlt: '#FFD700'`. Use `theme.colors.accentAlt` so one source of truth.
- **Recommendation:** Replace `'#FFD700'` with `theme.colors.accentAlt`.

### 4.3 AgendaItem

- **timeText:** `color: '#B1B7C5'` — use `theme.colors.textMuted` or `theme.colors.textSecondary`.
- **badge:** `color: '#D7DEEC'` — use `theme.colors.textSecondary` or a theme caption color.
- **Recommendation:** Replace both hex values with theme tokens.

### 4.4 TodayPlanCard

- **buttonText / badgeText:** `color: '#fff'` — use `theme.colors.textInverse` or `theme.colors.textPrimary` (on primary bg, inverse is correct).
- **Recommendation:** Use `theme.colors.textInverse` for text on primary background.

### 4.5 QuickStatsCard

- Uses theme for card, text, ring. **metaChipText:** `fontSize: 10` — very small; consider 11–12 for readability.
- **Recommendation:** Bump to 11 (or theme.typography.caption) and ensure contrast ratio on `surfaceAlt`/border.

---

## 5. Typography & Readability

| Location                    | Current   | Note                                              |
| --------------------------- | --------- | ------------------------------------------------- |
| Section labels              | 11px, 800 | Small; consider 12px or theme.typography.caption. |
| QuickStatsCard sub          | 12px      | OK.                                               |
| QuickStatsCard metaChipText | 10px      | Too small.                                        |
| ShortcutTile title          | 12px      | OK with numberOfLines={2}.                        |
| AgendaItem time             | 11px      | OK.                                               |
| AgendaItem title            | 13px      | OK.                                               |
| Critical card title         | 16px      | OK.                                               |
| Critical card sub           | 13px      | OK.                                               |

- **Recommendation:** Use theme.typography (e.g. caption, label, bodySmall) where it fits so font scaling and future theme changes apply consistently.

---

## 6. Accessibility

### 6.1 Implemented

- Collapsible “CRITICAL NOW” and “TOOLS & ADVANCED” have `accessibilityRole="button"` and `accessibilityLabel` (expand/collapse + section name).
- Critical cards have `accessibilityRole="button"` and `accessibilityLabel={item.title}`.
- “See full plan” has `accessibilityRole="button"` and `accessibilityLabel="See full study plan"`.
- ShortcutTiles and StartButton have role/label; StartButton has `accessibilityState={{ disabled }}`.
- AgendaItem has `accessibilityRole="button"`, `accessibilityLabel`, and `accessibilityHint`.

### 6.2 Gaps

- **HeroCard:** No accessibility label or role; it’s decorative/informational. Consider `accessibilityLabel={`${greeting}, ${firstName}. INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}` and optionally `accessibilityRole="none"` if it shouldn’t be a button.
- **QuickStatsCard:** No group label. Wrapping in a `View` with `accessibilityLabel="Your progress today"` and `accessibilityRole="summary"` would help.
- **TodayPlanCard:** “GENERATE DAILY PLAN” and “VIEW FULL SCHEDULE” buttons have no explicit `accessibilityLabel`/`accessibilityRole` (TouchableOpacity defaults may be sufficient but should be verified).
- **Section labels:** “DO THIS NOW”, “UP NEXT”, “QUICK ACCESS” are plain Text; they’re not associated with the following content for screen readers. Consider `accessibilityRole="header"` or grouping each section in a View with `accessibilityLabel` that includes the section title.

### 6.3 Touch targets

- **ShortcutTile:** No min height; total height can be &lt; 44pt. Add `minHeight: 44` (or equivalent).
- **More links:** `paddingVertical: 12` → 24pt vertical; slightly under 44pt. Consider 14–16px vertical padding.
- **Critical cards:** Padding 16; title + sub + badge row — height is likely &gt; 44. OK.
- **AgendaItem:** Row with 44px time column; card is flexible. Likely OK but worth confirming on device.

---

## 7. Loading & Error States

### 7.1 Loading

- While `isLoading || !profile || !levelInfo`, full-screen `LoadingOrb` with “Loading progress...”. **Good.**

### 7.2 Data load failure

- `useHomeDashboardData` calls `Alert.alert('Load Failed', ...)` and sets `isLoading = false`. HomeScreen then renders with empty `weakTopics` and `todayTasks`. User sees empty “DO THIS NOW” and “UP NEXT” with no explanation.
- **Recommendation:** Either surface a retry control on HomeScreen when load failed (e.g. a state from the hook like `loadError` and a “Retry” button) or show a small inline error + retry under the stats/agenda area.

### 7.3 Transcribe upload

- “Transcribe Audio” shows “Transcribing...” and disables the button. **Good.** Success/error via Alert. **OK.**

---

## 8. Visual Hierarchy & Spacing

- **content padding:** 16 everywhere; **section marginBottom:** 20; **startArea paddingVertical:** 30. Consistent.
- **Collapsible sections:** “CRITICAL NOW” and “TOOLS & ADVANCED” use the same header pattern (sectionLabel + chevron). **Good.**
- **Critical cards:** marginBottom 10, padding 16, borderRadius 16. **criticalCardTop** has marginBottom 8; **criticalSub** marginBottom 4. Clear.
- **Potential issue:** When “CRITICAL NOW” is expanded and “TOOLS & ADVANCED” is expanded, the scroll length grows; combined with no paddingBottom on ScrollView, the end can feel cramped.

---

## 9. Code & Maintainability

### 9.1 Inline logic

- **heroCta** is built in an IIFE that reads `useSessionStore.getState()` and `todayTasks`/`profile`. Clear but could be a small helper or `useMemo` to keep the component body shorter.
- **Greeting:** `new Date().getHours()` computed on every render. Could be `useMemo` with a dependency that changes once per “period” (e.g. date string) if you ever need to optimize; low priority.

### 9.2 Magic numbers

- **progressClamped** uses `profile.dailyGoalMinutes || 120` — consistent with app default.
- **120** appears only as daily goal default; **slice(0, 1)** and **slice(0, 2)** for weak/tasks are clear. Consider named constants (e.g. `HOME_WEAK_TOPICS_PREVIEW = 1`, `HOME_TODAY_TASKS_PREVIEW = 2`) if you want to tune later.

### 9.3 ExternalToolsRow

- **Not used on HomeScreen.** Lecture app launch is documented in CLAUDE.md as triggered from “ExternalToolsRow on HomeScreen” — if that row was removed from Home, consider moving it to another entry point (e.g. “TOOLS & ADVANCED”) or restoring it if product still requires it on the home.

---

## 10. Summary of Recommendations

| Priority | Item                                                                             | Effort  |
| -------- | -------------------------------------------------------------------------------- | ------- |
| High     | Empty states for “DO THIS NOW” and “UP NEXT” (placeholder + CTA)                 | Low     |
| High     | StatusBar `backgroundColor={theme.colors.background}` on HomeScreen              | Trivial |
| High     | Replace critical item hex accents with theme.colors.error / warning              | Trivial |
| Medium   | ScrollView contentContainerStyle paddingBottom (e.g. 24)                         | Trivial |
| Medium   | ShortcutTile minHeight 44 (touch target)                                         | Trivial |
| Medium   | HeroCard pulse color → theme.colors.accentAlt                                    | Trivial |
| Medium   | AgendaItem timeText/badge colors → theme                                         | Trivial |
| Medium   | TodayPlanCard button/badge text → theme.colors.textInverse                       | Trivial |
| Medium   | TodayPlanCard default goal 480 → named constant or align with daily goal default | Low     |
| Medium   | Data load failure: show retry or inline error on HomeScreen                      | Low     |
| Low      | Responsive padding/typography for tablet (s(), f())                              | Medium  |
| Low      | StartButton max size on small viewports                                          | Low     |
| Low      | Section/summary a11y (group labels, header role)                                 | Low     |
| Low      | QuickStatsCard metaChipText 10 → 11 or theme                                     | Trivial |
| Low      | TodayPlanCard navigation typed (no `any`)                                        | Low     |

---

## 11. Files Referenced

- **Screen:** `src/screens/HomeScreen.tsx`
- **Components:** `src/components/home/HeroCard.tsx`, `QuickStatsCard.tsx`, `ShortcutTile.tsx`, `AgendaItem.tsx`, `TodayPlanCard.tsx`, `src/components/StartButton.tsx`
- **Hooks:** `src/hooks/useHomeDashboardData.ts`, `src/hooks/useResponsive.ts`
- **Theme:** `src/constants/theme.ts`
- **Not used on Home:** `src/components/ExternalToolsRow.tsx` (verify product requirement)
