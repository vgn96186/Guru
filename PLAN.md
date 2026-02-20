# NEET-PG Study App — Full Build Plan

## Purpose
ADHD-friendly AI accountability partner app for INICET May 2026 (~3 months), NEET-PG Aug, INICET Nov.
Core problems: task initiation paralysis, boredom, no accountability.
Solution: An AI that KNOWS you — your mood today, your weaknesses, your exam deadline — and pushes you in novel ways.
Open app → mood check-in → AI adapts the session → studying begins. No decisions needed.

## AI Accountability Partner Features
### Mood-Adaptive Sessions
Daily check-in asks: mood (6 options: 🔥 Energetic | 😊 Good | 😐 Okay | 😴 Tired | 😰 Stressed | 🦋 Distracted)
AI adapts the session plan:
- Energetic → hardest priority topics, deep-dive content
- Good → normal planning
- Okay → mix easy wins + 1 hard topic
- Tired → short session, only mnemonics + stories (no MCQs), topics already seen
- Stressed → breathing tip first, then lightest content, low pressure
- Distracted → 5-question sprint mode only, reward XP at each step

### Novel Study Methods (7 modes, AI selects based on mood)
- keypoints: 6 high-yield bullets + memory hook
- story: clinical vignette embedding the concept
- mnemonic: funny/vivid acronym + expansion
- quiz: 4 NEET-style MCQs
- teach_back: AI asks YOU to explain the topic (you type; AI reacts)
- error_hunt: AI presents a paragraph with 2 wrong facts, you find them
- detective: symptom revealed one by one, you guess the diagnosis

### Push Notifications (expo-notifications)
AI generates personalized accountability messages referencing:
- Your actual weaknesses ("Amyloidosis is your weakest topic — 2 wrong answers")
- Streak status ("Streak breaking in 4 hours! 🔥")
- Exam countdown ("67 days to INICET — Pathology still 40% uncovered")
- Mood-aware messages ("You were tired yesterday. Fresh start today?")
Scheduled: morning reminder + evening nudge + streak-break warning

### AI Companion Persona
Name: "Guru" — a slightly sarcastic but caring AI professor
Tone varies by mood: gentle when stressed, energetic when you're fired up, firm when slacking
References your actual progress (not generic)

## Stack
- Expo SDK ~54, TypeScript, Expo Go (no native builds)
- expo-sqlite ~16 (openDatabaseSync API)
- @react-navigation/native v7 + bottom-tabs + native-stack
- zustand v5
- react-native-reanimated v4 (no babel plugin needed — new arch)
- @expo/vector-icons (Ionicons)
- OpenRouter API: primary=google/gemini-2.0-flash-exp:free, fallback=openai/gpt-4o-mini
- expo-notifications (local push notifications)

## Build Order
1. src/types/index.ts
2. src/constants/syllabus.ts
3. src/constants/gamification.ts
4. src/constants/prompts.ts
5. src/db/schema.ts
6. src/db/database.ts
7. src/db/queries/topics.ts
8. src/db/queries/sessions.ts
9. src/db/queries/progress.ts
10. src/db/queries/aiCache.ts
11. src/services/aiService.ts
12. src/services/sessionPlanner.ts
13. src/services/xpService.ts
14. src/store/useAppStore.ts
15. src/store/useSessionStore.ts
16. src/navigation/types.ts
17. src/navigation/TabNavigator.tsx
18. src/navigation/RootNavigator.tsx
19. src/components/XPBar.tsx
20. src/components/StreakBadge.tsx
21. src/components/TimerBar.tsx
22. src/components/StartButton.tsx
23. src/components/LoadingOrb.tsx
24. src/components/ContentTypeTab.tsx
25. src/components/SubjectCard.tsx
26. src/screens/CheckInScreen.tsx
27. src/screens/HomeScreen.tsx
28. src/screens/SessionScreen.tsx
29. src/screens/QuizScreen.tsx
30. src/screens/SyllabusScreen.tsx
31. src/screens/TopicDetailScreen.tsx
32. src/screens/StatsScreen.tsx
33. src/screens/SettingsScreen.tsx
34. App.tsx (update)
35. app.json (update name/theme)

## Key Architecture

### Zero-Friction Flow
App opens → CheckIn (once/day, auto-advances 3s) → HOME (big pulsing START)
→ tap → SessionScreen (AI plans in background) → agenda reveal (auto-dismissed)
→ Topic 1: Key Points | Story | Mnemonic | Quiz tabs → Done → XP animation
→ Topic 2 (prefetched) → Session end → one-tap log

### Session Planner Algorithm
Score = (inicet_priority * 1.5) + status_boost[status] + confidence_gap*2 - recency_penalty
status_boost: {unseen:10, seen:6, reviewed:3, mastered:0}
recency_penalty: -15 if studied <48h ago
Top 15 candidates → AI picks 2-3 topics + writes focusNote

### SQLite Schema (expo-sqlite v16 — openDatabaseSync)
Tables:
- subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order)
- topics (id, subject_id, name, subtopics TEXT/JSON, estimated_minutes, inicet_priority)
- topic_progress (topic_id PK, status, confidence, last_studied_at, times_studied, xp_earned)
- sessions (id, started_at, ended_at, planned_topics JSON, completed_topics JSON, total_xp, duration_min)
- daily_log (date TEXT PK, checked_in, total_minutes, xp_earned, session_count)
- ai_cache (id, topic_id, content_type, content_json, model_used, created_at, UNIQUE(topic_id, content_type))
- user_profile (id=1, display_name, total_xp, current_level, streak_current, streak_best, daily_goal_minutes, inicet_date, neet_date, preferred_session_length, last_active_date)

### AI Content Types
- keypoints: 6 bullet points + memory hook
- quiz: 4 NEET-style MCQs with explanations
- story: clinical vignette embedding the concept
- mnemonic: funny acronym + expansion + tip

### Gamification
XP: 150 (new topic), 80 (review), 20/quiz correct, 25 (daily checkin), 100 (session complete)
Levels (10): Intern→House Officer→Jr Resident→Sr Resident→Registrar→Specialist→Consultant→Professor→HOD→AIIMS Director
Streak: min 20 min/day counts

### INICET Subject Weights
9: Anatomy, Physiology, Pathology
8: Biochemistry, Microbiology, Pharmacology
6: Medicine, Forensic Medicine
5: OBG, ENT, Ophthalmology, Pediatrics
4: Psychiatry, Dermatology, Orthopedics
3: Radiology, Anesthesia

### OpenRouter API Pattern
POST https://openrouter.ai/api/v1/chat/completions
Headers: Authorization: Bearer <key>, Content-Type: application/json, HTTP-Referer: neet-study-app
Body: { model, messages, temperature:0.7, max_tokens:800, response_format:{type:'json_object'} }
Primary: google/gemini-2.0-flash-exp:free
Fallback: openai/gpt-4o-mini
Cache-first: always check ai_cache before calling API

## Colors (dark theme)
Background: #0F0F14
Card: #1A1A24
Primary (accent): #6C63FF (purple)
Success: #4CAF50
Warning: #FF9800
Danger: #F44336
Text primary: #FFFFFF
Text secondary: #9E9E9E

## Status
- [x] Phase 1: types + constants
- [x] Phase 2: DB layer
- [x] Phase 3: Services
- [x] Phase 4: Navigation + Store
- [x] Phase 5: Components
- [x] Phase 6: Screens
- [x] Phase 7: Wire up App.tsx

## Critical ADHD Features (from user)
- 30-min focus window before mind wanders
- 5-min break = never returns → Break screen must be ACTIVE (mini quiz/mnemonic), NOT blank
- Procrastination trap: menial tasks during breaks
- Solutions:
  1. Break screen = locked countdown + mini activity (1 quiz Q or 1 mnemonic to read)
  2. "Just 10 minutes" entry point on home screen
  3. Lecture mode: watching video → app timer → 30min mark → soft note prompt
  4. Anti-procrastination: "I'll start in X" → app timer holds you accountable
  5. Session can't be dismissed mid-break — back button shows warning

## Advanced ADHD Features (Executive Dysfunction Killers)
1. **Brain Dump (Distraction Pad):** During a session, a floating button allows logging distractive thoughts (e.g., "pay bills") without leaving the session. Saved to a list viewable only after studying.
2. **Focus Audio (Spotify Trap Prevention):** Offline, looping background audio (Brown noise, Rain) directly on the Session Screen to prevent switching to other apps.
3. **Visual "Time Blindness" Timers:** Shrinking circle/pie-chart timers instead of raw text countdowns to convey physical urgency.
4. **Hyperfocus Leverage ("I'm in the Zone"):** When a session ends, offer a button to immediately feed the next topic and skip the break, rewarding with an XP multiplier.
5. **Radical Forgiveness (Anti-Guilt):** If away for 3+ days, Guru switches to "Radical Forgiveness" mode. The app hides broken streaks and offers a 60-second "Micro-Commitment" session (1 question) to gently rebuild the habit.
6. **Deep 3rd-Party App Tracker & Launcher:**
   - Seamlessly launch 3rd-party medical apps (Marrow, DBMCI One, Cerebellum) via deep links (`IntentLauncher` on Android, `Linking` on iOS).
   - "Watch Lecture" or "Solve QBank" options inside Guru will direct users to these native apps but leave a sticky timer notification to track time spent outside Guru.
   - External study time logs back into Guru upon return (using `AppState` tracking).

## Lecture Mode (new feature)
- Home has two buttons: "STUDY SESSION" and "WATCHING LECTURE 📺"
- Lecture mode: big timer counting up, subject selector
- At 30 min: slide-up "Pause & note key point?" (one text field, saves to DB)
- At 35 min (if no note): vibrate + "You paused — what did you learn?"
- Break in lecture mode: 5-min countdown with a quick quiz from that subject
- After break: "Tap to continue lecture" with 3s auto-start countdown

## User's Current Situation
- BTR (Zainab Vora): partially finished, remaining subjects pending
- Bhatia videos: not started
- Marrow PYQs + model questions: needs to do
- High-yield topics they repeatedly forget/get wrong → NEMESIS TOPICS

## Nemesis Topics Feature
- Topic flagged as "Nemesis" if wrong ≥2 times or confidence ≤1 after ≥2 sessions
- Home screen shows nemesis count prominently ("⚔️ 5 topics own you")
- In session planner, nemesis topics are always included if present
- When a nemesis topic is shown, app tries a DIFFERENT content type than last time
  (if keypoints failed → try detective; if that failed → teach_back, etc.)
- Nemesis cleared when: confidence reaches 4+ after 2 consecutive correct sessions

## Intrusive + Addicting Design
- Notification badge count = number of nemesis topics + days until streak breaks
- Push notifications use shame + encouragement alternating:
  - "You've been wrong on Amyloidosis 4 times. Today's the day."
  - "🔥 11-day streak! Don't be the person who breaks it now."
- Variable XP: sometimes random 2x multiplier ("Lucky Day! 🎰")
- "Daily boss fight" notification: one hard nemesis topic, must defeat it today
- Streak freeze available only after 14-day streak (earned, not bought)

## ═══════════════════════════════════════════════════════════════
## PHASE 2: THE DEPRESSION/ADHD OVERHAUL — Making Guru Foolproof
## ═══════════════════════════════════════════════════════════════
##
## Target user: Severe ADHD, executive dysfunction, depression,
## brain fog, doom scrolling, 15-day relapse cycles.
## Traditional gamification (XP, streaks) DOES NOT WORK for this person.
## Needs 6h/day study + PYQs but can't even sit down.
## ═══════════════════════════════════════════════════════════════

---

## System 1: THE RELAPSE PREVENTION ENGINE (The 15-Day Problem)

The #1 failure mode: productive for 1 week → disappears for 15 days → guilt spiral → can't return.
Guru must detect decline BEFORE it happens and intervene at every stage.

### Momentum Tracking (replaces streak as core metric)
- New metric: **Momentum Score** (0-100), calculated from:
  - App opens in last 7 days (even without study)
  - Study minutes trend (increasing/decreasing/flat)
  - Session completion rate
  - Time between sessions
- Momentum is VISIBLE on home screen as a gentle wave animation (not a number)
  - High momentum = smooth flowing wave
  - Low momentum = flat line, but NOT red/scary — just calm
- Momentum NEVER shows as a "broken" or "failed" state

### Decline Detection & Staged Intervention
Track daily: app_opened, minutes_studied, sessions_completed, mood_selected

**Stage 0 — Healthy (0-1 days gap):** Normal operation
**Stage 1 — Wobble (2-3 day gap):**
  - Notification tone shifts: "Hey, no pressure. Just checking in 👋"
  - Home screen simplifies: Hide everything except ONE button
  - Button text: "Just 1 question" (not "Start Session")
  - If they open: "You showed up. That's momentum."
  
**Stage 2 — Sliding (4-7 day gap):**
  - AI generates a personalized "comeback story" notification:
    "Remember Amyloidosis? You nailed that last week. One more like that today?"
  - App opens to **Warm Restart Screen** (not regular home):
    - No stats, no streaks, no numbers
    - Just: "Welcome back. Tap to read one cool thing."
    - One pre-loaded clinical story (cached, no loading wait)
  - Any engagement = "Day 1 of your comeback"
  
**Stage 3 — Gone (8-14 days):**
  - Switch to **Lifeline Mode**:
    - Daily notification at their historically most-active time
    - Content: micro-fact from their strongest subject (confidence boost, not shame)
    - "Did you know? [fact]. You knew this once. Tap to remember."
  - If they open: **Zero-Friction Reentry**
    - Screen shows ONLY a clinical vignette to read (no buttons, no choices)
    - After reading: "Want to try one question about this?" (Yes / Not today)
    - "Not today" is VALID — counts as engagement, resets decline
    
**Stage 4 — Deep Absence (15+ days):**
  - **Radical Reset Protocol:**
    - ALL historical guilt signals hidden (streaks, gaps, missed days)
    - App behaves as if it's Day 1 — fresh, clean, hopeful
    - New check-in: "A lot can change in a day. How are you feeling?"
    - Session planner recalculates from scratch assuming zero momentum
    - First 3 days back: sessions capped at 15 minutes MAX
    - Guru tone: "You came back. That takes more courage than a 30-day streak."
  - Re-enable features gradually over 5 days (not all at once)

### Anti-Guilt Architecture
- NEVER show: "You missed X days", gap counts, declining graphs
- When returning after absence, stats screen shows ONLY:
  - Total topics covered (lifetime, always growing)
  - "You know more than you think"
  - A list of topics they've mastered (confidence boost)
- Streak counter HIDDEN during Stage 2+ (re-appears only after 3 consecutive days back)

---

## System 2: THE MORNING INTERCEPT (Brain Fog Protocol)

The first 30 minutes after waking determine the entire day.
This person wakes foggy, reaches for phone, and doom scrolls into oblivion.
Guru must intercept BEFORE social media.

### Wake-Up Mode
- Triggered by: First app open of the day OR scheduled alarm-time notification
- NOT about studying — about existing and transitioning into the day

**Wake-Up Screen Flow (replaces CheckIn when brain fog detected):**
1. **Breathe** (15 seconds)
   - Expanding/contracting circle animation
   - "Just breathe. Nothing else matters right now."
   - Auto-advances (no tap needed — the person CAN'T make decisions yet)
   
2. **Ground** (10 seconds)
   - "Name 3 things you can see right now."
   - Not interactive — just a prompt. Auto-advances.
   
3. **One Fact** (15 seconds)
   - A pre-cached interesting clinical fact (loaded overnight)
   - "While you were sleeping, your hippocampus was consolidating memories."
   - Disguised as interesting, not as "studying"
   
4. **Gentle Ask**
   - "How foggy are you right now?"
   - Options: ☁️ Very Foggy | 🌥️ A Bit Hazy | 🌤️ Clearing Up | ☀️ Actually Okay
   - This REPLACES the mood check-in on foggy mornings
   
5. **Adaptive Response:**
   - Very Foggy → "No studying today until the fog lifts. Just keep Guru open. I'll check on you in 30 min."
     → Sets a 30-min local notification: "Fog check: any better? Just tap."
     → If they tap: re-ask. If clearing → offer micro-session. If still foggy → "That's okay. Try water + sunlight."
   - A Bit Hazy → "Let's just read one story. No quiz, no pressure."
     → Shows one clinical vignette. After reading: "Want another? Or come back later."
   - Clearing Up → Normal mood check-in flow
   - Actually Okay → Skip to standard CheckIn

### Brain Fog Detection (Automatic)
- If user selects "tired" or "stressed" mood 3+ days in a row → auto-trigger Wake-Up Mode  
- If average daily study time drops below 30min for 3 days → trigger
- If app opened but session not started 3+ times → trigger

---

## System 3: THE DOOM SCROLL INTERCEPTOR

The enemy is not laziness — it's the phone itself.
Instagram/YouTube/Reddit are infinite dopamine loops.
Guru must compete with them, not ignore them.

### Proactive Notification System (Time-Aware)
- Track time since last Guru interaction + time of day
- If it's a historically-active study hour and Guru hasn't been opened:
  - 0 min: Nothing
  - 30 min: "Quick: What drug causes SLE-like syndrome? 🤔" (curiosity hook, not guilt)
  - 60 min: "Your nemesis topic Amyloidosis is laughing at you right now. 30 seconds to shut it up."
  - 90 min: "The exam doesn't care what you did today. But 5 minutes from now, you could know one more thing."
  - 120 min: "[Accountability partner name] studied today. Just saying."

### Notification Content Strategy
- NEVER: "You haven't studied today" (guilt)
- NEVER: "Your streak will break" (anxiety) — unless past Stage 0
- ALWAYS: Curiosity hooks, challenges, or empathetic nudges
- Templates:
  - Curiosity: "What connects Marfan syndrome and aortic dissection? Tap to find out."
  - Challenge: "Can you get this 1 question right? Most people can't."  
  - Empathy: "Bad day? Read one clinical story. It's actually interesting."
  - Social proof: "Students who do 5 questions/day score 40% higher on PYQs."

### When User Opens Guru After Long Phone Use
- Detect: If app open time suggests phone was in use but Guru wasn't
- Response: NO guilt. Instead:
  - "Hey! You're here now. That's what matters."
  - Offer the smallest possible action (1 question, 1 fact)
  - Show a "phone detox timer" — time spent in Guru today vs. estimate of social media time
    (framed positively: "12 minutes of real growth today")

---

## System 4: THE MICRO-COMMITMENT LADDER

"Just 10 minutes" is still too much for someone in full executive dysfunction.
The entry point must be so small it's impossible to say no.

### Dynamic Entry Points (based on absence duration + mood)
The home screen START button text changes based on state:

| State | Button Text | Actual Duration |
|-------|------------|-----------------|
| Healthy, energetic | "START SESSION" | 25-45 min |
| Healthy, tired | "GENTLE SESSION" | 15-20 min |
| 1-2 day gap | "Just 5 Minutes" | 5 min |
| 3-5 day gap | "Just 1 Question" | 30 seconds |
| 6+ day gap | "Read Something Cool" | 1 min read |
| Opened 3x without starting | "Tap. That's It." | Shows 1 fact, done |
| Brain fog detected | "I'll Do Everything" | AI reads content aloud (TTS), user just listens |

### The Escalation Trick
- Start with the micro-commitment
- After completion: "Nice. Want one more?" (not "Continue Session")
- After 3 completions: "You've been here 4 minutes. Want to make it 10?"
- After 10 min: "You're in flow. Keep going?" with timer showing
- NEVER force the upgrade — every "Not now" is respected
- Each micro-completion is celebrated individually

### The "Impossible No" Design
- When someone opens the app in Stage 2+:
  - Screen is ONE card with text. Nothing else.
  - No navigation, no buttons, no choices
  - Just: a clinical fact + "Tap anywhere to see another"
  - After 3 taps: "That's 3 things you know now. Want a question?" 
  - This bypasses the executive function needed to "decide to study"

---

## System 5: DEPRESSION-AWARE MODE

Current mood system doesn't capture "I literally cannot function today."
Need a mode that acknowledges depression without pathologizing.

### New Mood Option
Add to check-in: 🌑 "I Can't Today"
- Response: "That's okay. You opened the app. That counts."
- Marks the day as "showed up" (not "missed")
- Offers:
  1. "Want to just read one interesting thing?" (clinical story)
  2. "Want me to check on you in 2 hours?" (sets notification)
  3. "Talk to someone" → Shows helpline numbers (iCall, Vandrevala Foundation)
- If selected 3+ days in a row:
  - Guru shifts tone: "I've noticed it's been really hard lately. You're not alone."
  - Offers: "Would it help to talk to a professional? Here are resources."
  - App behavior: Ultra-simplified for next 7 days even if mood improves
  - Daily micro-notification: "You exist. That matters. If you can, just open me."

### Anhedonia-Proof Motivation (Replacing Gamification)
Traditional XP and streaks don't work because this person can't feel reward.
Replace dopamine-based motivation with MEANING-based motivation:

**Show "Exam Readiness" instead of XP:**
- "You can now answer questions on 34% of high-yield INICET topics"
- "If INICET were today, you'd likely score ~180/400 → your target: 220"
- This creates CONCRETE progress toward a real goal (not abstract points)

**Show "Knowledge Graph" instead of levels:**
- Visual web of topics: bright = confident, dim = unseen
- Watching it light up over weeks is motivating even to anhedonic brains
- Because it represents REAL competence, not artificial rewards

**"Future You" Letters:**
- Weekly prompt: AI generates a short message FROM the user's future self
- "Hey, it's you from INICET day. You studied Pharma last week. It showed up. Thank you."
- Grounded in actual progress, not generic motivation

**PYQ Reality Check (fear-based, used sparingly):**
- Once a week: "This question appeared in INICET 2024. Can you answer it?"
- If right: "You would have scored this mark. Keep going."
- If wrong: "This is exactly why we study this. Let's learn it now."
- Makes the exam feel REAL and CLOSE, not abstract

---

## System 6: THE BODY DOUBLING COMPANION

ADHD brains work better when someone else is "present."
Guru becomes a virtual study companion, not just a tool.

### During-Session Companion
- Every 8-10 minutes during study: Gentle message appears at top of screen
  - "I'm here. Minute 12. You're doing great."
  - "Still with you. This topic is important — it appeared in INICET 2023."
  - "Halfway there. Your brain is literally rewiring right now."
- Messages are NON-INTRUSIVE (small banner, auto-dismiss after 3s)
- Can be toggled off in Settings

### Post-Session Debrief (Emotional, Not Just Stats)
- After each session, instead of just XP:
  - "You studied for 23 minutes today, even though you didn't want to."
  - "That's 23 minutes your competition didn't get."
  - "Tomorrow, Guru will remember this. You showed up."
- Saves a "journal entry" that can be reviewed later

### Guru's Daily Voice (Morning, Noon, Night)
- Morning: Motivational (based on momentum)
  - High momentum: "Day 8. You're building something. Don't stop."
  - Low momentum: "New day. New chance. Just open me."
- Midday: Check-in
  - "It's 2pm. Have you started yet? If not, here's one question."
- Night: Reflection  
  - "Today you covered [topic]. Sleep well — your brain is filing it away."
  - If no study: "Today was hard. Tomorrow has no memory of today. Fresh start."

---

## System 7: ENVIRONMENT TRANSITION SCAFFOLDING

Executive dysfunction means the TRANSITION from "not doing" to "doing" is impossible.
The app must walk through the physical act of starting.

### "Set Up" Mode (Pre-Study Ritual)
When user taps Start but hasn't studied in 2+ days:
1. "Step 1: Put your phone on the table. ✓ Tap when done."
2. "Step 2: Open your notebook or laptop. ✓ Tap when done."
3. "Step 3: Pour a glass of water. ✓ Tap when done."
4. "Step 4: Take 3 deep breaths."
   → Breathing animation plays
5. "You're set up. The hardest part is done. Starting in 3... 2... 1..."
   → Session auto-begins

- Each step awards 5 XP (yes, even setting up counts)
- After 5 consecutive days of studying, setup mode auto-skips
- Can be re-enabled manually: "I need the ritual today"

### Task Initiation Bypasses
For moments when even the setup is too much:
- **"Surprise Me"** button: No choices at all. AI picks topic, mode, everything.
  User just reads/answers what appears. Zero cognitive load.
- **"Background Study"** mode: TTS reads key points while user does nothing.
  They can be lying in bed. It still counts as exposure.
- **"Walk & Learn"** mode: Audio-only clinical stories.
  "Go for a 10-min walk. Guru will tell you stories."

---

## System 8: PYQ INTEGRATION (Previous Year Questions)

User specifically needs PYQ practice. Make it frictionless and addictive.

### PYQ Sprint Mode
- Prominent button on home: "🎯 PYQ Sprint"
- Pulls 10 questions from topics user has covered
- Timed: 90 seconds per question (like real exam)
- After each: instant explanation + "This appeared in [INICET 2023 / NEET PG 2024]"
- Score shown as: "You'd have secured 6/10 marks from these topics"

### PYQ Topic Tagging
- Every topic in syllabus tagged with:
  - Number of times asked in last 5 years
  - Which exams (INICET / NEET PG / FMGE)
  - Frequency trend (increasing / stable / rare)
- Home screen: "📊 Most Asked This Decade: [topic list]"

### Smart PYQ Scheduling  
- After completing a topic's content → automatically queue 5 PYQs from that topic
- Spaced repetition for PYQs: wrong answers return in 1 day, 3 days, 7 days
- Weekly "PYQ Mock": 50 questions across all covered subjects, timed, scored

### "Exam Simulator" Notifications
- Random times during the day: Push notification with a PYQ
- "INICET 2023 Q47: A 45-year-old patient presents with... [Tap to answer]"
- Creates exam-like urgency + micro-practice throughout the day

---

## System 9: COGNITIVE LOAD ELIMINATION

Brain fog + ADHD = decision-making is the enemy.
Every choice the app presents is a chance for the user to freeze and leave.

### One-Button Home (Dynamic)
- When brain fog or low momentum detected:
  - Home screen becomes ONE button filling the screen
  - No navigation bar, no stats, no scrolling
  - Just a pulsing circle: "Tap"
  - Tapping loads the most appropriate micro-action
- Normal home screen re-appears after 3 days of healthy engagement

### Decision Elimination
-  AI makes ALL choices during low-momentum periods:
  - Which topic to study
  - Which content type to show
  - When to take a break
  - When to switch topics
  - When to end the session
- User's only input: "Next" or "I'm done"
- This is the DEFAULT for tired/stressed/distracted moods

### Pre-Loading Everything
- Cache tomorrow's content every night at midnight
- When user opens app: ZERO loading screens
- Content appears INSTANTLY (loading screens = dropout moments)
- If cache miss: show a pre-loaded fallback while fetching in background

---

## System 10: THE ACCOUNTABILITY PACT (Optional Social Feature)

For those who want external accountability.

### Study Buddy Link
- Generate a shareable link for one trusted person (parent, friend, partner)
- That person gets a simple weekly report:
  - "This week: 4 days active, 180 minutes total, 12 topics covered"
  - NO negative framing, ever
- Optional: Buddy can send encouragement through the link (one-way messages)

### "Promise Contract"
- Setting: "I promise to study [X] minutes today"
- If kept: "You kept your word. That matters more than XP."
- If broken: No punishment. Next day: "Yesterday's promise didn't work out. Want to try a smaller one?"
- Trend visible: "You've kept 8/12 promises this month"

### Accountability Notifications to Self  
- Record a voice note to yourself on a good day
- On bad days, play it back: "Hey, it's you from Tuesday. You felt great after studying Pharma. Do it again."
- Text version: Write a letter to "bad-day you" during setup

---

## System 11: CIRCADIAN-AWARE SCHEDULING

### Learn When You Actually Study
- Track: what time sessions actually happen (not when planned)
- After 2 weeks: identify productive windows
- "You're most productive between 9-11pm. Schedule hard topics then."
- "Your mornings are foggy — only light reviews before noon."

### Adaptive Notifications
- Don't send study reminders at 7am if user never studies before 10am
- Send the "Start?" nudge at their historically most-likely-to-start time
- If user studies at unusual time: "Late night session? Extra XP for dedication. 🦉"

### Energy-Matched Content
- Morning (if foggy): Stories, mnemonics, light reading
- Afternoon (post-lunch dip): Interactive quizzes to keep alert  
- Peak hours: Hard topics, detective mode, teach-back
- Late night: Review of today's topics, spaced repetition cards

---

## System 12: ANTI-PERFECTIONISM ENGINE

"If I can't do 6 hours, I'll do 0" — the all-or-nothing trap.

### Dynamic Goal Reframing
- Daily goal: 6 hours (360 min)
- If by 6pm, 0 minutes done:
  - DON'T show: "0/360 minutes (0%)" ← this causes shutdown
  - DO show: "Even 15 minutes changes your brain. Start with that."
- If 45 min done: 
  - DON'T show: "45/360 (12.5%)" ← feels like failure
  - DO show: "45 minutes of focused study done! That's 3 topics covered."
- Always frame in ABSOLUTE gains, never percentage of ambitious goal

### "Imperfect Action" Celebrations
- 5 min studied: "5 minutes > 0 minutes. Always."
- 15 min: "You covered more than nothing. That compounds."
- 30 min: "That's one topic solidified. Real progress."
- 60 min: "Solid hour. You're in the top 30% of aspirants today."
- 120 min: Boss-level celebration
- The celebrations are NON-COMPARATIVE (not "you're behind" or "catch up")

### Flexible Daily Targets
- Instead of one 6-hour block:
  - "Study in 3 blocks of 45 minutes. Leave the rest flexible."
  - App suggests: "Block 1: morning. Block 2: afternoon. Block 3: evening."
  - Each block is independent — missing Block 1 doesn't affect Block 2
  - "Block 2 starts fresh. Block 1 doesn't matter anymore."

---

## System 13: EMERGENCY INTERVENTIONS

### SOS Button (Always Visible)
- Floating button in corner: "🆘"
- Tap → immediate:
  1. Breathing exercise (box breathing, 60 seconds)
  2. One grounding prompt
  3. Then: "Want to try just 1 question? Or close the app — both are fine."
- If SOS used 3+ times in a week:
  - "It sounds like things are really tough. Would talking to someone help?"
  - iCall: 9152987821
  - Vandrevala Foundation: 1860-2662-345
  - "There's no shame in asking for help. Even doctors need doctors."

### "Everything Feels Impossible" Mode
- Activated by SOS or by selecting 🌑 mood
- App becomes radically simple:
  - Black screen, white text, no animations
  - One line: a clinical fact or an encouraging message
  - Tap to see another. Or close.
  - No studying required. Just... existing with the app open.
- This mode still logs "app engagement" — which feeds back into momentum

### Guilt Spiral Interceptor
- Detect: User opens app → sees stats → immediately closes (pattern repeated)
- Response: Next open, stats are HIDDEN
  - "Let's skip the numbers today. Want to learn something interesting?"
  - Stats only return when user actively navigates to them

---

## System 14: SMART SESSION ARCHITECTURE (6-Hour Days)

### Making 6 Hours Actually Achievable
The person can't do 6 hours in one sitting. Design for reality:

**The Pomodoro+ System (ADHD-adapted):**
- Study block: 25 min (not 30 — ADHD attention drops at 25)  
- Active break: 5 min (quiz question or mnemonic, NOT blank)
- After 4 blocks (2 hours): 15-min movement break
  - "Stand up. Walk to the kitchen. Drink water. Come back."
  - Timer runs during movement break — it's REAL break time
- After 8 blocks (4 hours): 30-min real break
  - "You've done 4 hours. Take a real break. I'll be here."
- After 12 blocks (6 hours): "CHAMPION. You did it. 🏆"

**Session Variety (Fight ADHD Boredom):**
- Every 25-min block uses a DIFFERENT content type:
  - Block 1: Key Points (warm-up)
  - Block 2: Clinical Story
  - Block 3: Detective Mode (interactive)
  - Block 4: PYQ Sprint
  - Block 5: Teach-Back
  - Block 6: Error Hunt
  - Block 7: Mnemonic Speed Round
  - Block 8: PYQ Mock (timed, exam-like)
- NEVER two blocks of the same type in a row
- Subject rotates every 2 blocks (boredom prevention)

**Re-Entry After Mid-Day Break:**
- Going to eat lunch? "I'll save your place. Tap when you're back."
- 2 hours later, notification: "Ready to continue? Block 5 is queued up."
- If no return by evening: "Plans change. Even 4 blocks today was huge."

---

## NEW DB ADDITIONS

### Tables to Add
```sql
-- Momentum tracking
CREATE TABLE momentum_log (
  date TEXT PRIMARY KEY,
  app_opened INTEGER DEFAULT 0,
  minutes_studied INTEGER DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  mood TEXT,
  momentum_score REAL DEFAULT 50,
  decline_stage INTEGER DEFAULT 0,  -- 0-4
  fog_level TEXT,  -- 'clear' | 'hazy' | 'foggy' | 'severe'
  sos_used INTEGER DEFAULT 0
);

-- Promise / accountability
CREATE TABLE promises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  promised_minutes INTEGER NOT NULL,
  actual_minutes INTEGER DEFAULT 0,
  kept INTEGER DEFAULT 0  -- boolean
);

-- Self-recorded motivation
CREATE TABLE motivation_vault (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,  -- 'text' | 'voice_uri' | 'future_letter'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_count INTEGER DEFAULT 0
);

-- PYQ tracking
CREATE TABLE pyq_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  question_hash TEXT NOT NULL,
  correct INTEGER NOT NULL,
  attempted_at TEXT NOT NULL,
  next_review_date TEXT,
  exam_source TEXT,  -- 'INICET 2023', 'NEET PG 2024', etc.
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

-- Productive hours learning
CREATE TABLE activity_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,  -- 0-23
  minutes_studied INTEGER DEFAULT 0,
  session_started INTEGER DEFAULT 0  -- boolean
);

-- Companion messages log
CREATE TABLE companion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'encouragement' | 'checkin' | 'reflection' | 'sos_response'
  shown_at TEXT NOT NULL,
  context TEXT  -- JSON: mood, momentum, etc.
);
```

### New User Profile Fields
```sql
ALTER TABLE user_profile ADD COLUMN momentum_score REAL DEFAULT 50;
ALTER TABLE user_profile ADD COLUMN decline_stage INTEGER DEFAULT 0;
ALTER TABLE user_profile ADD COLUMN last_fog_level TEXT DEFAULT 'clear';
ALTER TABLE user_profile ADD COLUMN peak_study_hour INTEGER DEFAULT 21;
ALTER TABLE user_profile ADD COLUMN setup_ritual_enabled INTEGER DEFAULT 1;
ALTER TABLE user_profile ADD COLUMN companion_messages_enabled INTEGER DEFAULT 1;
ALTER TABLE user_profile ADD COLUMN depression_mode_active INTEGER DEFAULT 0;
ALTER TABLE user_profile ADD COLUMN accountability_buddy_id TEXT;
ALTER TABLE user_profile ADD COLUMN why_i_study TEXT DEFAULT '';
ALTER TABLE user_profile ADD COLUMN voice_note_uri TEXT;
ALTER TABLE user_profile ADD COLUMN exam_readiness_score REAL DEFAULT 0;
ALTER TABLE user_profile ADD COLUMN preferred_block_length INTEGER DEFAULT 25;
ALTER TABLE user_profile ADD COLUMN daily_blocks_target INTEGER DEFAULT 12;
```

---

## NEW SCREENS

### WakeUpScreen.tsx
- Breathe → Ground → One Fact → Fog Check → Adaptive routing
- Auto-advancing, minimal interaction required

### ComebackScreen.tsx  
- For Stage 2-4 re-entry
- No stats, no guilt, just one clinical story
- "Welcome back" → micro-engagement → optional escalation

### SOSScreen.tsx
- Breathing exercise → grounding → optional micro-study
- Mental health resources if pattern detected

### PYQSprintScreen.tsx
- 10 PYQs, timed, exam-tagged
- Score as "marks you'd earn"

### SetupRitualScreen.tsx
- Physical environment preparation walkthrough
- Step-by-step with taps

### ExamReadinessScreen.tsx
- Knowledge graph visualization
- Subject coverage percentages
- "If exam were today" projection
- Replaces XP as primary progress indicator

### DailyBlocksScreen.tsx
- Visual grid of 12 blocks for the day
- Each block: tap to start, shows content type
- Completed blocks light up
- Missed blocks don't show as "missed" — just unlocked

---

## NEW SERVICES

### momentumService.ts
- calculateMomentum(last7Days) → 0-100
- detectDeclineStage(momentumLog) → 0-4
- getInterventionForStage(stage) → notification content + UI changes

### circadianService.ts
- trackActivityHour(hour, minutes)
- getPeakHours() → number[]
- getEnergyMatchedContent(hour, mood) → ContentType

### comebackService.ts
- getComebackContent(declineStage, topTopics) → pre-cached story/fact
- generateFutureYouLetter(progressData) → string
- getMotivationFromVault(context) → MotivationEntry

### pyqService.ts
- getPYQsForTopic(topicId, count) → Question[]
- schedulePYQReview(topicId, wrongQuestions)
- getExamReadinessScore(allProgress) → { score, percentile, projection }

---

## NOTIFICATION OVERHAUL

### Current Problem
Notifications are generic and guilt-based. Need to be:
1. Curiosity-driven ("What connects X and Y?")
2. Stage-appropriate (no "streak breaking!" during depression)
3. Timed to actual productive hours
4. Personalized to actual weak topics

### New Notification Categories
1. **Curiosity Hook** (for doom scrollers): "Quick — what drug causes SLE-like syndrome?"
2. **Empathetic Nudge** (for depression): "Bad day? I have one cool story for you."
3. **Exam Reality** (weekly): "This topic appeared 4 times in last 5 INICETs. You haven't covered it."
4. **Companion Check-in** (during study): "Still here with you. Minute 15."
5. **Comeback Whisper** (for Stage 2+): "Your strongest topic is calling. Just one question?"
6. **PYQ Challenge** (random): Actual question in notification body
7. **Future You** (weekly): AI letter from post-exam self

### Notification Suppression Rules
- Depression mode: ONLY empathetic nudges (categories 2, 5)
- Stage 3+: Max 1 notification/day (not 3)
- Never send guilt-based content when momentum < 20
- Never mention streaks when streak = 0

---

## IMPLEMENTATION PRIORITY

### Phase 2A (Critical — The Relapse Engine)
1. momentum_log table + momentumService.ts
2. Decline detection in app open flow
3. ComebackScreen.tsx
4. Dynamic home button text
5. Anti-guilt stat hiding

### Phase 2B (Morning + Depression)
6. WakeUpScreen.tsx + fog check
7. 🌑 "I Can't Today" mood
8. Depression-aware notification suppression
9. SOSScreen.tsx + mental health resources

### Phase 2C (Micro-Commitments + Scaffolding)  
10. Micro-commitment ladder (dynamic entry points)
11. SetupRitualScreen.tsx
12. "Surprise Me" zero-decision mode
13. Pre-caching overnight content

### Phase 2D (PYQ + Exam Readiness)
14. PYQ data integration + pyqService.ts
15. PYQSprintScreen.tsx
16. ExamReadinessScreen.tsx (knowledge graph)
17. Exam simulator notifications

### Phase 2E (Companion + Circadian)
18. Body doubling messages during sessions
19. circadianService.ts + productive hour tracking
20. Post-session emotional debrief
21. "Future You" letter generation

### Phase 2F (Accountability + Polish)
22. Promise system
23. Motivation vault (why I study)
24. Study buddy link (optional)
25. DailyBlocksScreen.tsx for 6-hour days

---

## CORE DESIGN PRINCIPLES (Phase 2)

1. **ZERO GUILT**: The app NEVER makes the user feel bad. Absence is normal. Return is celebrated.
2. **ZERO DECISIONS**: When brain is foggy, AI decides everything. User only taps.
3. **MICRO FIRST**: Always offer the smallest possible action. Escalate only with consent.
4. **MEANING > POINTS**: Show exam readiness, not XP. Show knowledge, not streaks.
5. **COMPANION > TOOL**: Guru talks like a caring mentor, not a productivity app.
6. **INTERCEPT > REMIND**: Don't remind to study. Intercept doom scrolling with curiosity.
7. **FORGIVE > PUNISH**: Every return is Day 1. Every attempt is celebrated.
8. **REAL > ABSTRACT**: "This appeared in INICET 2023" hits harder than "+50 XP".

---

## Build Complete (Phase 1)
- [x] All 34 source files created
- [x] TypeScript: CLEAN
- [x] 267K src/ total

## Phase 2 Status
- [ ] Phase 2A: Relapse Prevention Engine
- [ ] Phase 2B: Morning + Depression Systems
- [ ] Phase 2C: Micro-Commitments + Scaffolding
- [ ] Phase 2D: PYQ + Exam Readiness
- [ ] Phase 2E: Companion + Circadian
- [ ] Phase 2F: Accountability + Polish

## To run
1. Install Expo Go from Play Store
2. cd ~/neet_study && npx expo start
3. Scan QR with Expo Go on the same phone
4. Go to Settings tab → add OpenRouter API key → tap Save
5. App will schedule Guru notifications automatically
