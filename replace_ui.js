const fs = require('fs');

let content = fs.readFileSync('src/screens/NotesSearchScreen.tsx', 'utf-8');

content = content.replace(/import \{ getDb \} from '\.\.\/db\/database';/g, "import { getDrizzleDb } from '../db/drizzle';\nimport { topics, topicProgress } from '../db/drizzleSchema';\nimport { sql, like, eq } from 'drizzle-orm';");

content = content.replace(/const db = getDb\(\);/g, 'const db = getDrizzleDb();');

const getAllAsyncRegex = /const topicRows = await db\.getAllAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*user_notes:\s*string;\s*subject_id:\s*number;\s*\}\s*>\(\s*`SELECT t\.id, t\.name, p\.user_notes, t\.subject_id\s*FROM topics t\s*JOIN topic_progress p ON p\.topic_id = t\.id\s*WHERE p\.user_notes != ''\s*AND \(t\.name LIKE \? OR p\.user_notes LIKE \?\)\s*ORDER BY t\.name ASC\s*LIMIT 50`,\s*\[`%\$\{query\}%`, `%\$\{query\}%`\],\s*\);/g;

content = content.replace(getAllAsyncRegex, `const topicRowsRaw = await db
        .select({
          id: topics.id,
          name: topics.name,
          user_notes: topicProgress.userNotes,
          subject_id: topics.subjectId,
        })
        .from(topics)
        .innerJoin(topicProgress, eq(topicProgress.topicId, topics.id))
        .where(sql\`\${topicProgress.userNotes} != '' AND (\${topics.name} LIKE \${'%' + query + '%'} OR \${topicProgress.userNotes} LIKE \${'%' + query + '%'})\`)
        .orderBy(topics.name)
        .limit(50);
      const topicRows = topicRowsRaw;`);

content = content.replace(/await db\.runAsync\('UPDATE topic_progress SET user_notes = \? WHERE topic_id = \?', \[\s*'',\s*topicId,\s*\]\);/g, `await db.update(topicProgress).set({ userNotes: '' }).where(eq(topicProgress.topicId, topicId));`);

content = content.replace(/await db\.runAsync\('UPDATE topic_progress SET user_notes = \? WHERE topic_id = \?', \[\s*'',\s*id,\s*\]\);/g, `await db.update(topicProgress).set({ userNotes: '' }).where(eq(topicProgress.topicId, id));`);

fs.writeFileSync('src/screens/NotesSearchScreen.tsx', content);
