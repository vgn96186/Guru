const fs = require('fs');

let content = fs.readFileSync('src/screens/NotesHubScreen.tsx', 'utf-8');

content = content.replace(/import \{ getDb \} from '\.\.\/db\/database';/g, "import { getDrizzleDb } from '../db/drizzle';\nimport { lectureNotes, topicProgress, topics, subjects } from '../db/drizzleSchema';\nimport { sql, eq, desc } from 'drizzle-orm';");

const queryRegex = /const db = getDb\(\);\n\s*const \[lectureCountRow, topicCountRow, recentRows\] = await Promise\.all\(\[\n\s*db\.getFirstAsync<\s*\{\s*count:\s*number\s*\}\s*>\('SELECT COUNT\(\*\) AS count FROM lecture_notes'\),\n\s*db\.getFirstAsync<\s*\{\s*count:\s*number\s*\}\s*>\(\s*`SELECT COUNT\(\*\) AS count\s*FROM topic_progress\s*WHERE TRIM\(COALESCE\(user_notes, ''\)\) <> ''`,\s*\),\n\s*db\.getAllAsync<\s*\{\s*topic_id:\s*number;\s*topic_name:\s*string;\s*subject_id:\s*number;\s*subject_name:\s*string;\s*user_notes:\s*string;\s*\}\s*>\(\s*`SELECT t\.id AS topic_id, t\.name AS topic_name, s\.id AS subject_id, s\.name AS subject_name, p\.user_notes\s*FROM topic_progress p\s*JOIN topics t ON t\.id = p\.topic_id\s*JOIN subjects s ON s\.id = t\.subject_id\s*WHERE TRIM\(COALESCE\(p\.user_notes, ''\)\) <> ''\s*ORDER BY p\.last_studied_at DESC\s*LIMIT 5`,\s*\),\n\s*\]\);/g;

content = content.replace(queryRegex, `const db = getDrizzleDb();
      const [lectureCountRows, topicCountRows, recentRowsRaw] = await Promise.all([
        db.select({ count: sql\`COUNT(*)\` }).from(lectureNotes),
        db.select({ count: sql\`COUNT(*)\` }).from(topicProgress).where(sql\`TRIM(COALESCE(\${topicProgress.userNotes}, '')) <> ''\`),
        db.select({
          topic_id: topics.id,
          topic_name: topics.name,
          subject_id: subjects.id,
          subject_name: subjects.name,
          user_notes: topicProgress.userNotes,
        })
        .from(topicProgress)
        .innerJoin(topics, eq(topics.id, topicProgress.topicId))
        .innerJoin(subjects, eq(subjects.id, topics.subjectId))
        .where(sql\`TRIM(COALESCE(\${topicProgress.userNotes}, '')) <> ''\`)
        .orderBy(desc(topicProgress.lastStudiedAt))
        .limit(5)
      ]);
      const lectureCountRow = lectureCountRows[0] as { count: number };
      const topicCountRow = topicCountRows[0] as { count: number };
      const recentRows = recentRowsRaw;`);

fs.writeFileSync('src/screens/NotesHubScreen.tsx', content);
