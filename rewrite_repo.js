const fs = require('fs');

let tRepo = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

// We already changed getSubjectStatsAggregated and getSubjectCoverage to raw async SQL! 
// Let's add the same manual async raw SQL strategy to getAllTopicsWithProgress, getTopicsBySubject, getAllSubjects

// getAllTopicsWithProgress
const p1 = /async getAllTopicsWithProgress\(\): Promise<TopicWithProgress\[\]> \{\s*const rows = await buildTopicsQuery\(undefined, undefined, \[desc\(topics\.inicetPriority\)\]\);\s*return rows\.map\(mapTopicRow\);\s*\}/m;
const repl1 = `async getAllTopicsWithProgress(): Promise<TopicWithProgress[]> {
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
      ORDER BY t.inicet_priority DESC
    \`);
    return rows.map(mapTopicRow);
  }`;
tRepo = tRepo.replace(p1, repl1);

// getTopicsBySubject
const p2 = /async getTopicsBySubject\(subjectId: number \| string\): Promise<TopicWithProgress\[\]> \{\s*const id = Number\(subjectId\);\s*const rows = await buildTopicsQuery\(eq\(topics\.subjectId, id\), undefined, \[\s*sql`COALESCE\(\$\{topics\.parentTopicId\}, \$\{topics\.id\}\)`,\s*sql`CASE WHEN \$\{topics\.parentTopicId\} IS NULL THEN 0 ELSE 1 END`,\s*desc\(topics\.inicetPriority\),\s*asc\(topics\.name\),\s*\]\);\s*return rows\.map\(mapTopicRow\);\s*\}/m;
const repl2 = `async getTopicsBySubject(subjectId: number | string): Promise<TopicWithProgress[]> {
    const id = Number(subjectId);
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

// getAllSubjects
const p3 = /async getAllSubjects\(\): Promise<Subject\[\]> \{\s*const db = getDrizzleDb\(\);\s*const rows = await db\.select\(\)\.from\(subjects\)\.orderBy\(subjects\.displayOrder\);\s*return rows\.map\(\(r\) => \(\{\s*\.\.\.r,\s*inicetWeight: r\.inicetWeight,\s*neetWeight: r\.neetWeight,\s*displayOrder: r\.displayOrder,\s*\}\)\);\s*\}/m;
const repl3 = `async getAllSubjects(): Promise<Subject[]> {
    const rawDb = getDb();
    const rows = await rawDb.getAllAsync<any>(\`
      SELECT id, name, short_code as shortCode, color_hex as colorHex, inicet_weight as inicetWeight, neet_weight as neetWeight, display_order as displayOrder, created_at as createdAt
      FROM subjects
      ORDER BY display_order ASC
    \`);
    return rows;
  }`;
tRepo = tRepo.replace(p3, repl3);

// searchTopicsByName
const p4 = /async searchTopicsByName\(query: string, limitCount = 50\): Promise<TopicWithProgress\[\]> \{\s*const trimmed = query\.trim\(\)\.toLowerCase\(\);\s*if \(!trimmed\) return \[\];\s*const rows = await buildTopicsQuery\(\s*sql`\$\{topics\.name\} LIKE \$\{'%' \+ trimmed \+ '%'}\`,\s*limitCount,\s*\[desc\(topics\.inicetPriority\), asc\(topics\.name\)\],\s*\);\s*return rows\.map\(mapTopicRow\);\s*\}/m;
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
