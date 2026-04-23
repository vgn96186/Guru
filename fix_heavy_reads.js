const fs = require('fs');

let tRepo = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

tRepo = tRepo.replace(/import \{ getDrizzleDb \} from '\.\.\/drizzle';/g, "import { getDrizzleDb } from '../drizzle';\nimport { getDb } from '../database';");

// getSubjectStatsAggregated
const statsRegex = /async getSubjectStatsAggregated\(\): Promise<SubjectStatsRow\[\]> \{\s*const db = getDrizzleDb\(\);\s*const rows = await db\s*\.select\(\{\s*subjectId: topics\.subjectId,\s*total: count\(topics\.id\),\s*seen: sql<number>`SUM\(CASE WHEN \$\{topicProgress\.status\} IN \('seen','reviewed','mastered'\) THEN 1 ELSE 0 END\)`,\s*due: sql<number>`SUM\(CASE WHEN COALESCE\(\$\{topicProgress\.status\}, 'unseen'\) != 'unseen' AND \(\$\{topicProgress\.fsrsDue\} IS NULL OR DATE\(\$\{topicProgress\.fsrsDue\}\) <= DATE\('now'\)\) THEN 1 ELSE 0 END\)`,\s*highYield: sql<number>`SUM\(CASE WHEN \$\{topics\.inicetPriority\} >= 8 THEN 1 ELSE 0 END\)`,\s*unseen: sql<number>`SUM\(CASE WHEN COALESCE\(\$\{topicProgress\.status\}, 'unseen'\) = 'unseen' THEN 1 ELSE 0 END\)`,\s*withNotes: sql<number>`SUM\(CASE WHEN TRIM\(COALESCE\(\$\{topicProgress\.userNotes\}, ''\)\) <> '' THEN 1 ELSE 0 END\)`,\s*weak: sql<number>`SUM\(CASE WHEN COALESCE\(\$\{topicProgress\.timesStudied\}, 0\) > 0 AND COALESCE\(\$\{topicProgress\.confidence\}, 0\) < 3 THEN 1 ELSE 0 END\)`,\s*\}\)\s*\.from\(topics\)\s*\.leftJoin\(topicProgress, eq\(topics\.id, topicProgress\.topicId\)\)\s*\.where\(sql`NOT EXISTS \(SELECT 1 FROM topics c WHERE c\.parent_topic_id = topics\.id\)`\)\s*\.groupBy\(topics\.subjectId\);\s*return rows;\s*\}/;

tRepo = tRepo.replace(statsRegex, `async getSubjectStatsAggregated(): Promise<SubjectStatsRow[]> {
    const rawDb = getDb();
    const rows = await rawDb.getAllAsync<{
        subjectId: number | null;
        total: number;
        seen: number;
        due: number;
        highYield: number;
        unseen: number;
        withNotes: number;
        weak: number;
    }>(\`
      SELECT 
        t.subject_id as subjectId, 
        COUNT(t.id) as total,
        SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) as seen,
        SUM(CASE WHEN COALESCE(p.status, 'unseen') != 'unseen' AND (p.fsrs_due IS NULL OR DATE(p.fsrs_due) <= DATE('now')) THEN 1 ELSE 0 END) as due,
        SUM(CASE WHEN t.inicet_priority >= 8 THEN 1 ELSE 0 END) as highYield,
        SUM(CASE WHEN COALESCE(p.status, 'unseen') = 'unseen' THEN 1 ELSE 0 END) as unseen,
        SUM(CASE WHEN TRIM(COALESCE(p.user_notes, '')) <> '' THEN 1 ELSE 0 END) as withNotes,
        SUM(CASE WHEN COALESCE(p.times_studied, 0) > 0 AND COALESCE(p.confidence, 0) < 3 THEN 1 ELSE 0 END) as weak
      FROM topics t
      LEFT JOIN topic_progress p ON t.id = p.topic_id
      WHERE NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = t.id)
      GROUP BY t.subject_id
    \`);
    return rows;
  }`);

// getSubjectCoverage
const covRegex = /async getSubjectCoverage\(\): Promise<\s*Array<\{ subjectId: number; total: number; seen: number; mastered: number \}>\s*> \{\s*const db = getDrizzleDb\(\);\s*const rows = await db\s*\.select\(\{\s*subjectId: topics\.subjectId,\s*total: count\(topics\.id\),\s*seen: sql<number>`SUM\(CASE WHEN \$\{topicProgress\.status\} IN \('seen','reviewed','mastered'\) THEN 1 ELSE 0 END\)`,\s*mastered: sql<number>`SUM\(CASE WHEN \$\{topicProgress\.status\} = 'mastered' THEN 1 ELSE 0 END\)`,\s*\}\)\s*\.from\(topics\)\s*\.leftJoin\(topicProgress, eq\(topics\.id, topicProgress\.topicId\)\)\s*\.where\(sql`NOT EXISTS \(SELECT 1 FROM topics c WHERE c\.parent_topic_id = topics\.id\)`\)\s*\.groupBy\(topics\.subjectId\);\s*return rows as Array<\{ subjectId: number; total: number; seen: number; mastered: number \}>;\s*\}/;

tRepo = tRepo.replace(covRegex, `async getSubjectCoverage(): Promise<
    Array<{ subjectId: number; total: number; seen: number; mastered: number }>
  > {
    const rawDb = getDb();
    const rows = await rawDb.getAllAsync<{ subjectId: number; total: number; seen: number; mastered: number }>(\`
      SELECT 
        t.subject_id as subjectId,
        COUNT(t.id) as total,
        SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) as seen,
        SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) as mastered
      FROM topics t
      LEFT JOIN topic_progress p ON t.id = p.topic_id
      WHERE NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = t.id)
      GROUP BY t.subject_id
    \`);
    return rows;
  }`);

fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', tRepo);
