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
- [ ] Phase 1: types + constants
- [ ] Phase 2: DB layer
- [ ] Phase 3: Services
- [ ] Phase 4: Navigation + Store
- [ ] Phase 5: Components
- [ ] Phase 6: Screens
- [ ] Phase 7: Wire up App.tsx

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

## Build Complete
- [x] All 34 source files created
- [x] TypeScript: CLEAN
- [x] 267K src/ total

## To run
1. Install Expo Go from Play Store
2. cd ~/neet_study && npx expo start
3. Scan QR with Expo Go on the same phone
4. Go to Settings tab → add OpenRouter API key → tap Save
5. App will schedule Guru notifications automatically
