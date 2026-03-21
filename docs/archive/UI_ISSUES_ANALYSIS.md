# UI issues analysis — text visibility and text cut-off

Deep pass focused on **text visibility** (contrast, font size, readability) and **text getting cut off** (overflow, truncation, flex layout). Reference: `src/constants/theme.ts` for design tokens.

---

## Summary

| Category                  | Count | Severity |
| ------------------------- | ----- | -------- |
| Text cut off / overflow   | 12    | High     |
| Low contrast (visibility) | 8     | High     |
| Very small font sizes     | 5     | Medium   |
| Missing lineHeight / wrap | 4     | Medium   |

---

## 1. Text cut off / overflow

### 1.1 SubjectCard — subject name

**Where:** `src/components/SubjectCard.tsx`

**Issue:** Subject name uses `styles.name` (fontSize 15) inside a row with `flex: 1` and a fixed `pctContainer`. The card has `overflow: 'hidden'`. Long names (e.g. "Obstetrics and Gynaecology", "Community Medicine") get clipped with no ellipsis or wrap.

**Fix:**

- Give the name container `minWidth: 0` and either `numberOfLines={2}` with `ellipsizeMode="tail"` or allow wrapping with a sensible `lineHeight`.
- Ensure the left column (code + name) can shrink: e.g. `minWidth: 0` on the wrapper `View`.

---

### 1.2 TopicDetailScreen — topic row name

**Where:** `src/screens/TopicDetailScreen.tsx` — `topicRow`, `topicInfo`, `topicName`.

**Issue:** Row is `flexDirection: 'row'` with `topicInfo` (flex: 1) and `topicRight`. Row has `overflow: 'hidden'`. Topic name has no `numberOfLines`; long topic names (e.g. "Tubular Secretion & Renal Handling of Key Substances") are clipped. In React Native, flex children don’t shrink text without `minWidth: 0` on the flex child.

**Fix:**

- Add `minWidth: 0` to `topicInfo` so the text block can shrink.
- Add `numberOfLines={2}` (and optionally `ellipsizeMode="tail"`) to the topic name `Text`, or allow wrap with consistent `lineHeight`.

---

### 1.3 AgendaItem — title and subtitle

**Where:** `src/components/home/AgendaItem.tsx`

**Issue:** Card has `flex: 1`; `title` and `sub` have no `numberOfLines`. Long topic titles or "DEEP DIVE · Very Long Subject Name" can overflow or push layout.

**Fix:**

- Add `numberOfLines={2}` to title and `numberOfLines={1}` to sub, with `ellipsizeMode="tail"`.
- Ensure the card content wrapper has `minWidth: 0` if it’s in a row.

---

### 1.4 ShortcutTile — title

**Where:** `src/components/home/ShortcutTile.tsx`

**Issue:** Tile has `minWidth: '30%'`; title is single line (fontSize 12). Labels like "Daily Challenge" or "Manual Log" can wrap to two lines unevenly or clip on narrow devices.

**Fix:**

- Use `numberOfLines={2}` and `textAlign: 'center'` with a fixed or min height so two-line labels don’t break the grid, or keep `numberOfLines={1}` and `ellipsizeMode="tail"` so long labels truncate consistently.

---

### 1.5 LectureReturnSheet — topic pills and compact card

**Where:** `src/components/LectureReturnSheet.tsx`

**Issue:**

- Topic pills: `topicPillText` in a `flexWrap` row; long AI-detected topic names can make a single pill very wide or clip.
- Compact card: `compactTextWrap` has `flex: 1`; `compactTitle` / `compactSubtitle` can be cut off in the dock if the title is long.

**Fix:**

- Pills: add `numberOfLines={1}` and `ellipsizeMode="tail"` to `topicPillText`, and a `maxWidth: '80%'` or similar on the pill so one long name doesn’t dominate.
- Compact card: add `minWidth: 0` to `compactTextWrap`; add `numberOfLines={1}` (or 2) to title/subtitle with ellipsis.

---

### 1.6 ContentCard — card title and quiz options

**Where:** `src/screens/ContentCard.tsx`

**Issue:** `cardTitle` shows `content.topicName` (fontSize 22). Long topic names can overflow the padding area. Quiz `optionText` is in a horizontal layout; very long options can overflow.

**Fix:**

- `cardTitle`: add `numberOfLines={2}` and `ellipsizeMode="tail"` (or allow wrap with `lineHeight`).
- `optionText`: ensure the option button has `flex: 1` or the text has `numberOfLines={3}` and wraps (optionBtn already has padding; add `flexWrap` or allow text to wrap).

---

### 1.7 SessionScreen — topic name in menu and reveal/done

**Where:** `src/screens/SessionScreen.tsx`

**Issue:** Menu items show `item.topic.name`; reveal screen shows `revealTopicName`; done screen shows `topicDoneName`. Long names can clip in the side menu or in the centered blocks.

**Fix:**

- Menu: add `numberOfLines={2}` and `ellipsizeMode="tail"` to the topic name text, and `minWidth: 0` on the text container.
- Reveal/done: add `numberOfLines={2}` and center with padding so long names wrap or truncate cleanly.

---

### 1.8 TopicDetailScreen — header subject name

**Where:** `src/screens/TopicDetailScreen.tsx` — header `title` style.

**Issue:** Header shows `subjectName` in a single line. Long subject names can overlap the back button or get clipped.

**Fix:** Add `numberOfLines={1}` and `ellipsizeMode="tail"` and ensure `headerCenter` has `minWidth: 0` so the title shrinks before overlapping the back button.

---

### 1.9 StudyPlanScreen — topic name

**Where:** `src/screens/StudyPlanScreen.tsx`

**Issue:** `topicName` in list items can be long; no `numberOfLines` or wrap, so names can overflow.

**Fix:** Add `numberOfLines={2}` and `ellipsizeMode="tail"` (or allow wrap) and `minWidth: 0` on the text container.

---

### 1.10 GuruChatOverlay — header topic name

**Where:** `src/components/GuruChatOverlay.tsx` — `headerSub` shows `topicName`.

**Issue:** Long topic names in the header can push or clip.

**Fix:** Add `numberOfLines={1}` and `ellipsizeMode="tail"` and ensure the header row has `minWidth: 0` on the text container.

---

### 1.11 NotesHubScreen — lecture subject and topic title

**Where:** `src/screens/NotesHubScreen.tsx`

**Issue:** `lectureSubject` has `flex: 1`; `topicTitle` and preview can be long. List rows may clip.

**Fix:** Add `numberOfLines={1}` (or 2 for title) and `ellipsizeMode="tail"` and `minWidth: 0` where the row is flex.

---

### 1.12 Toast — long messages

**Where:** `src/components/Toast.tsx`

**Issue:** Already uses `numberOfLines={3}`; acceptable. If toasts feel cut off, consider expanding to 4 or allowing expand-on-tap.

**Fix (optional):** Increase to `numberOfLines={4}` or add "Show more" for long messages.

---

## 2. Low contrast (visibility)

### 2.1 SleepModeScreen — gray on black

**Where:** `src/screens/SleepModeScreen.tsx`

**Issue:** `setupText: color: '#555'`, `trackingSub: color: '#444'`, `backBtnText: color: '#555'` on very dark/black backgrounds. Contrast is below WCAG AA for small text.

**Fix:** Replace with `theme.colors.textMuted` or a lighter gray (e.g. `#9E9E9E` or `theme.colors.textSecondary`) so contrast is at least ~4.5:1.

---

### 2.2 ContentCard — skip button and rating label

**Where:** `src/screens/ContentCard.tsx` — `skipText: color: '#555'`, `ratingTitle: color: '#9E9E9E'`.

**Issue:** `#555` on dark background is hard to read.

**Fix:** Use `theme.colors.textMuted` or `theme.colors.textSecondary` for skip and secondary labels.

---

### 2.3 SyllabusScreen — percent and labels

**Where:** `src/screens/SyllabusScreen.tsx` — `pctText: color: '#888'`, `overallLabel: color: '#9E9E9E'`.

**Issue:** `#888` is borderline on `#0F0F14`; can feel faint.

**Fix:** Prefer `theme.colors.textSecondary` or `theme.colors.textMuted` for consistency and slightly better contrast.

---

### 2.4 TopicDetailScreen — placeholder and legend

**Where:** `src/screens/TopicDetailScreen.tsx` — `placeholderTextColor="#555"`, `placeholderTextColor="#444"` in notes input, `legendText: color: '#9E9E9E', fontSize: 11`.

**Issue:** Placeholder #555/#444 on dark input bg is low contrast. Legend at 11px is small.

**Fix:** Use `theme.colors.textMuted` for placeholders; consider fontSize 12 for legend and same token for color.

---

### 2.5 SessionScreen — reveal and done subtitles

**Where:** `src/screens/SessionScreen.tsx` — `revealSub: color: '#888'`, `topicDoneSub`, `summaryLabel`, `doneStat`, `pausedSubText` use `#9E9E9E`.

**Issue:** `#888` is borderline; rest is acceptable but could be standardized to theme tokens.

**Fix:** Replace `#888` with `theme.colors.textSecondary`; use theme tokens for all secondary text.

---

### 2.6 StudyPlanScreen — topic sub

**Where:** `src/screens/StudyPlanScreen.tsx` — `topicSub: color: '#666'`.

**Issue:** `#666` on dark background is low contrast.

**Fix:** Use `theme.colors.textMuted` or `theme.colors.textSecondary`.

---

### 2.7 LockdownScreen — exit button

**Where:** `src/screens/LockdownScreen.tsx` — `exitBtnText: color: '#555'`.

**Issue:** Same as above; hard to see on dark bg.

**Fix:** Use `theme.colors.textSecondary` or `theme.colors.textMuted`.

---

### 2.8 ManualNoteCreationScreen — input placeholder

**Where:** `src/screens/ManualNoteCreationScreen.tsx` — check placeholder and label colors.

**Issue:** Ensure placeholders and secondary labels use theme tokens for contrast.

**Fix:** Use `theme.colors.textMuted` for placeholders.

---

## 3. Very small font sizes

### 3.1 SubjectCard — match badge and labels

**Where:** `src/components/SubjectCard.tsx` — `matchBadgeText: fontSize: 9`, `pctLabel: fontSize: 10`.

**Issue:** 9px is too small for readability; 10px is marginal.

**Fix:** Bump `matchBadgeText` to at least 11; `pctLabel` to 11 or 12.

---

### 3.2 LectureReturnSheet — compact eyebrow and stage pills

**Where:** `src/components/LectureReturnSheet.tsx` — `compactEyebrow: fontSize: 10`, `stagePillText: fontSize: 11`, `sectionLabel: fontSize: 10`.

**Issue:** 10px labels are hard to read for many users.

**Fix:** Use at least 11 (preferably 12) for labels that must be read quickly.

---

### 3.3 TopicDetailScreen — badges and meta

**Where:** `src/screens/TopicDetailScreen.tsx` — `reviewText: fontSize: 10`, `topicMetaText`, `parentSummaryText` at 11.

**Issue:** 10px for "Review in X days" is marginal.

**Fix:** Use 11 for badges and meta; keep 11 for secondary meta or bump to 12.

---

### 3.4 HeroCard — stat label

**Where:** `src/components/home/HeroCard.tsx` — `statLabel: fontSize: 11`.

**Issue:** Acceptable but at the lower bound; ensure color is not too faint.

**Fix:** Consider 12 for "INICET" / "NEET-PG" labels if they feel small.

---

## 4. Missing lineHeight / wrap

### 4.1 SubjectCard name

**Where:** `src/components/SubjectCard.tsx`

**Issue:** If we allow name to wrap (instead of ellipsis), we need `lineHeight` so multi-line names don’t overlap or look cramped.

**Fix:** If wrapping: add e.g. `lineHeight: 20` to `styles.name`.

---

### 4.2 AgendaItem title

**Where:** `src/components/home/AgendaItem.tsx`

**Issue:** If title wraps to 2 lines, lack of `lineHeight` can make it look tight.

**Fix:** Add `lineHeight: 18` (or similar) to `styles.title` when using 2 lines.

---

### 4.3 ContentCard cardTitle and optionText

**Where:** `src/screens/ContentCard.tsx`

**Issue:** Long topic name or option text wrapping without `lineHeight` can look uneven.

**Fix:** Add `lineHeight` to `cardTitle` (e.g. 28) and `optionText` (already 20; keep it when wrapping).

---

### 4.4 MarkdownRender

**Where:** `src/components/MarkdownRender.tsx`

**Issue:** Already has `lineHeight: 24` for body. Ensure list items and headings have consistent spacing.

**Fix:** No critical change; optional tuning of list_item marginBottom if content feels cramped.

---

## 5. Cross-cutting recommendations

1. **Theme tokens:** Replace hardcoded grays (`#555`, `#444`, `#888`, `#9E9E9E`, `#666`) with `theme.colors.textMuted` or `theme.colors.textSecondary` so contrast and future theme changes are consistent.
2. **Flex + text:** Whenever a `Text` is inside a `View` with `flex: 1` in a row, add `minWidth: 0` to that `View` so the text can shrink and ellipsize or wrap instead of overflowing.
3. **Long content:** For topic names, subject names, and agenda titles, consistently use `numberOfLines={1}` or `{2}` and `ellipsizeMode="tail"` unless the design explicitly wants full wrap (then add `lineHeight`).
4. **Minimum font size:** Avoid fontSize below 11 for any text that users must read; prefer 12 for labels and secondary text.
5. **Placeholders:** Use a single placeholder color from theme (e.g. `theme.colors.textMuted`) across all `TextInput` components.

---

## 6. Suggested fix order

1. **High impact:** SubjectCard name (cut off), TopicDetailScreen topic row (cut off), SleepModeScreen contrast, ContentCard skipText contrast.
2. **Then:** AgendaItem title, LectureReturnSheet pills/compact card, SessionScreen topic names, TopicDetailScreen header and placeholder/legend.
3. **Then:** Standardize all gray text to theme tokens; bump font sizes 9/10 → 11/12 where needed; add lineHeight where we allow wrap.
