const fs = require('fs');

let tRepo = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

const p4 = /async searchTopicsByName\(query: string, limitCount = 50\): Promise<TopicWithProgress\[\]> \{\s*const trimmed = query\.trim\(\);\s*if \(!trimmed\) return \[\];\s*const rows = await buildTopicsQuery\(\s*sql`\$\{topics\.name\} LIKE \$\{'%' \+ trimmed \+ '%'}\`,\s*limitCount,\s*\[desc\(topics\.inicetPriority\), asc\(topics\.name\)\],\s*\);\s*return rows\.map\(mapTopicRow\);\s*\}/m;
const repl4 = `async searchTopicsByName(query: string, limitCount = 50): Promise<TopicWithProgress[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
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
      WHERE LOWER(t.name) LIKE ?
      ORDER BY t.inicet_priority DESC, t.name ASC
      LIMIT ?
    \`, [\`%\${trimmed}%\`, limitCount]);
    return rows.map(mapTopicRow);
  }`;
tRepo = tRepo.replace(p4, repl4);
fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', tRepo);
