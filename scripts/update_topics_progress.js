const fs = require('fs');

let code = fs.readFileSync('../src/db/queries/topics.ts', 'utf-8');

const importFSRS = "import { getInitialCard, reviewCard, mapConfidenceToRating } from '../services/fsrsService';\nimport type { Card } from 'ts-fsrs';";
code = code.replace("import type { Subject, Topic, TopicProgress, TopicWithProgress } from '../../types';", "import type { Subject, Topic, TopicProgress, TopicWithProgress } from '../../types';\n" + importFSRS);

// Add FSRS fields to TopicRow
code = code.replace("next_review_date: string | null; user_notes: string;", 
  "next_review_date: string | null; user_notes: string;\n  fsrs_due: string | null; fsrs_stability: number; fsrs_difficulty: number; fsrs_elapsed_days: number; fsrs_scheduled_days: number; fsrs_reps: number; fsrs_lapses: number; fsrs_state: number; fsrs_last_review: string | null;");

// Add to TOPIC_SELECT
code = code.replace("p.user_notes,", 
  "p.user_notes,\n  p.fsrs_due, p.fsrs_stability, p.fsrs_difficulty, p.fsrs_elapsed_days, p.fsrs_scheduled_days, p.fsrs_reps, p.fsrs_lapses, p.fsrs_state, p.fsrs_last_review,");

// Also update mapTopicRow which is presumably lower in the file
code = code.replace(/userNotes: r\.user_notes,\n    \}/, 
  `userNotes: r.user_notes,
      fsrsDue: r.fsrs_due,
      fsrsStability: r.fsrs_stability ?? 0,
      fsrsDifficulty: r.fsrs_difficulty ?? 0,
      fsrsElapsedDays: r.fsrs_elapsed_days ?? 0,
      fsrsScheduledDays: r.fsrs_scheduled_days ?? 0,
      fsrsReps: r.fsrs_reps ?? 0,
      fsrsLapses: r.fsrs_lapses ?? 0,
      fsrsState: r.fsrs_state ?? 0,
      fsrsLastReview: r.fsrs_last_review,
    }`);

const newUpdateFunc = `export function updateTopicProgress(
  topicId: number,
  status: TopicProgress['status'],
  confidence: number,
  xpToAdd: number,
): void {
  const db = getDb();
  const now = Date.now();
  const nextReview = srsNextDate(confidence);
  
  // Get existing FSRS data
  const existing = db.getFirstSync<any>('SELECT fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review FROM topic_progress WHERE topic_id = ?', [topicId]);
  
  let card: Card;
  if (existing && existing.fsrs_last_review) {
    card = {
      due: new Date(existing.fsrs_due),
      stability: existing.fsrs_stability,
      difficulty: existing.fsrs_difficulty,
      elapsed_days: existing.fsrs_elapsed_days,
      scheduled_days: existing.fsrs_scheduled_days,
      reps: existing.fsrs_reps,
      lapses: existing.fsrs_lapses,
      state: existing.fsrs_state,
      last_review: new Date(existing.fsrs_last_review)
    };
  } else {
    card = getInitialCard();
  }
  
  const rating = mapConfidenceToRating(confidence);
  const log = reviewCard(card, rating, new Date());
  const updatedCard = log.card;
  
  db.runSync(
    \`INSERT INTO topic_progress (
       topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date,
       fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review
     )
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(topic_id) DO UPDATE SET
       status = excluded.status,
       confidence = excluded.confidence,
       last_studied_at = excluded.last_studied_at,
       times_studied = times_studied + 1,
       xp_earned = xp_earned + excluded.xp_earned,
       next_review_date = excluded.next_review_date,
       fsrs_due = excluded.fsrs_due,
       fsrs_stability = excluded.fsrs_stability,
       fsrs_difficulty = excluded.fsrs_difficulty,
       fsrs_elapsed_days = excluded.fsrs_elapsed_days,
       fsrs_scheduled_days = excluded.fsrs_scheduled_days,
       fsrs_reps = excluded.fsrs_reps,
       fsrs_lapses = excluded.fsrs_lapses,
       fsrs_state = excluded.fsrs_state,
       fsrs_last_review = excluded.fsrs_last_review\`,
    [
      topicId, status, confidence, now, xpToAdd, nextReview,
      updatedCard.due.toISOString(), updatedCard.stability, updatedCard.difficulty, updatedCard.elapsed_days, 
      updatedCard.scheduled_days, updatedCard.reps, updatedCard.lapses, updatedCard.state, updatedCard.last_review?.toISOString() ?? null
    ]
  );
}`;

code = code.replace(/export function updateTopicProgress\([\s\S]*?\}\n/m, newUpdateFunc + '\n');
fs.writeFileSync('../src/db/queries/topics.ts', code);
console.log('Updated updateTopicProgress');
