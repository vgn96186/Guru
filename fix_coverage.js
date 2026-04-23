const fs = require('fs');

let tRepo = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

tRepo = tRepo.replace(/async getSubjectCoverage\(\)[\s\S]*?mastered: sql<number>`SUM\(CASE WHEN \$\{topicProgress\.status\} = 'mastered' THEN 1 ELSE 0 END\)`,\s*\}\)\s*\.from\(topics\)\s*\.leftJoin\(topicProgress, eq\(topics\.id, topicProgress\.topicId\)\)\s*\.where\(sql`NOT EXISTS \(SELECT 1 FROM topics c WHERE c\.parent_topic_id = topics\.id\)`\)\s*\.groupBy\(topics\.subjectId\);\s*return rows as Array<\{ subjectId: number; total: number; seen: number; mastered: number \}>;\s*\}/, `async getSubjectCoverage(): Promise<
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
