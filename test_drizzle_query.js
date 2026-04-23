const { sqliteTable, text, integer } = require('drizzle-orm/sqlite-core');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const { eq, and, sql, desc, asc, lt } = require('drizzle-orm');

const sqlite = new Database(':memory:');
const db = drizzle(sqlite);

sqlite.exec(`
CREATE TABLE topics (id INTEGER PRIMARY KEY, subject_id INTEGER, parent_topic_id INTEGER, name TEXT, estimated_minutes INTEGER, inicet_priority INTEGER);
CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT, short_code TEXT, color_hex TEXT);
CREATE TABLE topic_progress (topic_id INTEGER PRIMARY KEY, status TEXT, confidence INTEGER, last_studied_at INTEGER, times_studied INTEGER, xp_earned INTEGER, next_review_date TEXT, user_notes TEXT, fsrs_due TEXT, fsrs_stability INTEGER, fsrs_difficulty INTEGER, fsrs_elapsed_days INTEGER, fsrs_scheduled_days INTEGER, fsrs_reps INTEGER, fsrs_lapses INTEGER, fsrs_state INTEGER, fsrs_last_review TEXT, wrong_count INTEGER, is_nemesis INTEGER);
`);

const topics = sqliteTable('topics', { id: integer('id').primaryKey(), subjectId: integer('subject_id'), parentTopicId: integer('parent_topic_id'), name: text('name'), estimatedMinutes: integer('estimated_minutes'), inicetPriority: integer('inicet_priority'), });
const subjects = sqliteTable('subjects', { id: integer('id').primaryKey(), name: text('name'), shortCode: text('short_code'), colorHex: text('color_hex'), });
const topicProgress = sqliteTable('topic_progress', { topicId: integer('topic_id').primaryKey(), status: text('status'), confidence: integer('confidence'), lastStudiedAt: integer('last_studied_at'), timesStudied: integer('times_studied'), xpEarned: integer('xp_earned'), nextReviewDate: text('next_review_date'), userNotes: text('user_notes'), fsrsDue: text('fsrs_due'), fsrsStability: integer('fsrs_stability'), fsrsDifficulty: integer('fsrs_difficulty'), fsrsElapsedDays: integer('fsrs_elapsed_days'), fsrsScheduledDays: integer('fsrs_scheduled_days'), fsrsReps: integer('fsrs_reps'), fsrsLapses: integer('fsrs_lapses'), fsrsState: integer('fsrs_state'), fsrsLastReview: text('fsrs_last_review'), wrongCount: integer('wrong_count'), isNemesis: integer('is_nemesis'), });

let query = db
    .select({ id: topics.id, subjectId: topics.subjectId, parentTopicId: topics.parentTopicId, name: topics.name, estimatedMinutes: topics.estimatedMinutes, inicetPriority: topics.inicetPriority, status: topicProgress.status, confidence: topicProgress.confidence, lastStudiedAt: topicProgress.lastStudiedAt, timesStudied: topicProgress.timesStudied, xpEarned: topicProgress.xpEarned, nextReviewDate: topicProgress.nextReviewDate, userNotes: topicProgress.userNotes, fsrsDue: topicProgress.fsrsDue, fsrsStability: topicProgress.fsrsStability, fsrsDifficulty: topicProgress.fsrsDifficulty, fsrsElapsedDays: topicProgress.fsrsElapsedDays, fsrsScheduledDays: topicProgress.fsrsScheduledDays, fsrsReps: topicProgress.fsrsReps, fsrsLapses: topicProgress.fsrsLapses, fsrsState: topicProgress.fsrsState, fsrsLastReview: topicProgress.fsrsLastReview, wrongCount: topicProgress.wrongCount, isNemesis: topicProgress.isNemesis, subjectName: subjects.name, subjectCode: subjects.shortCode, subjectColor: subjects.colorHex, childCount: sql`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = topics.id)`, })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .leftJoin(topicProgress, eq(topics.id, topicProgress.topicId));

  const whereClause = and( sql`${topicProgress.timesStudied} > 0`, lt(topicProgress.confidence, 3), sql`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ${topics.id}) = 0`, );
  const limitCount = 6;
  const orderClauses = [asc(topicProgress.confidence), desc(topicProgress.timesStudied)];
  query = query.where(whereClause).orderBy(...orderClauses).limit(limitCount);

const { sql: sqlString, params } = query.toSQL();

try {
  sqlite.prepare(sqlString);
  console.log("PREPARE: Success");
} catch(err) {
  console.error("PREPARE ERROR:", err);
}

