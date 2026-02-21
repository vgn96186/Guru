# Guru App — Session Progress Log
Last updated: 2026-02-21 (Session 2)

---

## Project Overview
**Guru** is a React Native / Expo medical study app for NEET/INICET prep.
- Located at: `/root/.claude/Guru/`
- Stack: Expo (bare), expo-sqlite, Zustand, Gemini API
- 18 medical subjects, 3-level topic hierarchy, SRS (SM-2 inspired), XP/gamification, AI quiz/keypoints

---

## What Was Built Across These Sessions

### 1. LectureReturnSheet Quiz Phase
**File:** `src/components/LectureReturnSheet.tsx`

Added a quiz phase at the end of external lecture sessions (Cerebellum, Marrow, etc.):
- Phases: `'intro' | 'transcribing' | 'results' | 'quiz' | 'quiz_done' | 'error'`
- After transcription → shows results → two buttons:
  - "🧠 Mark + Test Yourself" → triggers quiz
  - "✓ Mark as Studied" → skips quiz
- Quiz: 3 MCQs generated via `catalyzeTranscript()` using pseudo-transcript from analysis
- Quiz generates in background during results phase (no UX blocking)
- Quiz done: emoji (🏆/🎯/📚) + bonus XP at +15 per correct answer via `addXp(score * 15)`

### 2. Critical SRS Bug Fixed
**File:** `src/db/queries/topics.ts`

`TOPIC_SELECT` was missing `p.wrong_count, p.is_nemesis` — entire nemesis system was silently broken.
- Fixed in 3 query paths: `TOPIC_SELECT`, `getTopicsBySubject()`, `getTopicsDueForReview()`
- Added `ORDER BY p.is_nemesis DESC` to review queue so nemesis topics surface first

### 3. Database Always-run SeedTopics Fix
**File:** `src/db/database.ts`

`seedTopics()` previously only ran on first install. New subtopics never reached existing users.
- Fixed: `seedTopics()` now always runs on boot (INSERT OR IGNORE is safe/idempotent)
- Force-wipe only happens when `forceSeed=true`

### 4. Vault Topics Cleanup
**File:** `src/constants/vaultTopics.ts`

Cleaned junk Obsidian import data:
- Removed: `_Archive`, questions-as-topics, MOC filenames
- Merged duplicates: Cardiovascular/Cardiovascular Physiology → single entry, etc.
- Renamed ambiguous entries for clarity

### 5. Full Syllabus Expansion — ALL 18 SUBJECTS COMPLETE ✅
**File:** `src/constants/syllabus.ts`

Expanded from ~50 topics to **1438 lines** with full 3-level hierarchy.
Every topic is now split into focused 12–20 min subtopics (ADHD-friendly).

| Subject ID | Subject | Status |
|------------|---------|--------|
| 1 | Anatomy | ✅ Full 3-level |
| 2 | Physiology | ✅ Full 3-level |
| 3 | Biochemistry | ✅ Full 3-level |
| 4 | Pathology | ✅ Full 3-level |
| 5 | Microbiology | ✅ Full 3-level |
| 6 | Pharmacology | ✅ Full 3-level |
| 7 | Forensic Medicine | ✅ Added from scratch (was missing) |
| 8 | Medicine | ✅ Full 3-level |
| 9 | Surgery | ✅ Full 3-level |
| 10 | OBG | ✅ Full 3-level |
| 11 | Pediatrics | ✅ Full 3-level |
| 12 | Orthopedics | ✅ Full 3-level |
| 13 | Ophthalmology | ✅ Full 3-level |
| 14 | ENT | ✅ Full 3-level |
| 15 | Psychiatry | ✅ Full 3-level |
| 16 | Dermatology | ✅ Full 3-level |
| 17 | Radiology | ✅ Full 3-level |
| 18 | Anesthesia | ✅ Full 3-level |
| 19 | Community Medicine / PSM | ✅ Full 3-level (added Session 2) |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/constants/syllabus.ts` | All 18-subject topic tree (1438 lines) |
| `src/constants/vaultTopics.ts` | Obsidian vault import (pre-learned topics) |
| `src/db/database.ts` | DB init, migrations, seeding |
| `src/db/queries/topics.ts` | All topic/progress queries |
| `src/db/queries/aiCache.ts` | AI response caching |
| `src/db/schema.ts` | SQLite table definitions |
| `src/components/LectureReturnSheet.tsx` | Post-lecture overlay with quiz |
| `src/services/transcriptionService.ts` | Gemini transcription pipeline |
| `src/services/aiService.ts` | AI generation: keypoints, quiz, catalyst |
| `src/constants/prompts.ts` | All Gemini prompts |

---

## DB Schema Quick Reference

**topics table:**
- `id, subject_id, name, estimated_minutes, inicet_priority, parent_topic_id`

**topic_progress table:**
- `topic_id, status (unseen/seen/reviewed/mastered), confidence (0-5)`
- `last_studied_at, times_studied, xp_earned, next_review_date`
- `user_notes, wrong_count, is_nemesis`

**SRS intervals (confidence → days):** `[1, 1, 3, 7, 14, 21]`

---

### 6. Community Medicine / PSM Added as Subject 19 ✅
**File:** `src/constants/syllabus.ts`, `src/components/LectureReturnSheet.tsx`

Added PSM as subject 19 with full 3-level hierarchy:
- inicetWeight: 7, neetWeight: 8, colorHex: '#388E3C'
- 11 parent topics covering: Epidemiology, Biostatistics, Communicable Disease Control, Nutrition & PEM, Environmental Health, Occupational Health, Demography & Vital Statistics, Family Planning, Health Administration, National Health Programmes, Immunization Programme, Disease Surveillance
- ~60 subtopics, all INICET/NEET-PG high-yield
- Also added 'Community Medicine' to SUBJECT_COLORS in LectureReturnSheet.tsx

### 7. Catalyst Pipeline UI Fixed ✅
**File:** `src/screens/LectureModeScreen.tsx`

The catalyst section was hidden below the fold (parent `View` had `flex: 1`):
- Wrapped content in `KeyboardAvoidingView` + `ScrollView` so catalyst is always reachable
- Replaced bare `Alert` success with inline success card showing topic name + subject
- Added `ActivityIndicator` spinner during synthesis instead of text-only loading state
- Added "Create Another" button to reset after success

---


1. **Review screen UX** — ensure nemesis boost (+50 score) is visible to user
2. **Session planner tuning** — review `src/db/queries/sessionPlanner.ts` for nemesis rotation logic
3. **Vault re-import** — if Obsidian vault has new notes, re-run `scripts/importVault.py` and update `vaultTopics.ts`
4. **Performance** — syllabus now has ~600+ topics; check if initial seed is slow on first install
5. **Catalyst "Study Now" navigation** — after synthesis, add a button to jump directly to SyllabusTab for the relevant subject (`navigation.getParent()?.navigate('SyllabusTab')`)

---

## How to Resume This Session

When starting a new Claude Code session, paste this at the start:
> "Continue working on the Guru NEET study app at `/root/.claude/Guru/`. Read SESSION_PROGRESS.md for full context. The syllabus expansion across all 18 subjects is complete. Ask me what to work on next."
