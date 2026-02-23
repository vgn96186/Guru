# UI/UX Review Findings (No Code Changes)

This document consolidates UI/UX issues and improvement opportunities found during a code-based review of the app’s screens.

## Cross-cutting themes

### Consistency & visual system
- **Theme drift**: Background colors vary (`#0A0A0A`, `#0F0F14`, `#000`). This can be intentional (OLED sleep screen), but elsewhere it reads as inconsistent.
- **Header patterns**: Some screens use a custom header row with back arrow, others are centered-title modals. Consider standardizing a small set of header templates.
- **Typography scale**: Some screens use very small supporting text (11–12px). In dense layouts this can feel cramped and reduce accessibility.

### Information hierarchy & “what do I do now?”
- **Overloaded screens**: `HomeScreen` and `SettingsScreen` contain many sections. They’re valuable but can create cognitive load without progressive disclosure.
- **Tappable affordances that don’t navigate**: Any `TouchableOpacity` rows/cards that don’t do anything create “broken UI” perception.

### Feedback states
- **Empty states**: Many screens have good empty states (`MockTestScreen`, `FlaggedReviewScreen`, `BrainDumpReviewScreen`). Some could add “what to do next” guidance (`NotesSearchScreen`).
- **Error/fallback states**: Core flows like sessions should always have calm, actionable fallbacks when AI/network fails.

### Accessibility & ergonomics
- **Tap target sizing**: Nested touchables (e.g., unflag button inside expandable card) can cause accidental activations.
- **Contrast**: Most contrast is strong, but some gray-on-black is borderline for long reading.

### Tone & product safety
- The app has a deliberate “tough love” personality (e.g., harassment mode). This is consistent, but polarizing. Consider a “soft mode” toggle later.

---

## Screen-by-screen findings

### HomeTab

#### `HomeScreen`
- **What works**
  - Strong hierarchy and a clear primary CTA.
  - API key banner is contextual and actionable.
  - “Micro-commitment ladder” framing is excellent for motivation.
- **Issues / opportunities**
  - **Cognitive load**: Many sections compete for attention.
  - **Lecture-detection routing risk**: UX can feel glitchy if the app both shows an alert and navigates quickly.
- **Recommendations**
  - Add progressive disclosure: collapse secondary sections behind “Show more”.
  - Ensure lecture detection results in a single, predictable navigation path.

#### `NotesSearchScreen`
- **What works**
  - Minimal, fast, focused search UI.
- **Issues / opportunities**
  - **Results aren’t actionable**: Items are not tappable; users will expect tapping to open the topic.
  - **Empty state**: “No matches” could also tell the user how to get results (2+ characters, etc.).
- **Recommendations**
  - Make results navigate to the relevant topic detail.
  - Improve empty/help text for query constraints.

#### `FlaggedReviewScreen`
- **What works**
  - Strong safety messaging: reminds users AI content needs verification.
  - Expand/collapse preview is a good detail level.
- **Issues / opportunities**
  - Nested touchables can cause accidental expand/unflag interactions.
- **Recommendations**
  - Consider separating expand tap-zone vs action buttons, or ensure the unflag button never triggers expand.
  - Add filtering by content type in the future.

#### `ManualLogScreen`
- **What works**
  - Practical utility for streak integrity and external study.
  - Subject/topic chips are easy to scan.
- **Issues / opportunities**
  - App grid at `width: '30%'` may compress labels and feel crowded.
  - Logging encourages gaming; if intentional, ensure it’s framed as “honest logging”.
- **Recommendations**
  - Add duration presets (15/30/45/60) to reduce typing.
  - Consider validating/clarifying what the optional “Subject/Topic” affects.

#### `MockTestScreen`
- **What works**
  - Setup → test → results is clear.
  - Strong empty state that explains unlocking.
  - Results review is detailed and valuable.
- **Issues / opportunities**
  - Locked lengths shown as options can feel frustrating even if disabled.
  - “Skip” can become the dominant behavior if visually prominent.
- **Recommendations**
  - Show only unlocked lengths, or show locked with clearer “how to unlock” inline.
  - Consider a “Mark for review” flow and post-test remediation suggestions.

#### `DailyChallengeScreen`
- **What works**
  - Progress and rewards are clear.
  - Good pacing and end summary.
- **Issues / opportunities**
  - Generation/loading phases can feel long and opaque.
  - Long option text can overflow in smaller devices.
- **Recommendations**
  - Improve loading feedback (“Generating Q2/10…”).
  - Consider layout rules for long options (spacing, wrapping).

#### `InertiaScreen`
- **What works**
  - Excellent “intervention” design: breathing → micro-win → decision.
  - Two ending choices reduce guilt.
- **Issues / opportunities**
  - Users in a low-motivation state may want a faster path than a full breathing cycle.
- **Recommendations**
  - Add a delayed “Skip / I’m ready” affordance after a few seconds.

#### `SessionScreen`
- **What works**
  - This is the core product; timer + structure + anti-distraction elements are strong.
- **Issues / opportunities**
  - Sessions are a state machine; the UI must always tell the user “what phase am I in?”
  - AI failures need calm, obvious fallback actions.
- **Recommendations**
  - Ensure the current phase (planning/study/break/review) is always visible.
  - Provide explicit recovery actions when AI fetch fails (manual mode, retry, continue without AI).

#### `BreakScreen`
- **What works**
  - Timer + optional “quick fire” keeps engagement.
- **Issues / opportunities**
  - Can feel restrictive if back is blocked and the user doesn’t understand why.
  - Users may always skip breaks if “ready now” is too easy.
- **Recommendations**
  - Explain once why breaks matter.
  - Consider tracking or gently discouraging repeated break-skips.

#### `ReviewScreen`
- **What works**
  - Flip-card mechanic is focused and engaging.
  - Clear interval buttons.
  - Strong “all caught up” state.
- **Issues / opportunities**
  - 4 rating buttons in a row can be tight on small screens.
- **Recommendations**
  - Consider swipe gestures for rating later.
  - Add a lightweight explanation of intervals (“why this spacing”).

#### `BossBattleScreen`
- **What works**
  - Fun, high-energy gamification; clear phases (`select`, `battle`, `victory`, `defeat`).
  - Subject selection grid is understandable.
  - HUD (boss HP + hearts) communicates stakes well.
- **Issues / opportunities**
  - **Lack of immediate feedback** after selecting an option: the screen moves to the next question without showing correct/incorrect and explanation (can feel random).
  - **No retreat/pause** during battle. Users may need a way to exit without penalty.
  - **Accessibility**: Red-heavy palette in battle phase can be fatiguing.
- **Recommendations**
  - Add a short “correct/incorrect” reveal with explanation and a “Next” button.
  - Add a pause/exit button in HUD.
  - Consider reducing continuous red intensity or adding secondary accent colors.

### SyllabusTab

#### `SyllabusScreen`
- **What works**
  - Simple and scannable subject list + coverage at top.
- **Issues / opportunities**
  - Header padding may feel doubled with safe area.
  - “Sync Vault” action needs clearer consequence framing.
- **Recommendations**
  - Standardize header spacing.
  - Add microcopy: what sync does/doesn’t affect.

#### `TopicDetailScreen`
- **What works**
  - Parent/child structure and confidence/status indicators are strong.
  - Notes editing is powerful.
- **Issues / opportunities**
  - Notes editing inline within list can feel cramped with keyboard.
  - “Study this now” may not take you into a topic-focused session (can feel like a dead end).
  - Debug-style messaging should not be user-facing.
- **Recommendations**
  - Move notes editing to a modal/bottom sheet.
  - Make “Study this now” start a session seeded with that topic.

### PlanTab

#### `StudyPlanScreen`
- **What works**
  - Feasibility warning and plan summary are excellent.
  - Tagging (REL/DEEP/NEW) is readable.
- **Issues / opportunities**
  - Rows are tappable but currently do nothing → feels broken.
- **Recommendations**
  - Either remove tap affordance or make it navigate/start a mini-session.
  - Add “jump to today”/filter later if plans are long.

### StatsTab

#### `StatsScreen`
- **What works**
  - Strong framing that reduces guilt.
  - Subject breakdown visualization is clear.
- **Issues / opportunities**
  - Projected score can cause fixation.
  - No obvious “next action” from weak areas.
- **Recommendations**
  - Add next-action CTAs per subject (review due, 10-min sprint, etc.).

### SettingsTab

#### `SettingsScreen`
- **What works**
  - Powerful control center (API keys, permissions, backup/restore).
- **Issues / opportunities**
  - Very long and dense; hard for users to find things.
- **Recommendations**
  - Split into sub-pages or collapsible sections by theme.

---

## RootStack / modal flows

#### `CheckInScreen`
- **What works**
  - Strong ritual flow; mood + time is a good “start of day” gate.
- **Issues / opportunities**
  - Users who just want to enter quickly may feel forced.
- **Recommendations**
  - Add explicit skip / “Do later” option (or make “Just checking” more clearly a fast path).

#### `DeviceLinkScreen`
- **What works**
  - Single clear task and strong input styling.
- **Issues / opportunities**
  - Placeholder example may not match constraints.
  - No clear “connected” status.
- **Recommendations**
  - Show current connection status (connected/not connected + code).

#### `DoomscrollGuideScreen`
- **What works**
  - Strong personality; OS-specific instructions are helpful.
- **Issues / opportunities**
  - Text-heavy; can read like a wall on small screens.
  - Activation feels one-way; users want to know “how do I stop it?”.
- **Recommendations**
  - Use shorter bullets for “what happens next”.
  - Include a clear “How to disable” section.

#### `LockdownScreen`
- **What works**
  - Extremely clear purpose; one obvious next step.
- **Issues / opportunities**
  - High intensity may stress users.
  - CTA wording should match the actual action.
- **Recommendations**
  - Keep intensity but ensure it’s predictable and transparent.

#### `BreakEnforcerScreen`
- **What works**
  - Unmissable break enforcement UI.
- **Issues / opportunities**
  - “Waiting for tablet signal” needs clearer user guidance if it doesn’t arrive.
- **Recommendations**
  - Add instruction text for what the user should do next.

#### `BrainDumpReviewScreen`
- **What works**
  - Clean, calm review of parked thoughts.
  - Good empty state.
  - Bottom actions are clear; “Clear All” is appropriately styled as destructive.
- **Issues / opportunities**
  - Clearing immediately navigates back; some users may want to confirm or review once more.
- **Recommendations**
  - Consider a confirmation dialog for “Clear All” (future).

#### `SleepModeScreen`
- **What works**
  - OLED-friendly black, minimal nightstand design.
  - Alarm ringing UI is clear and dramatic.
- **Issues / opportunities**
  - Default alarm time “8 hours from now” without a picker can feel arbitrary.
  - Continuous haptic every second can be overwhelming.
  - Instructions “place face down” should be very clear early.
- **Recommendations**
  - Add a time picker later.
  - Provide haptic intensity controls or a “gentle wake” option.

#### `WakeUpScreen`
- **What works**
  - Nice “morning intercept” concept; grounding is well-structured.
- **Issues / opportunities**
  - The breathing loop is timer-driven with multiple `setTimeout`s; if the app backgrounds/foregrounds, the UX may desync.
  - Fog check always routes to `CheckIn` regardless of selection, which can make the choice feel fake.
- **Recommendations**
  - Ensure the selected fog level meaningfully changes the next step.
  - Add a visible progress indicator (“Step 1/3”).

---

## Highest ROI improvements (shortlist)
1. **Make tappable items consistently do something** (or remove tap styling), especially in `StudyPlanScreen`, search results, etc.
2. **Reduce cognitive load on `HomeScreen` and `SettingsScreen`** with collapsible sections / progressive disclosure.
3. **Improve actionability**: `NotesSearchScreen` results → navigate to topic; `TopicDetailScreen` “Study this now” → start a topic-focused session.
4. **Strengthen feedback** in game/quiz-like flows (`BossBattleScreen` answer feedback, loading progress in `DailyChallengeScreen`).
5. **Clarify/soften high-intensity features** with explicit “how to disable” and transparency (doomscroll/harassment, alarms).
