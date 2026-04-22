# Futuristic Features Implementation Plan (Guru)

## Goal

Ship a "next-level" ADHD-first AI study experience by adding predictive, multimodal, and proactive features on top of the current Guru architecture.

## Time Horizon

- Total: 8 weeks
- Cadence: 4 phases, 2 weeks each
- Release model: feature flags + staged rollout to internal testers first

## North-Star Outcomes

- Increase daily active study minutes by >= 25%
- Increase 7-day retention by >= 15%
- Improve quiz accuracy in weak topics by >= 12%
- Reduce doomscroll interruptions per user/day by >= 20%

## Phase 1 (Weeks 1-2): Personal AI Study Twin (MVP)

### What to Build

- Add a proactive AI planner that:
  - reads topic progress and recent sessions
  - proposes a daily plan with time blocks
  - replans when user skips or delays tasks
- Add a "Today by Guru" card on Home with:
  - next task
  - why it was chosen
  - one-click start

### Code Areas

- `src/services/aiService.ts`
  - add `generateDailyPlanWithRouting()`
  - add `replanDayWithRouting()`
- `src/store/useAppStore.ts`
  - store `todayPlan`, `planGeneratedAt`, `planVersion`
- `src/screens/HomeScreen.tsx`
  - show "Today by Guru" module

### Data/Schema

- Add table `daily_plan`:
  - `id`, `date`, `plan_json`, `source`, `created_at`, `updated_at`
- Add table `plan_events`:
  - `id`, `date`, `event_type`, `payload_json`, `created_at`

### Acceptance Criteria

- Plan can be generated in <= 4s on cloud path
- Replan works when user marks task as missed
- Plan survives app restart (DB-backed)

## Phase 2 (Weeks 3-4): Real-Time Lecture Copilot

### What to Build

- During transcription flow, generate:
  - live key points
  - likely exam-style questions
  - confidence marker for extracted concepts
- Display lecture insights in-session and save post-session digest

### Code Areas

- `src/services/transcriptionService.ts`
  - pipe transcript chunks to structured insight extraction
- `src/services/aiService.ts`
  - add `generateLectureCopilotInsights()`
- `src/screens/LectureModeScreen.tsx` (or current lecture screen)
  - add live insight panel
- `src/db/queries/aiCache.ts`
  - cache insight payloads by lecture/session

### Data/Schema

- Add table `lecture_insights`:
  - `id`, `session_id`, `timestamp_ms`, `insight_type`, `content_json`, `created_at`

### Acceptance Criteria

- Insight latency <= 15s per chunk on cloud
- No crash when connectivity drops (graceful fallback)
- At least one insight digest saved per completed lecture session

## Phase 3 (Weeks 5-6): Adaptive Difficulty Engine

### What to Build

- Adaptive quizzing that changes difficulty every 2-3 questions using:
  - recent correctness
  - response time
  - confidence trend
- Add weak-topic battle mode powered by prior mistakes

### Code Areas

- `src/services/aiService.ts`
  - add `generateAdaptiveQuizSet()`
- `src/db/queries/progress.ts`
  - read/write user question performance stats
- `src/screens/SessionScreen.tsx`
  - integrate adaptive quiz loop

### Data/Schema

- Add table `question_attempts`:
  - `id`, `topic_id`, `difficulty`, `correct`, `response_ms`, `confidence`, `created_at`
- Add derived view/materialized logic for weak-topic clusters

### Acceptance Criteria

- Difficulty visibly shifts based on user performance
- Quiz engine never serves empty set; has fallback path
- Weak-topic mode pulls from last 14 days of mistakes

## Phase 4 (Weeks 7-8): Predictive Burnout + Hybrid RAG

### What to Build

- Burnout/relapse risk predictor (rule-based first, ML-ready later):
  - fragmented session patterns
  - late-night usage
  - repeated context switching
- Hybrid RAG response stack:
  - retrieve from `topic_progress`, lecture notes, and AI cache
  - answer with citation-aware snippets

### Code Areas

- `src/services/deviceSyncService.ts`
  - feed cross-device interruption events to risk engine
- `src/services/aiService.ts`
  - add retrieval + grounded response pipeline
- `src/db/queries/aiCache.ts`
  - retrieval helpers (topic and time-window filtered)
- `src/screens/HomeScreen.tsx`
  - show risk-aware intervention card

### Data/Schema

- Add table `focus_risk_events`:
  - `id`, `risk_score`, `risk_factors_json`, `intervention_shown`, `created_at`
- Add retrieval metadata fields to `ai_cache` if needed:
  - `embedding_key`, `source_type`, `source_ref`

### Acceptance Criteria

- Risk score updates daily and after major interruptions
- RAG answers are grounded in user data when available
- Interventions trigger before a doomscroll event in >= 30% of cases

## Cross-Cutting Workstreams

### Feature Flags

- Add per-feature toggles in profile/settings:
  - `enableStudyTwin`
  - `enableLectureCopilot`
  - `enableAdaptiveQuiz`
  - `enableFocusPredictor`
  - `enableHybridRag`

### Privacy + Safety

- Keep sensitive inference on-device where practical
- Minimize raw transcript retention windows
- Add clear user controls for data deletion and AI personalization reset

### Reliability

- Offline-first fallback for all major flows
- Queue AI jobs during connectivity loss, replay later
- Add timeout and retry envelopes for each new AI endpoint

### Testing

- Unit tests:
  - planning, adaptive difficulty, risk score logic
- Integration tests:
  - lecture chunk -> insight persistence
  - plan generation -> UI card render
- Regression checks:
  - no breakage in existing `markTopicsFromLecture()` updates

## Delivery Milestones

- End of Week 2: Study Twin pilot in Home
- End of Week 4: Real-Time Lecture Copilot beta
- End of Week 6: Adaptive Quiz v1 in sessions
- End of Week 8: Focus Predictor + Hybrid RAG pilot

## Suggested Execution Order This Week

1. Add new DB tables + migrations (`schema.ts`, `database.ts`)
2. Implement Study Twin service APIs (`aiService.ts`)
3. Wire `todayPlan` into Zustand (`useAppStore.ts`)
4. Render "Today by Guru" card (`HomeScreen.tsx`)
5. Add tests for plan generation and persistence

## Risks and Mitigations

- AI latency spikes -> mitigate with caching + fallback model chain
- Over-personalization fatigue -> allow strict/manual mode switch
- Schema growth complexity -> isolate query helpers by domain
- Notification burnout -> cap proactive nudges per day

## Definition of Done (Per Feature)

- Feature flag-gated
- DB-backed state with migration
- Unit tests pass
- No new lint errors in touched files
- Clear rollback path
