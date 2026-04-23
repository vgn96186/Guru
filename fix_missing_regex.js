const fs = require('fs');

let tRepo = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

const p2 = /async getTopicsBySubject\(subjectId: number \| string\): Promise<TopicWithProgress\[\]> \{\s*const id = Number\(subjectId\);\s*if \(isNaN\(id\)\) return \[\];\s*const rows = await buildTopicsQuery\(eq\(topics\.subjectId, id\), undefined, \[\s*sql`COALESCE\(\$\{topics\.parentTopicId\}, \$\{topics\.id\}\)`,\s*sql`CASE WHEN \$\{topics\.parentTopicId\} IS NULL THEN 0 ELSE 1 END`,\s*desc\(topics\.inicetPriority\),\s*asc\(topics\.name\),\s*\]\);\s*return rows\.map\(mapTopicRow\);\s*\}/m;
const repl2 = `async getTopicsBySubject(subjectId: number | string): Promise<TopicWithProgress[]> {
    const id = Number(subjectId);
    if (isNaN(id)) return [];
    const rawDb = getDb();
    const rows = await rawDb.getAllAsync<any>(\`
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
      WHERE t.subject_id = ?
      ORDER BY COALESCE(t.parent_topic_id, t.id), CASE WHEN t.parent_topic_id IS NULL THEN 0 ELSE 1 END, t.inicet_priority DESC, t.name ASC
    \`, [id]);
    return rows.map(mapTopicRow);
  }`;
tRepo = tRepo.replace(p2, repl2);
fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', tRepo);
