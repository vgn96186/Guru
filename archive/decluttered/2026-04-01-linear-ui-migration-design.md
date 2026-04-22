# Linear UI Migration — Design Spec

**Date:** 2026-04-01
**Scope:** All screens — full transition to Linear-inspired glassmorphic UI
**Goal:** Replace large cards and container-heavy UI with minimal glassmorphic surfaces, dense flat-row layouts, and consistent use of the `linearTheme` design system.

---

## Core Visual Language

Every tappable or grouping element uses `LinearSurface` — a frosted glass slice. The app becomes a stack of glass surfaces against true black (`#000000`).

| Property | Value |
|---|---|
| Surface background | `#111111` with white SVG gradient overlay (0.04 → 0 opacity, top-to-bottom) |
| Border | `rgba(255,255,255,0.08)` |
| Top-edge highlight | 1px at `rgba(255,255,255,0.12)` |
| Radius (item) | `12px` (`radius.md`) |
| Radius (group container) | `16px` (`radius.lg`) |
| Gap between items | `8px` |
| Shadows | None — depth from gradient + border only |

---

## Primitive Changes

### LinearSurface — Add `compact` prop

For row-level items (AgendaItem, menu row, setting row, mood chip, time option):

- `compact={true}`: padding `12px` horizontal / `10px` vertical, `radius.md` (12px)
- `compact={false}` (default, current behavior): padding `24px`, `radius.lg` (16px) — for section containers

No other primitive changes needed. `LinearText`, `LinearButton`, `LinearBadge`, `LinearDivider`, `LinearTextInput` are used as-is.

---

## Screen-by-Screen Spec

### 1. HomeScreen

#### Stats Bar (replaces TodayPlanCard + QuickStatsCard dual-card row)

- **Remove:** `TodayPlanCard` component, `QuickStatsCard` component, `dualCardRow`/`dualCardSlot` styles
- **Add:** Single `LinearSurface` container with horizontal layout:
  - Progress ring (shrunk to 48px diameter) on the left
  - `42min / 120min` text (body weight, muted denominator)
  - Vertical divider
  - Streak: fire icon + count
  - Vertical divider
  - Level badge
  - Vertical divider
  - Sessions count
- Evenly spaced with `justifyContent: 'space-between'`

#### ShortcutTiles → Merged into Tools & Advanced

- **Remove:** `ShortcutTile` component usage from HomeScreen, remove "QUICK ACCESS" section entirely
- **Add:** Study Plan, Notes Vault, Inertia, Guru Chat as compact `LinearSurface` rows inside the existing "Tools & Advanced" expandable section
- Each row: icon (18px) + label text + chevron-forward
- Same pattern as the existing `moreLink` items but wrapped in compact `LinearSurface`

#### AgendaItem

- Wrap each `AgendaItem` in compact `LinearSurface`
- Keep the left color accent border (2px) for task type differentiation (new=accent, review=success, deep_dive=warning)
- Keep inline metadata (time, subject, priority, rationale)
- The glassmorphism replaces the current bare-row look

#### ExamCountdownChips

- Remove pill wrapper styling (`examPill`, `examPillLabel`, etc.)
- Render as inline text below greeting: `INICET 87d · NEET-PG 214d` in muted caption style
- Keep pulsing animation on day numbers

#### Section Labels

- No change — already uppercase, muted, letter-spaced. Matches Linear.

#### Tools & Advanced Section

- Each tool link (Task Paralysis, Harassment Mode, Nightstand, Flagged Review, plus the merged shortcuts) becomes a compact `LinearSurface` row
- Remove bottom-border divider pattern, use gap between surfaces instead

---

### 2. CheckInScreen

#### Mood Selection

- Each mood becomes a compact `LinearSurface` row: icon (16px) + label + optional "Yesterday" tag (right-aligned)
- Replace current bottom-border-only styling
- Selected mood: accent border tint on the `LinearSurface`
- Yesterday mood: subtle highlight border (`borderHighlight`)

#### Time Options

- Each time option becomes a compact `LinearSurface` row: icon in small circle (28px) + label + subtitle + chevron
- Replace current bottom-border divider pattern
- Gap of 8px between items

#### Quick Start Row

- Compact `LinearSurface` with accent border tint (`primaryTintSoft` border color)
- Icon + "Quick Start" label + "Skip check-in, start 30 min" subtitle + chevron

#### Exam Strip

- Wrap in a single compact `LinearSurface`
- Keep inline INICET / NEET-PG layout with icons

#### Streak Pill

- Use `LinearBadge` (warning variant) instead of custom pill styling

#### Typography

- Swap all `Text` + manual styles to `LinearText` with appropriate variants
- Greeting: `title` variant
- Motivation: `bodySmall` variant, `secondary` tone
- Question: `sectionTitle` variant

---

### 3. MenuScreen

#### Hero Section

- **Remove:** The large bordered `hero` container (surface background, border, xl padding)
- **Replace with:** Simple uppercase section label "MENU" (`LinearText` caption, muted) + one-line subtitle as `LinearText` bodySmall, secondary tone. No container.

#### Study Plan Banner

- **Demote** from special banner to a regular list item
- Same compact `LinearSurface` row as other destinations
- Remove the large icon wrap (48px → 28px), remove special background

#### Destination List Items

- Each item: compact `LinearSurface` row
- Shrink icon wraps from 46px to 28px
- Remove background fill and border on icon wraps — just tinted icon directly
- **Remove subtitle text** from items — titles are self-explanatory (Stats, Flashcards, Mind Map, etc.)
- Keep chevron-forward

#### Pressed State

- Keep `opacity: 0.88` on press, remove `scale: 0.99` transform

---

### 4. SyllabusScreen

#### SubjectCard

- Convert to compact `LinearSurface` rows
- Left color bar (2px, subject `colorHex`) — same pattern as AgendaItem
- Subject name (`label` variant) + inline coverage % (`caption`, muted) + due count as `LinearBadge` (if > 0) + chevron
- Remove any existing card backgrounds, shadows, large padding

#### Search Bar

- Use `LinearTextInput` component
- Search icon prefix, placeholder "Search subjects or topics..."

#### Sort Pills

- Use `LinearBadge` for each sort option
- Active sort: `accent` variant. Inactive: `default` variant.

#### Pending Suggestions

- Compact `LinearSurface` rows
- Topic name + subject context + approve (checkmark) / reject (x) icon buttons inline

---

### 5. SettingsScreen

#### Layout Structure

- Group related settings in a single `LinearSurface` container
- Inside each container: individual setting rows separated by `LinearDivider`
- Section headers: uppercase `LinearText` caption, muted tone, letter-spaced — above each group

#### Setting Row Pattern

- Label left (`LinearText` label variant) + control right
- Controls: `Switch` (React Native), `LinearTextInput` for text/keys, chevron for drill-in screens
- Min height 48px per row for touch targets

#### API Key Inputs

- `LinearTextInput` with validation status: small colored dot (green=verified, red=failed, gray=untested) to the right of the input

#### OAuth Buttons

- `LinearButton` ghost variant with provider icon + "Connect" / "Disconnect" label

#### Danger Zone

- Compact `LinearSurface` with `error` border color override
- Reset Progress, Clear AI Cache, etc. as rows inside with `LinearText` error tone

#### Grouped Sections (example)

```
AI PROVIDERS                          ← section header
┌─────────────────────────────────┐   ← LinearSurface (group container)
│ Groq API Key        [input] [●] │
│─────────────────────────────────│   ← LinearDivider
│ OpenRouter Key      [input] [●] │
│─────────────────────────────────│
│ Gemini Key          [input] [●] │
│─────────────────────────────────│
│ ChatGPT             [Connect]   │
│─────────────────────────────────│
│ GitHub Copilot      [Connect]   │
└─────────────────────────────────┘
```

---

### 6. TabNavigator

- Tab bar background: true black (`#000000`)
- Top border: `rgba(255,255,255,0.08)` — 1px
- Active tab: accent color (`#5E6AD2`) icon + label
- Inactive tab: `textMuted` (`#8A8A8E`) icon + label
- No background fill on active tab — just color change
- Remove any existing elevation/shadow on tab bar

---

### 7. Secondary Screens (Light Pass)

Screens: `StatsScreen`, `StudyPlanScreen`, `ContentCard`, `FlashcardsScreen`, `GuruChatScreen`, `TopicDetailScreen`, `SessionScreen`, `ReviewScreen`, `NotesVaultScreen`, `BossBattleScreen`, `InertiaScreen`, `ManualLogScreen`, `DailyChallengeScreen`, `FlaggedReviewScreen`, and remaining screens.

For each:
- Swap `theme.colors` references → `linearTheme` equivalents
- Wrap any card-like elements in `LinearSurface` (compact for rows, default for groups)
- Use `LinearText` for typography where feasible
- Use `LinearButton` for action buttons
- Use `LinearDivider` for separators
- Remove any `surfaceAlt` backgrounds, card shadows, large border radii on non-Surface elements

---

## What Stays Unchanged

- **StartButton** orb + **BootTransition** animation — already polished
- **Navigation structure** — no route changes, no screen additions/removals
- **Business logic** — zero logic changes, purely visual
- **AgendaItem data flow** — same props, just wrapped in LinearSurface
- **Section label pattern** — already matches Linear

---

## Migration Order (Implementation Tiers)

1. **Primitive:** Add `compact` prop to `LinearSurface`
2. **HomeScreen:** Stats bar, AgendaItem wrapping, shortcut merge, exam chips, tools section
3. **CheckInScreen:** Mood chips, time options, quick start, exam strip, typography
4. **MenuScreen:** Remove hero, flatten list items, remove subtitles
5. **SyllabusScreen:** SubjectCard conversion, search bar, sort pills
6. **TabNavigator:** Tab bar styling
7. **SettingsScreen:** Full grouped-rows rewrite
8. **Secondary screens:** Light pass theme swap

Each tier is independently shippable and testable.
