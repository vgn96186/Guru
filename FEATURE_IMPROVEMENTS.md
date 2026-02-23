# Feature-by-Feature Usability Improvements Guide

## Table of Contents
1. [Core Study Features](#core-study-features)
2. [AI & Content Features](#ai--content-features)
3. [Gamification Features](#gamification-features)
4. [Focus & Anti-Distraction Features](#focus--anti-distraction-features)
5. [Sleep & Recovery Features](#sleep--recovery-features)
6. [Data & Sync Features](#data--sync-features)
7. [Notification & Engagement Features](#notification--engagement-features)
8. [Utility & Helper Features](#utility--helper-features)

---

## Core Study Features

### 1. Check-In Screen
**Current Flow**: Mood selection → Time availability → Entry

**Usability Issues**:
- No skip option for users who just want to quickly enter
- No memory of previous selections
- Mood descriptions are too small and abstract

**Improvements**:
- **Add "Quick Start" button**: Single-tap entry that uses yesterday's mood + 30min default
- **Smart defaults**: Pre-select yesterday's mood with visual "Same as yesterday" indicator
- **Expandable help**: "Why we ask this" info button that explains the psychology
- **Mood icons**: Add emoji/icon alongside text for faster visual recognition
- **Progress indicator**: Show "Step 1/2" to set expectation

### 2. Session Screen (Core Study Session)
**Current Flow**: Start → AI generates content → Study with breaks → End with XP

**Usability Issues**:
- Unclear what phase user is in (planning/studying/break)
- AI loading can feel like freezing
- Idle detection can trigger accidentally
- No way to pause without ending
- Content type switching is hidden

**Improvements**:
- **Phase indicator**: Persistent header showing "📋 Planning" / "📖 Studying: Pathology" / "☕ Break (2:34 left)"
- **Loading states**: Progress bar for AI generation with cancel option
- **Idle sensitivity settings**: Let users set idle timeout (1min/2min/5min) in settings
- **Pause button**: True pause that stops timer but keeps session alive
- **Content type carousel**: Swipe between keypoints/quiz/story instead of random
- **Quick note button**: One-tap to capture distraction thought without leaving session
- **Session timer visibility**: Always-visible countdown that can be tapped for full-screen view

### 3. Review Screen (Spaced Repetition)
**Current Flow**: Flashcard front → Tap to flip → Rate (Again/Hard/Good/Easy)

**Usability Issues**:
- 4 buttons in a row can be cramped
- No indication of why a certain interval was chosen
- Back content only shows keypoints (not quiz/mnemonic)
- No way to mark "I need to review this topic" vs "just this card"

**Improvements**:
- **Swipe gestures**: Right = Good, Left = Again, Up = Easy (optional)
- **Interval explanation**: "Next review in 3 days because you rated Good 2x previously"
- **Content variety on back**: Show quiz or mnemonic if available (tabbed view)
- **Topic-level flag**: "Mark entire topic for review" vs just this content
- **Auto-read option**: Text-to-speech for the back content
- **Confidence meter**: Visual slider instead of 4 discrete buttons

### 4. Mock Test Screen
**Current Flow**: Select length → Questions → Results with review

**Usability Issues**:
- Locked lengths shown as disabled can frustrate
- Skip button is very prominent (encourages skipping)
- No way to flag questions during test
- Results review requires scrolling through all

**Improvements**:
- **Progressive unlock messaging**: Instead of disabled, show "Unlock 50 questions by completing 5 more study sessions"
- **Skip with penalty**: Require typing "I want to skip" to reduce accidental skips
- **Bookmark during test**: Flag icon on each question for post-review
- **Wrong-answers-first review**: Default to showing only incorrect answers in review
- **Time per question**: Show average time spent per question in results
- **Compare to baseline**: "You got 7/10, your average on Physiology is 6.5/10"

### 5. Daily Challenge Screen
**Current Flow**: Generate questions → Sequential answering → Results

**Usability Issues**:
- Sequential generation feels slow (stare at spinner)
- Long option text can overflow
- No partial credit for "close" answers

**Improvements**:
- **Parallel generation with progress**: "Generating Q3/10..." while showing ready ones
- **Staggered reveal**: Show question immediately, options fade in as ready
- **Text wrapping**: Ensure options always fit with proper styling
- **50/50 lifeline**: Remove 2 wrong answers (gamification aid)
- **Category badges**: Show which subject each question tests
- **Streak counter**: "5-day streak!" visible during challenge

### 6. Study Plan Screen
**Current Flow**: View dynamic plan → See feasibility warning

**Usability Issues**:
- Rows are tappable but do nothing → feels broken
- No way to say "I completed this" or "I want to skip this"
- No "jump to today" if plan is long

**Improvements**:
- **Make rows actionable**: Tap to start session for that specific topic
- **Check off tasks**: Swipe to mark complete, or tap checkbox
- **Today button**: Quick scroll to today's section
- **Drag to reschedule**: Move tasks between days (manual override)
- **Time estimate accuracy**: Show "You typically take 45min for deep dives, this estimates 30min"
- **Compress past days**: Auto-collapse yesterday and before

### 7. Syllabus & Topic Detail Screen
**Current Flow**: Subject list → Topic list → Topic detail with notes

**Usability Issues**:
- Notes editing inline is cramped
- "Study this now" doesn't actually start that topic
- No visual of overall progress at subject level

**Improvements**:
- **Notes modal**: Full-screen note editor, not inline
- **Study this now → works**: Actually start a session seeded with that topic
- **Progress ring on subjects**: Visual % completion donut on each subject card
- **Quick confidence set**: Long-press topic to set confidence without opening detail
- **Topic dependencies**: Show "Prerequisites: [X, Y]" before starting
- **Time invested**: Show "45 mins studied" on each topic

### 8. Manual Log Screen
**Current Flow**: Select app → Subject → Topic → Duration → Submit

**Usability Issues**:
- App grid 30% width is tight
- No presets for common durations
- Subject selection requires scrolling

**Improvements**:
- **Duration chips**: One-tap 15/30/45/60/90 min buttons above keyboard
- **Recent topics shortcut**: "Recently studied" section at top
- **Smart subject suggest**: Default to most-studied subject
- **Bulk add**: "Add another session" button to log multiple without navigation
- **Confidence auto-set**: "Since you studied 45min, I'll mark this as confidence level 3"

---

## AI & Content Features

### 9. AI Content Generation (ContentCard)
**Current Flow**: Topic selected → AI generates → User studies → Can flag

**Usability Issues**:
- No indication of which model was used until after
- Can't regenerate if quality is poor
- No preview of what content type is coming

**Improvements**:
- **Content type selector**: Let user choose "Give me a story on this" vs "Quiz me"
- **Regenerate button**: "This wasn't clear, try again" with model rotation
- **Quality preview**: Show confidence score: "AI is 85% confident this is accurate"
- **Citation request**: "Add textbook citation" button (even if simulated)
- **Voice output**: Text-to-speech for all content types
- **Offline queue**: Queue generation requests for when online returns

### 10. Guru Chat Overlay
**Current Flow**: Tap Ask Guru → Type question → Get response

**Usability Issues**:
- No conversation history persisted
- No suggested questions
- Can't share interesting responses

**Improvements**:
- **Suggested questions**: "Common questions about [topic]" chips
- **History persistence**: Save last 10 conversations per topic
- **Copy/share response**: Long-press to copy or share
- **Voice input**: Microphone button for speech-to-text question
- **Code highlighting**: If asking about pathways, format properly
- **Follow-up suggestions**: "Would you like to know about related topics?"

### 11. Transcription Service (Lecture Mode)
**Current Flow**: Record audio → Send to AI → Get analysis

**Usability Issues**:
- Recording quality is variable
- No way to verify transcription accuracy
- Confidence score not explained

**Improvements**:
- **Audio quality check**: "Speak now" test before recording lecture
- **Edit transcript**: Show raw transcript for user to correct before saving
- **Confidence explanation**: "Based on audio clarity and medical terms detected"
- **Manual override**: If transcription is wrong, let user manually enter topic
- **Background recording indicator**: Persistent notification "Recording lecture..."

---

## Gamification Features

### 12. Boss Battle Screen
**Current Flow**: Select subject → Answer questions → Damage boss → Win/Lose

**Usability Issues**:
- No immediate feedback on answer (just moves to next)
- No explanation of wrong answers
- Can't retreat/pause during battle
- Same emoji for all bosses (👹)

**Improvements**:
- **Answer reveal**: Show correct/incorrect with 2-second explanation before next
- **Retreat button**: "Flee battle" (with small XP penalty)
- **Pause for review**: "Study this topic more before continuing?" offer
- **Subject-specific bosses**: Anatomy = skeleton, Physiology = heart, etc.
- **Health potions**: Earned from streaks, use to heal mid-battle
- **Difficulty scaling**: "Boss seems too hard? Reduce to Easy/Medium/Hard"
- **Battle log**: Post-battle review of all questions with answers

### 13. XP System & Leveling
**Current Flow**: Study → Earn XP → Level up (invisible)

**Usability Issues**:
- Level progression is invisible
- No XP breakdown (how did I earn this?)
- No milestone celebrations

**Improvements**:
- **XP breakdown**: "+50 base, +10 streak bonus, +5 perfect session" tooltip
- **Level visible**: Show level badge on profile/home
- **Milestone animations**: Level up = confetti animation with share option
- **XP history**: Graph of XP earned per day/week
- **Bonus XP opportunities**: "2x XP for next 30 mins if you start now"
- **XP to next level**: Progress bar showing "450/500 XP to Level 12"

### 14. Streak System
**Current Flow**: Daily study → Streak maintained → Warning at 9pm if none

**Usability Issues**:
- Breaking streak is devastating with no recovery
- Timezone issues possible
- No partial credit (5 mins should count)

**Improvements**:
- **Streak recovery**: "Streak broken yesterday. Complete 2 reviews to recover?"
- **Streak freeze**: One "freeze" per month for sick days
- **Minimum threshold**: 10 minutes = counts for streak (configurable)
- **Streak sharing**: Share streak milestone to social media
- **Streak comparison**: "You're on a 5-day streak. Your friend is on 7!"
- **Grace period extension**: "Complete by 11:59pm" option in settings

---

## Focus & Anti-Distraction Features

### 15. Focus Audio Player
**Current Flow**: Toggle button → Rain sounds play

**Usability Issues**:
- Only one sound (rain)
- No volume control in UI
- No timer (plays forever)

**Improvements**:
- **Sound selection**: Rain / White noise / Brown noise / Cafe ambience / Binaural beats
- **Volume slider**: In-player or system volume integration
- **Auto-stop timer**: "Stop after 25 minutes" option
- **Fade in/out**: Smooth 10-second fade instead of abrupt start
- **Session sync**: Auto-stop when session ends

### 16. Lockdown Screen
**Current Flow**: Enter lockdown → Block back button → Timer counts down

**Usability Issues**:
- Very intense (can stress users)
- CTA label mismatch ("Open Flashcards" vs actual action)
- No progress saved if force-quit

**Improvements**:
- **Intensity selector**: "Gentle reminder" vs "Full lockdown" vs "Nuclear option"
- **Correct CTA**: Rename to match outcome ("Start 5-min Sprint")
- **Graceful degradation**: If force-quit, resume where left off with warning
- **Companion mode**: "I'm studying with [friend's name]" for accountability
- **Visual calming**: Add subtle breathing animation even in lockdown

### 17. Break Screen
**Current Flow**: Active break timer → Quiz → Emergency continue

**Usability Issues**:
- Can feel like punishment
- Emergency continue is too accessible
- No guidance on what to do during break

**Improvements**:
- **Break suggestions**: "Walk around", "Look at distant object", "Drink water"
- **Delayed emergency**: Show "Continue" only after 50% of break elapsed
- **Break streak**: "You've taken 3 proper breaks today!"
- **Progressive breaks**: 5min → 10min → 15min based on session length
- **Break activities**: Optional mini-games or breathing exercises during break

### 18. Break Enforcer Screen
**Current Flow**: Enforced break countdown → Wait for tablet signal

**Usability Issues**:
- Unclear what user should do during break
- "Waiting for tablet signal" hangs with no guidance
- Can feel trapped

**Improvements**:
- **Clear instructions**: "Go to your tablet and resume lecture there"
- **Timeout fallback**: If no signal in 5 mins, offer manual "I'm back" button
- **Break activities**: Suggest productive break activities (stretch, hydrate)
- **Visual countdown**: Large animated timer that's satisfying to watch

### 19. Inertia Screen (Low Motivation Intervention)
**Current Flow**: Detected low motivation → Breathing → Micro-win → Decision

**Usability Issues**:
- Breathing cycle is long (48 seconds total)
- No skip option for breathing
- Micro-win fetch can fail

**Improvements**:
- **Skip breathing**: Show "Skip" button after 8 seconds
- **Breathing speed options**: "Quick (2min)" / "Standard (4min)" / "Deep (6min)"
- **Offline micro-wins**: Cache 10-20 pre-generated micro-wins
- **Alternative interventions**: "Try 5-min breathing" OR "Jump to micro-quiz" OR "View inspiration"
- **Track interventions**: "This is your 3rd inertia screen this week" insight

### 20. Doomscroll Guide & Harassment Mode
**Current Flow**: User activates → Notifications scheduled every 3 min

**Usability Issues**:
- No way to see how much time is left in harassment
- Messages can feel genuinely abusive
- No deactivation without opening app

**Improvements**:
- **Countdown widget**: "Harassment ends in 27 minutes or when you return"
- **Tone selector**: "Shame" vs "Encouragement" vs "Facts" notification styles
- **Smart deactivation**: Auto-cancel if user opens any educational app
- **Escalation levels**: Start gentle, get progressively more intense
- **Post-harassment survey**: "Did this help you study?" to tune future messages

---

## Sleep & Recovery Features

### 21. Sleep Mode Screen
**Current Flow**: Start sleep tracking → 8-hour default alarm → Accelerometer tracking

**Usability Issues**:
- No time picker (8 hours might not be right)
- Screen stays on all night (battery drain)
- No snooze option

**Improvements**:
- **Time picker**: Simple hour/minute selector for alarm
- **Smart wake window**: 30-min window based on movement
- **Battery saver**: Dim to minimum brightness, black pixels (OLED)
- **Snooze**: 9-minute snooze option
- **Sleep quality rating**: Morning "How did you sleep?" 1-5 rating
- **Sleep stats**: "You moved 23 times, average sleep quality 7.2/10"

### 22. Wake Up Screen
**Current Flow**: Alarm → Breathing cycle → Grounding → Fog check → CheckIn

**Usability Issues**:
- Fog check choices don't change outcome
- Breathing can be too long when rushing
- No "I'm already awake" fast path

**Improvements**:
- **Fog check routing**: Actually route differently (Clear→Home, Hazy→Short check-in, Foggy→Gentle mode)
- **Express mode**: "I'm already awake and ready" fast path
- **Progress indicator**: "Step 2/3" throughout
- **Skip with consequence**: "Skip remaining (streak won't count)" option
- **Morning streak**: "7-day morning routine streak!"
- **Weather integration**: "It's rainy today, perfect for deep focus"

---

## Data & Sync Features

### 23. Device Linking (DeviceLinkScreen)
**Current Flow**: Enter code → Save → MQTT connection

**Usability Issues**:
- No visual confirmation of connection
- No status indicator (connected/disconnected)
- Code entry is manual only

**Improvements**:
- **Connection status badge**: Green dot when connected, red when not
- **QR code sharing**: Generate QR for easy sharing between devices
- **Auto-reconnect**: Show "Reconnecting..." with retry count
- **Sync log**: "Last sync: 2 mins ago" or "Sync failed 5 mins ago"
- **Multi-device support**: Show list of connected devices with names

### 24. Backup & Restore
**Current Flow**: Settings → Export/Import → File system

**Usability Issues**:
- No automatic backups
- Import requires app restart
- No backup history

**Improvements**:
- **Auto-backup**: Weekly automatic backup to cloud (if permission)
- **Backup history**: Keep last 5 backups with timestamps
- **Selective restore**: "Restore only streak data" or "Restore everything"
- **Migration assistant**: When importing, show diff between current and backup
- **Export formats**: JSON (readable) + .db (full restore)
- **Backup reminder**: "You haven't backed up in 2 weeks" banner

### 25. Brain Dump Feature
**Current Flow**: Floating button → Type thought → Saved → Review later

**Usability Issues**:
- FAB can block content
- No categorization of dumps
- Review is all-or-nothing clear

**Improvements**:
- **FAB positioning**: Auto-hide when scrolling, or dock to side
- **Quick categories**: "Question" / "Distraction" / "Idea" / "Todo" icons
- **Priority flag**: Mark some dumps as "urgent" for immediate review
- **Individual deletion**: Delete single dumps, not just "Clear All"
- **Export dumps**: "Email my parked thoughts" feature
- **Smart review**: Suggest reviewing oldest first, not just LIFO

---

## Notification & Engagement Features

### 26. Notification System
**Current Flow**: Schedule daily reminders + streak warnings + boss fights

**Usability Issues**:
- All-or-nothing permission
- No snooze for individual notifications
- No "Do not disturb" study mode

**Improvements**:
- **Granular permissions**: Allow per-notification-type toggles
- **Notification center**: In-app list of all pending notifications with cancel option
- **Smart scheduling**: Adapt to user's actual study times (not just 7am/6pm)
- **Notification snooze**: "Remind me in 15 mins" action on notification
- **Study mode**: Toggle that silences all non-urgent notifications
- **Notification analytics**: "You respond to 9pm notifications 80% of the time"

### 27. Streak Warning Notifications
**Current Flow**: 9pm notification if no study yet

**Usability Issues**:
- Single time (9pm) doesn't fit all schedules
- No gradual escalation
- Same message every time

**Improvements**:
- **Custom time**: Set your "streak deadline" (e.g., 11pm for night owls)
- **Escalating urgency**: 
  - 6pm: "Plenty of time, just 10 mins needed"
  - 9pm: "3 hours left to keep your streak"
  - 10:30pm: "URGENT: 30 mins left!"
- **Quick actions**: "Start 5-min session" button directly in notification
- **Streak protection**: "You're about to lose a 12-day streak!"

---

## Utility & Helper Features

### 28. Notes Search
**Current Flow**: Type query → See results → ... (no action)

**Usability Issues**:
- Results aren't tappable
- No filtering
- Can't edit notes from results

**Improvements**:
- **Tappable results**: Navigate to topic detail
- **Search filters**: "Notes only" / "Topics" / "All"
- **In-place edit**: Tap note to quick-edit inline
- **Search history**: Show recent searches
- **Fuzzy search**: Handle typos ("cardology" → cardiology)
- **Highlight matches**: Bold the matching text in results

### 29. External Tools Row
**Current Flow**: Horizontal scroll of apps → Tap to open → Long-press to log

**Usability Issues**:
- Long-press is undiscoverable
- No indication of which apps are installed
- No usage stats per app

**Improvements**:
- **Visual hint**: "Hold to log" micro-label or icon
- **Install detection**: Grey out uninstalled apps, or mark installed ones
- **Quick log modal**: After opening app, auto-prompt "Log session?" when returning
- **App usage stats**: "You've logged 12 hours on Marrow this month"
- **Reorder apps**: Let users pin favorite apps to front
- **Add custom app**: "Add your own app" option

### 30. Flagged Content Review
**Current Flow**: List of flagged AI content → Expand to preview → Unflag

**Usability Issues**:
- Nested touchables (card tap vs unflag button)
- No way to regenerate flagged content
- No categorization by issue type

**Improvements**:
- **Separate action zones**: Clear tap targets for expand vs actions
- **Regenerate button**: "Get better version of this content"
- **Filter by type**: "Show only quiz errors" / "Show only typos"
- **Bulk actions**: Select multiple to unflag
- **Export for review**: "Share with AI team" for quality improvement
- **Accuracy rating**: "Was this actually wrong?" Yes/No feedback

### 31. Settings Screen
**Current Flow**: Long scroll of all settings

**Usability Issues**:
- Overwhelming length
- No search
- Dangerous actions not separated

**Improvements**:
- **Collapsible sections**: AI / Notifications / Study Preferences / Backup / Danger Zone
- **Search settings**: Type "backup" to find backup option
- **Reset to defaults**: Per-section reset option
- **Setting explanations**: Info icons explaining what each does
- **Change preview**: "If you change this, X will happen" warning
- **Quick actions**: "Export settings" / "Import settings" for device migration

---

## Cross-Cutting Improvements

### 32. Guru Presence System
**Current Flow**: Idle detection → Contextual messages → Pulse animation

**Usability Issues**:
- Messages can feel random
- No user control over frequency
- Can't dismiss messages

**Improvements**:
- **Frequency slider**: "Guru presence: Rare / Normal / Frequent / Off"
- **Message categories**: Toggle motivational vs factual vs humorous
- **Custom guru**: Upload avatar/name for personalized presence
- **Mute duration**: "Don't show messages for next 30 mins"
- **Message history**: "What did Guru say 10 mins ago?"

### 33. Idle Timer System
**Current Flow**: No interaction detected → Trigger onIdle → Warning or session end

**Usability Issues**:
- Too sensitive for reading/thinking time
- No visual warning before triggering

**Improvements**:
- **Smart idle**: Distinguish "reading" (OK) from "left app" (not OK)
- **Warning countdown**: "Session ending in 10... 9... 8..." with cancel option
- **Idle grace**: First idle = warning only, second idle = action
- **Activity detection**: Use accelerometer to detect if phone is being held
- **Idle override**: "I'm just thinking, don't end session" button

### 34. Visual Timer Component
**Current Flow**: Animated SVG circle showing time remaining

**Usability Issues**:
- Can be hard to read exact time
- No haptic feedback at milestones

**Improvements**:
- **Digital readout**: Toggle between visual and numeric
- **Milestone haptics**: Subtle vibration at 50%, 25%, 10%, 5%, 1 min
- **Color shift**: Green → Yellow → Red as time depletes
- **Break warning**: Visual indicator when break is coming up
- **Custom sounds**: Optional gentle chime at milestones

### 35. Lecture Mode (Tablet/Phone Sync)
**Current Flow**: Detects lecture app → Suggests dual-device mode → Tracks via audio

**Usability Issues**:
- Detection can be slow
- Audio recording quality varies
- No manual "I'm watching a lecture" option

**Improvements**:
- **Manual lecture mode**: "Start lecture session" button in home screen
- **Subject pre-selection**: Pick subject before starting for better tracking
- **Lecture quality feedback**: "Was this lecture detected correctly?"
- **Pause lecture**: Proper pause that doesn't break sync
- **Lecture notes**: Quick notes tied to lecture timestamp
- **Lecture summary**: Post-lecture AI summary of what was covered

### 36. Responsive Design (useResponsive)
**Current Flow**: Basic responsive detection

**Usability Issues**:
- Limited breakpoints
- No landscape orientation support
- Tablet mode not optimized

**Improvements**:
- **Landscape support**: Rotate to landscape for wide content (tables, charts)
- **Tablet optimization**: Two-column layout on tablets
- **Foldable support**: Adapt to foldable screen states
- **Font scaling**: Respect system font size preferences
- **Safe area**: Better handling of notches and dynamic islands

### 37. XP Bar & Progress Visualization
**Current Flow**: Horizontal bar showing XP progress

**Usability Issues**:
- Level transitions not visible
- No XP source breakdown

**Improvements**:
- **Level number**: Show "Level 7" prominently
- **XP tooltip**: Tap bar to see breakdown
- **Comparison**: "You're 200 XP behind your friend [Name]"
- **Next reward**: "350 XP until next title: Senior Medical Student"
- **Animation**: Smooth fill animation when earning XP

### 38. Error Boundary
**Current Flow**: Catches errors → Shows fallback UI

**Usability Issues**:
- Generic error message
- No recovery path
- Can't report error

**Improvements**:
- **Friendly error**: "Something went wrong, but your data is safe"
- **Recovery options**: "Go Home" / "Restart" / "Safe Mode"
- **Error reporting**: "Send error report" with optional description
- **Recent actions**: "This happened after: [list of recent actions]"
- **Auto-recovery**: Try resetting component state before full crash

---

## Implementation Priority

### Quick Wins (1-2 days each)
1. Add duration presets to Manual Log
2. Make Study Plan rows actionable
3. Add search filters to Notes Search
4. Add skip option to breathing in Inertia
5. Add "Quick Start" to CheckIn
6. Add progress indicator to Wake Up
7. Add proper labels to External Tools Row

### Medium Effort (3-5 days each)
1. Guru presence frequency control
2. Idle timer sensitivity settings
3. Session phase indicator
4. AI content type selector
5. Boss battle answer explanations
6. Streak recovery system
7. Notification granular controls

### Larger Projects (1-2 weeks each)
1. Full settings reorganization with search
2. Tablet/landscape responsive redesign
3. Offline AI content caching system
4. Smart notification scheduling
5. Comprehensive analytics dashboard
6. Social/accountability features

---

## Summary

The app has excellent core functionality but could benefit from:
- **More user control**: Settings for sensitivity, frequency, tone
- **Better feedback loops**: Explain why things happen, show progress
- **Gentler defaults**: Less aggressive idle detection, optional breathing skip
- **Contextual intelligence**: Remember preferences, adapt to user patterns
- **Recovery paths**: When things go wrong or users fail, offer redemption
- **Accessibility**: Larger tap targets, voice support, visual alternatives

Focus on making the app feel like a supportive companion rather than a demanding drill sergeant, while keeping the tough-love option for those who want it.
