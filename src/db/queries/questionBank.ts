import { getDb, nowTs } from '../database';
import type { QuestionBankItem, SaveQuestionInput, QuestionFilters } from '../../types';

// ── Spaced-repetition intervals (ms) ──────────────────────────────────────────
const SR_INTERVALS = [
  1 * 86_400_000, // 1 day
  3 * 86_400_000, // 3 days
  7 * 86_400_000, // 7 days
  14 * 86_400_000, // 14 days
  30 * 86_400_000, // 30 days
];

function nextReviewInterval(consecutiveCorrect: number): number {
  const idx = Math.min(consecutiveCorrect, SR_INTERVALS.length - 1);
  return SR_INTERVALS[idx];
}

// ── Row mapper ────────────────────────────────────────────────────────────────
function rowToItem(r: any): QuestionBankItem {
  return {
    id: r.id,
    question: r.question,
    options: JSON.parse(r.options),
    correctIndex: r.correct_index,
    explanation: r.explanation,
    topicId: r.topic_id,
    topicName: r.topic_name,
    subjectName: r.subject_name,
    source: r.source,
    sourceId: r.source_id,
    imageUrl: r.image_url,
    isBookmarked: !!r.is_bookmarked,
    isMastered: !!r.is_mastered,
    timesSeen: r.times_seen,
    timesCorrect: r.times_correct,
    lastSeenAt: r.last_seen_at,
    nextReviewAt: r.next_review_at,
    difficulty: r.difficulty,
    createdAt: r.created_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** INSERT OR IGNORE — deduplicates by question text via unique index. Returns inserted rowId or 0 if duplicate. */
export async function saveQuestion(q: SaveQuestionInput): Promise<number> {
  const db = getDb();
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO question_bank
       (question, options, correct_index, explanation, topic_id, topic_name, subject_name, source, source_id, image_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      q.question,
      JSON.stringify(q.options),
      q.correctIndex,
      q.explanation,
      q.topicId ?? null,
      q.topicName ?? '',
      q.subjectName ?? '',
      q.source,
      q.sourceId ?? null,
      q.imageUrl ?? null,
      nowTs(),
    ],
  );
  return result.lastInsertRowId ?? 0;
}

/** Batch insert, returns count of newly saved questions (skips duplicates). */
export async function saveBulkQuestions(questions: SaveQuestionInput[]): Promise<number> {
  if (questions.length === 0) return 0;
  const db = getDb();
  let saved = 0;
  for (const q of questions) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO question_bank
         (question, options, correct_index, explanation, topic_id, topic_name, subject_name, source, source_id, image_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        q.question,
        JSON.stringify(q.options),
        q.correctIndex,
        q.explanation,
        q.topicId ?? null,
        q.topicName ?? '',
        q.subjectName ?? '',
        q.source,
        q.sourceId ?? null,
        q.imageUrl ?? null,
        nowTs(),
      ],
    );
    if (result.changes > 0) saved++;
  }
  return saved;
}

export async function deleteQuestion(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM question_bank WHERE id = ?', [id]);
}

export async function toggleBookmark(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE question_bank SET is_bookmarked = CASE WHEN is_bookmarked = 1 THEN 0 ELSE 1 END WHERE id = ?',
    [id],
  );
}

export async function markMastered(id: number, mastered: boolean): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE question_bank SET is_mastered = ? WHERE id = ?', [
    mastered ? 1 : 0,
    id,
  ]);
}

/** Record an attempt: increment counters, update SR schedule. */
export async function recordAttempt(id: number, correct: boolean): Promise<void> {
  const db = getDb();
  const now = nowTs();

  // Read current state
  const row = await db.getFirstAsync<{
    times_seen: number;
    times_correct: number;
    difficulty: number;
    is_mastered: number;
  }>('SELECT times_seen, times_correct, difficulty, is_mastered FROM question_bank WHERE id = ?', [
    id,
  ]);
  if (!row) return;

  const timesSeen = row.times_seen + 1;
  const timesCorrect = row.times_correct + (correct ? 1 : 0);

  let difficulty = row.difficulty;
  let consecutiveCorrect: number;

  if (correct) {
    difficulty = Math.max(0, difficulty - 0.05);
    // Estimate consecutive correct from recent accuracy (simplified)
    consecutiveCorrect = Math.floor(timesCorrect / Math.max(1, timesSeen) * 5);
  } else {
    difficulty = Math.min(1, difficulty + 0.1);
    consecutiveCorrect = 0;
  }

  const interval = correct ? nextReviewInterval(consecutiveCorrect) : SR_INTERVALS[0];
  const nextReviewAt = now + interval;

  // Auto-mastered: 3+ consecutive correct equivalent and interval >= 14d
  const autoMastered =
    correct && consecutiveCorrect >= 3 && interval >= 14 * 86_400_000 ? 1 : row.is_mastered;

  await db.runAsync(
    `UPDATE question_bank
     SET times_seen = ?, times_correct = ?, last_seen_at = ?, next_review_at = ?,
         difficulty = ?, is_mastered = ?
     WHERE id = ?`,
    [timesSeen, timesCorrect, now, nextReviewAt, difficulty, autoMastered, id],
  );
}

// ── Queries ───────────────────────────────────────────────────────────────────

function buildWhereClause(filters?: QuestionFilters): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  if (filters?.subjectName) {
    clauses.push('subject_name = ?');
    params.push(filters.subjectName);
  }
  if (filters?.topicId != null) {
    clauses.push('topic_id = ?');
    params.push(filters.topicId);
  }
  if (filters?.isBookmarked != null) {
    clauses.push('is_bookmarked = ?');
    params.push(filters.isBookmarked ? 1 : 0);
  }
  if (filters?.isMastered != null) {
    clauses.push('is_mastered = ?');
    params.push(filters.isMastered ? 1 : 0);
  }
  if (filters?.dueForReview) {
    clauses.push('(next_review_at IS NULL OR next_review_at <= ?) AND is_mastered = 0');
    params.push(nowTs());
  }
  if (filters?.search) {
    clauses.push('question LIKE ?');
    params.push(`%${filters.search}%`);
  }

  const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
  return { where, params };
}

export async function getQuestions(filters?: QuestionFilters): Promise<QuestionBankItem[]> {
  const db = getDb();
  const { where, params } = buildWhereClause(filters);
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM question_bank ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(rowToItem);
}

export async function getQuestionCount(filters?: QuestionFilters): Promise<number> {
  const db = getDb();
  const { where, params } = buildWhereClause(filters);
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM question_bank ${where}`,
    params,
  );
  return row?.cnt ?? 0;
}

/** Random practice set, prioritizing due-for-review questions. */
export async function getPracticeSet(
  count: number,
  filters?: QuestionFilters,
): Promise<QuestionBankItem[]> {
  const db = getDb();
  const { where, params } = buildWhereClause(filters);
  const now = nowTs();

  // First: due for review
  const dueRows = await db.getAllAsync<any>(
    `SELECT * FROM question_bank ${where ? where + ' AND' : 'WHERE'}
       (next_review_at IS NULL OR next_review_at <= ?) AND is_mastered = 0
     ORDER BY RANDOM() LIMIT ?`,
    [...params, now, count],
  );
  const due = dueRows.map(rowToItem);

  if (due.length >= count) return due.slice(0, count);

  // Fill remaining with random non-mastered questions not already selected
  const dueIds = new Set(due.map((q) => q.id));
  const remaining = count - due.length;
  const extraRows = await db.getAllAsync<any>(
    `SELECT * FROM question_bank ${where ? where + ' AND' : 'WHERE'} is_mastered = 0
     ORDER BY RANDOM() LIMIT ?`,
    [...params, remaining + due.length],
  );
  const extras = extraRows.map(rowToItem).filter((q) => !dueIds.has(q.id));

  return [...due, ...extras.slice(0, remaining)];
}

/** Questions due for review now. */
export async function getDueForReview(limit: number): Promise<QuestionBankItem[]> {
  const db = getDb();
  const now = nowTs();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM question_bank
     WHERE (next_review_at IS NULL OR next_review_at <= ?) AND is_mastered = 0
     ORDER BY next_review_at ASC NULLS FIRST
     LIMIT ?`,
    [now, limit],
  );
  return rows.map(rowToItem);
}

/** Unseen cached questions for session fallback, prioritized by exact topic, then subject, then global pool. */
export async function getCachedUnseenQuestionsForSessionFallback(
  topicId: number,
  subjectName: string,
  limit: number,
): Promise<QuestionBankItem[]> {
  const db = getDb();
  const targetLimit = Math.max(1, limit);
  const collected = new Map<number, QuestionBankItem>();
  const strategies: Array<{ where: string; params: Array<string | number> }> = [
    {
      where: 'topic_id = ? AND times_seen = 0 AND is_mastered = 0',
      params: [topicId],
    },
    {
      where: 'subject_name = ? AND times_seen = 0 AND is_mastered = 0',
      params: [subjectName],
    },
    {
      where: 'times_seen = 0 AND is_mastered = 0',
      params: [],
    },
  ];

  for (const strategy of strategies) {
    if (collected.size >= targetLimit) break;
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM question_bank
       WHERE ${strategy.where}
       ORDER BY CASE WHEN source = 'content_card' THEN 0 ELSE 1 END, created_at DESC
       LIMIT ?`,
      [...strategy.params, targetLimit * 3],
    );
    for (const row of rows) {
      const item = rowToItem(row);
      if (collected.has(item.id)) continue;
      collected.set(item.id, item);
      if (collected.size >= targetLimit) break;
    }
  }

  return Array.from(collected.values()).slice(0, targetLimit);
}

/** Per-subject aggregate stats for the question bank overview. */
export async function getSubjectStats(): Promise<
  { subject: string; total: number; mastered: number; bookmarked: number }[]
> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    subject_name: string;
    total: number;
    mastered: number;
    bookmarked: number;
  }>(
    `SELECT subject_name,
            COUNT(*) as total,
            SUM(is_mastered) as mastered,
            SUM(is_bookmarked) as bookmarked
     FROM question_bank
     GROUP BY subject_name
     ORDER BY total DESC`,
  );
  return rows.map((r) => ({
    subject: r.subject_name || 'Unknown',
    total: r.total,
    mastered: r.mastered ?? 0,
    bookmarked: r.bookmarked ?? 0,
  }));
}
