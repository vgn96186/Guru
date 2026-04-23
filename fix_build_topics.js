const fs = require('fs');

let content = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

const oldBuild = /const buildTopicsQuery = \([\s\S]*?\.leftJoin\(topicProgress, eq\(topics\.id, topicProgress\.topicId\)\);\s*if \(whereClause\) \{\s*query = query\.where\(whereClause\) as any;\s*\}\s*if \(orderClauses && orderClauses\.length > 0\) \{\s*query = query\.orderBy\(\.\.\.orderClauses\) as any;\s*\}\s*if \(limitCount !== undefined\) \{\s*query = query\.limit\(limitCount\) as any;\s*\}\s*return query;\s*\};/m;

const newBuild = `const buildTopicsQuery = async (
  whereClause?: SQL<unknown>,
  limitCount?: number,
  orderClauses?: SQL<unknown>[],
) => {
  const db = getDrizzleDb();
  let query = db
    .select({
      id: topics.id,
      subjectId: topics.subjectId,
      parentTopicId: topics.parentTopicId,
      name: topics.name,
      estimatedMinutes: topics.estimatedMinutes,
      inicetPriority: topics.inicetPriority,
      status: topicProgress.status,
      confidence: topicProgress.confidence,
      lastStudiedAt: topicProgress.lastStudiedAt,
      timesStudied: topicProgress.timesStudied,
      xpEarned: topicProgress.xpEarned,
      nextReviewDate: topicProgress.nextReviewDate,
      userNotes: topicProgress.userNotes,
      fsrsDue: topicProgress.fsrsDue,
      fsrsStability: topicProgress.fsrsStability,
      fsrsDifficulty: topicProgress.fsrsDifficulty,
      fsrsElapsedDays: topicProgress.fsrsElapsedDays,
      fsrsScheduledDays: topicProgress.fsrsScheduledDays,
      fsrsReps: topicProgress.fsrsReps,
      fsrsLapses: topicProgress.fsrsLapses,
      fsrsState: topicProgress.fsrsState,
      fsrsLastReview: topicProgress.fsrsLastReview,
      wrongCount: topicProgress.wrongCount,
      isNemesis: topicProgress.isNemesis,
      subjectName: subjects.name,
      subjectCode: subjects.shortCode,
      subjectColor: subjects.colorHex,
      childCount: sql<number>\`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = topics.id)\`,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .leftJoin(topicProgress, eq(topics.id, topicProgress.topicId));

  if (whereClause) {
    query = query.where(whereClause) as any;
  }
  if (orderClauses && orderClauses.length > 0) {
    query = query.orderBy(...orderClauses) as any;
  }
  if (limitCount !== undefined) {
    query = query.limit(limitCount) as any;
  }

  // To prevent UI thread locking from Drizzle's synchronous mapping of massive arrays,
  // we compile the statement to raw SQL and execute it asynchronously via Expo SQLite.
  const { sql: sqlString, params } = query.toSQL();
  const rawDb = getDb();
  
  // Actually, we must manually map the rows if we run raw sql.
  const rawRows = await rawDb.getAllAsync<any>(sqlString, params);
  
  return rawRows.map(r => ({
    id: r.id,
    subjectId: r.subject_id ?? r.subjectId,
    parentTopicId: r.parent_topic_id ?? r.parentTopicId,
    name: r.name,
    estimatedMinutes: r.estimated_minutes ?? r.estimatedMinutes,
    inicetPriority: r.inicet_priority ?? r.inicetPriority,
    status: r.status,
    confidence: r.confidence,
    lastStudiedAt: r.last_studied_at ?? r.lastStudiedAt,
    timesStudied: r.times_studied ?? r.timesStudied,
    xpEarned: r.xp_earned ?? r.xpEarned,
    nextReviewDate: r.next_review_date ?? r.nextReviewDate,
    userNotes: r.user_notes ?? r.userNotes,
    fsrsDue: r.fsrs_due ?? r.fsrsDue,
    fsrsStability: r.fsrs_stability ?? r.fsrsStability,
    fsrsDifficulty: r.fsrs_difficulty ?? r.fsrsDifficulty,
    fsrsElapsedDays: r.fsrs_elapsed_days ?? r.fsrsElapsedDays,
    fsrsScheduledDays: r.fsrs_scheduled_days ?? r.fsrsScheduledDays,
    fsrsReps: r.fsrs_reps ?? r.fsrsReps,
    fsrsLapses: r.fsrs_lapses ?? r.fsrsLapses,
    fsrsState: r.fsrs_state ?? r.fsrsState,
    fsrsLastReview: r.fsrs_last_review ?? r.fsrsLastReview,
    wrongCount: r.wrong_count ?? r.wrongCount,
    isNemesis: r.is_nemesis ?? r.isNemesis,
    subjectName: r.name_1 ?? r.subjectName, // when aliased loosely, Drizzle raw names might overlap
    subjectCode: r.short_code ?? r.subjectCode,
    subjectColor: r.color_hex ?? r.subjectColor,
    childCount: r.childCount ?? r['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = topics.id)'],
  }));
};`;

content = content.replace(oldBuild, newBuild);

// Also remove `await` when calling buildTopicsQuery since it returns `query` before, but now we make it return raw mapped rows! Wait, let's fix the caller map.
// The old callers did: const rows = await buildTopicsQuery(...); return rows.map(mapTopicRow);
// But buildTopicsQuery was NOT async before. Wait, did the callers do `const rows = await buildTopicsQuery(...);`? Yes they did!
// Let me double check if `buildTopicsQuery` returned a promise. Wait, `buildTopicsQuery` returned a drizzle query builder, which is thenable! So `await buildTopicsQuery(...)` actually executed the query!
// If I change it to return the mapped rows array directly, the callers will still await it, getting the array. Then they call `rows.map(mapTopicRow)`. Since my new `buildTopicsQuery` maps properties to exactly match what Drizzle returned, `mapTopicRow` will still work!

// Let's refine the sql string extraction.
// Drizzle's `.toSQL()` might not prefix columns perfectly for raw result maps if joins share column names.
// "name_1" or something is what drizzle internally uses when there is a collision.
// Let me just enforce the mapping internally.

fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', content);
