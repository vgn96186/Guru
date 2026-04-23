const Database = require('better-sqlite3');
const sqlite = new Database(':memory:');

sqlite.exec(`
CREATE TABLE topics (id INTEGER PRIMARY KEY, subject_id INTEGER, parent_topic_id INTEGER, name TEXT, estimated_minutes INTEGER, inicet_priority INTEGER);
CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT, short_code TEXT, color_hex TEXT, display_order INTEGER, inicet_weight INTEGER, neet_weight INTEGER);
CREATE TABLE topic_progress (topic_id INTEGER PRIMARY KEY, status TEXT, confidence INTEGER, last_studied_at INTEGER, times_studied INTEGER, xp_earned INTEGER, next_review_date TEXT, user_notes TEXT, fsrs_due TEXT, fsrs_stability INTEGER, fsrs_difficulty INTEGER, fsrs_elapsed_days INTEGER, fsrs_scheduled_days INTEGER, fsrs_reps INTEGER, fsrs_lapses INTEGER, fsrs_state INTEGER, fsrs_last_review TEXT, wrong_count INTEGER, is_nemesis INTEGER);

INSERT INTO subjects (id, name, short_code, color_hex) VALUES (1, 'Anatomy', 'ANT', '#FFF');
INSERT INTO topics (id, subject_id, name) VALUES (10, 1, 'Topic A');
`);

const r = sqlite.prepare(`
      SELECT 
        t.id, t.subject_id as subjectId, t.parent_topic_id as parentTopicId, t.name, t.estimated_minutes as estimatedMinutes, t.inicet_priority as inicetPriority,
        p.status, p.confidence, p.last_studied_at as lastStudiedAt, p.times_studied as timesStudied, p.xp_earned as xpEarned, p.next_review_date as nextReviewDate,
        p.user_notes as userNotes, p.fsrs_due as fsrsDue, p.fsrs_stability as fsrsStability, p.fsrs_difficulty as fsrsDifficulty, p.fsrs_elapsed_days as fsrsElapsedDays,
        p.fsrs_scheduled_days as fsrsScheduledDays, p.fsrs_reps as fsrsReps, p.fsrs_lapses as fsrsLapses, p.fsrs_state as fsrsState, p.fsrs_last_review as fsrsLastReview,
        p.wrong_count as wrongCount, p.is_nemesis as isNemesis,
        s.name as subjectName, s.short_code as subjectCode, s.color_hex as subjectColor,
        (SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = t.id) as childCount
      FROM topics t
      INNER JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN topic_progress p ON t.id = p.topic_id
      ORDER BY t.inicet_priority DESC
`).all();
console.log(r);
