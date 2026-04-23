const fs = require('fs');

let tRepo = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

const p5 = /async getReviewCalendarData\(year: number, month: number\): Promise<ReviewDay\[\]> \{\s*const db = getDrizzleDb\(\);\s*const startDate = `\$\{year\}-\$\{String\(month \+ 1\)\.padStart\(2, '0'\)\}-01`;\s*const endDate =\s*month === 11 \? `\$\{year \+ 1\}-01-01` : `\$\{year\}-\$\{String\(month \+ 2\)\.padStart\(2, '0'\)\}-01`;\s*const rows = await db\s*\.select\(\{\s*reviewDate: sql<string>`DATE\(\$\{topicProgress\.fsrsDue\}\)`,\s*topicName: topics\.name,\s*confidence: topicProgress\.confidence,\s*\}\)\s*\.from\(topicProgress\)\s*\.innerJoin\(topics, eq\(topicProgress\.topicId, topics\.id\)\)\s*\.where\(\s*and\(\s*sql`\$\{topicProgress\.status\} != 'unseen'`,\s*isNotNull\(topicProgress\.fsrsDue\),\s*gte\(sql`DATE\(\$\{topicProgress\.fsrsDue\}\)`, startDate\),\s*lt\(sql`DATE\(\$\{topicProgress\.fsrsDue\}\)`, endDate\),\s*\),\s*\)\s*\.orderBy\(topicProgress\.fsrsDue\);\s*const grouped = new Map<string, ReviewDay>\(\);\s*for \(const row of rows\) \{\s*if \(!row\.reviewDate\) continue;\s*if \(!grouped\.has\(row\.reviewDate\)\) \{\s*grouped\.set\(row\.reviewDate, \{\s*date: row\.reviewDate,\s*topicsDue: \[\],\s*avgConfidence: 0,\s*\}\);\s*\}\s*const day = grouped\.get\(row\.reviewDate\)!;\s*day\.topicsDue\.push\(row\.topicName\);\s*day\.avgConfidence \+= row\.confidence \?\? 0;\s*\}\s*for \(const day of grouped\.values\(\)\) \{\s*if \(day\.topicsDue\.length > 0\) \{\s*day\.avgConfidence \/= day\.topicsDue\.length;\s*\}\s*\}\s*return Array\.from\(grouped\.values\(\)\);\s*\}/m;
const repl5 = `async getReviewCalendarData(year: number, month: number): Promise<ReviewDay[]> {
    const rawDb = getDb();
    const startDate = \`\${year}-\${String(month + 1).padStart(2, '0')}-01\`;
    const endDate =
      month === 11 ? \`\${year + 1}-01-01\` : \`\${year}-\${String(month + 2).padStart(2, '0')}-01\`;

    const rows = await rawDb.getAllAsync<{ reviewDate: string; topicName: string; confidence: number }>(\`
      SELECT DATE(p.fsrs_due) as reviewDate, t.name as topicName, p.confidence
      FROM topic_progress p
      JOIN topics t ON p.topic_id = t.id
      WHERE p.status != 'unseen'
        AND p.fsrs_due IS NOT NULL
        AND DATE(p.fsrs_due) >= ?
        AND DATE(p.fsrs_due) < ?
      ORDER BY p.fsrs_due ASC
    \`, [startDate, endDate]);

    const grouped = new Map<string, ReviewDay>();
    for (const row of rows) {
      if (!row.reviewDate) continue;
      if (!grouped.has(row.reviewDate)) {
        grouped.set(row.reviewDate, {
          date: row.reviewDate,
          topicsDue: [],
          avgConfidence: 0,
        });
      }
      const day = grouped.get(row.reviewDate)!;
      day.topicsDue.push(row.topicName);
      day.avgConfidence += row.confidence ?? 0;
    }

    for (const day of grouped.values()) {
      if (day.topicsDue.length > 0) {
        day.avgConfidence /= day.topicsDue.length;
      }
    }
    return Array.from(grouped.values());
  }`;
tRepo = tRepo.replace(p5, repl5);

fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', tRepo);
