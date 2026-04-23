const fs = require('fs');

let content = fs.readFileSync('src/screens/SyllabusScreen.tsx', 'utf-8');

content = content.replace(/import \{ getDb \} from '\.\.\/db\/database';/g, "import { getDb } from '../db/database';\nimport { getDrizzleDb } from '../db/drizzle';\nimport { topics, subjects } from '../db/drizzleSchema';\nimport { sql, like, eq, desc, asc } from 'drizzle-orm';");

const getDb1 = /const db = getDb\(\);\n\s*Promise\.all\(\[\n\s*db\.getAllAsync<\s*\{\s*subject_id:\s*number;\s*c:\s*number;\s*\}\s*>\(\s*`SELECT subject_id, COUNT\(\*\) as c FROM topics WHERE LOWER\(name\) LIKE \? GROUP BY subject_id`,\s*\[`%\$\{searchLower\}%`\],\s*\),\n\s*db\.getAllAsync<TopicSearchResult>\(\s*`SELECT t\.id, t\.name, t\.subject_id, s\.name as subject_name, s\.color_hex\s*FROM topics t\s*JOIN subjects s ON t\.subject_id = s\.id\s*WHERE LOWER\(t\.name\) LIKE \?\s*ORDER BY t\.inicet_priority DESC, t\.name ASC\s*LIMIT 24`,\s*\[`%\$\{searchLower\}%`\],\s*\),\n\s*\]\)\.then\(\(\[rows, topics\]\) => \{/g;

content = content.replace(getDb1, `const db = getDrizzleDb();
      Promise.all([
        db.select({ subject_id: topics.subjectId, c: sql\`CAST(COUNT(*) AS INTEGER)\` })
          .from(topics)
          .where(like(sql\`LOWER(\${topics.name})\`, \`%\${searchLower}%\`))
          .groupBy(topics.subjectId),
        db.select({
          id: topics.id,
          name: topics.name,
          subject_id: topics.subjectId,
          subject_name: subjects.name,
          color_hex: subjects.colorHex
        })
        .from(topics)
        .innerJoin(subjects, eq(subjects.id, topics.subjectId))
        .where(like(sql\`LOWER(\${topics.name})\`, \`%\${searchLower}%\`))
        .orderBy(desc(topics.inicetPriority), asc(topics.name))
        .limit(24),
      ]).then(([rows, topicsData]) => {
        const topics = topicsData as unknown as TopicSearchResult[];`);

const getDb2 = /const db = getDb\(\);\n\s*const \[countRow, subjects, coverage\] = await Promise\.all\(\[\n\s*db\.getFirstAsync<\s*\{\s*c:\s*number\s*\}\s*>('SELECT COUNT\(\*\) as c FROM topics'),\n\s*db\.getAllAsync<any>\('SELECT id, name FROM subjects'\),\n\s*db\.getAllAsync<any>\('SELECT subject_id, COUNT\(\*\) as c FROM topics GROUP BY subject_id'\),\n\s*\]\);/g;

content = content.replace(getDb2, `const db = getDrizzleDb();
    const [countRows, subjectsData, coverageData] = await Promise.all([
      db.select({ c: sql\`CAST(COUNT(*) AS INTEGER)\` }).from(topics),
      db.select({ id: subjects.id, name: subjects.name }).from(subjects),
      db.select({ subject_id: topics.subjectId, c: sql\`CAST(COUNT(*) AS INTEGER)\` }).from(topics).groupBy(topics.subjectId),
    ]);
    const countRow = countRows[0];
    const subjects = subjectsData as any;
    const coverage = coverageData as any;`);

fs.writeFileSync('src/screens/SyllabusScreen.tsx', content);
