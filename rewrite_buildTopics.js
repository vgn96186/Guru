const fs = require('fs');

let content = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

const regex = /const buildTopicsQuery = async \([\s\S]*?childCount: r\.childCount \?\? r\['\(SELECT COUNT\(\*\) FROM topics c WHERE c\.parent_topic_id = topics\.id\)'\],\s*\}\)\);\s*\};/m;

const newBuild = `const buildTopicsQuery = async (
  whereClause?: SQL<unknown>,
  limitCount?: number,
  orderClauses?: SQL<unknown>[],
) => {
  const db = getDrizzleDb();
  let query = db
    .select({
      id: sql<number>\`\${topics.id} AS id\`,
      subjectId: sql<number>\`\${topics.subjectId} AS subjectId\`,
      parentTopicId: sql<number | null>\`\${topics.parentTopicId} AS parentTopicId\`,
      name: sql<string>\`\${topics.name} AS name\`,
      estimatedMinutes: sql<number>\`\${topics.estimatedMinutes} AS estimatedMinutes\`,
      inicetPriority: sql<number>\`\${topics.inicetPriority} AS inicetPriority\`,
      status: sql<string>\`\${topicProgress.status} AS status\`,
      confidence: sql<number>\`\${topicProgress.confidence} AS confidence\`,
      lastStudiedAt: sql<number | null>\`\${topicProgress.lastStudiedAt} AS lastStudiedAt\`,
      timesStudied: sql<number>\`\${topicProgress.timesStudied} AS timesStudied\`,
      xpEarned: sql<number>\`\${topicProgress.xpEarned} AS xpEarned\`,
      nextReviewDate: sql<string | null>\`\${topicProgress.nextReviewDate} AS nextReviewDate\`,
      userNotes: sql<string>\`\${topicProgress.userNotes} AS userNotes\`,
      fsrsDue: sql<string | null>\`\${topicProgress.fsrsDue} AS fsrsDue\`,
      fsrsStability: sql<number | null>\`\${topicProgress.fsrsStability} AS fsrsStability\`,
      fsrsDifficulty: sql<number | null>\`\${topicProgress.fsrsDifficulty} AS fsrsDifficulty\`,
      fsrsElapsedDays: sql<number | null>\`\${topicProgress.fsrsElapsedDays} AS fsrsElapsedDays\`,
      fsrsScheduledDays: sql<number | null>\`\${topicProgress.fsrsScheduledDays} AS fsrsScheduledDays\`,
      fsrsReps: sql<number | null>\`\${topicProgress.fsrsReps} AS fsrsReps\`,
      fsrsLapses: sql<number | null>\`\${topicProgress.fsrsLapses} AS fsrsLapses\`,
      fsrsState: sql<number | null>\`\${topicProgress.fsrsState} AS fsrsState\`,
      fsrsLastReview: sql<string | null>\`\${topicProgress.fsrsLastReview} AS fsrsLastReview\`,
      wrongCount: sql<number>\`\${topicProgress.wrongCount} AS wrongCount\`,
      isNemesis: sql<number>\`\${topicProgress.isNemesis} AS isNemesis\`,
      subjectName: sql<string>\`\${subjects.name} AS subjectName\`,
      subjectCode: sql<string>\`\${subjects.shortCode} AS subjectCode\`,
      subjectColor: sql<string>\`\${subjects.colorHex} AS subjectColor\`,
      childCount: sql<number>\`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = topics.id) AS childCount\`,
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

  const { sql: sqlString, params } = query.toSQL();
  const rawDb = getDb();
  const rawRows = await rawDb.getAllAsync<any>(sqlString, params);
  
  return rawRows;
};`;

content = content.replace(regex, newBuild);

// also fix where mapTopicRow accesses those variables directly, wait, rawRows matches mapTopicRow already!
// I just returned `rawRows`. But the callers do `return rows.map(mapTopicRow)`.
// Let's verify callers mapping the rows.

fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', content);
