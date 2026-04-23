const fs = require('fs');
let text = fs.readFileSync('src/screens/SyllabusScreen.tsx', 'utf-8');

text = text.replace(/import \{ syncVaultSeedTopics, getDb \} from '\.\.\/db\/database';/g, "import { syncVaultSeedTopics } from '../db/database';\nimport { getDrizzleDb } from '../db/drizzle';\nimport { topics as topicsTable, subjects as subjectsTable } from '../db/drizzleSchema';\nimport { sql, like, eq, desc, asc } from 'drizzle-orm';");

const p1 = `const db = getDb();
      void Promise.all([
        db.getAllAsync<{
          subject_id: number;
          c: number;
        }>(
          \`SELECT subject_id, COUNT(*) as c FROM topics WHERE LOWER(name) LIKE ? GROUP BY subject_id\`,
          [\`%\${searchLower}%\`],
        ),
        db.getAllAsync<TopicSearchResult>(
          \`SELECT t.id, t.name, t.subject_id, s.name as subject_name, s.color_hex
         FROM topics t
         JOIN subjects s ON t.subject_id = s.id
         WHERE LOWER(t.name) LIKE ?
         ORDER BY t.inicet_priority DESC, t.name ASC
         LIMIT 24\`,
          [\`%\${searchLower}%\`],
        ),
      ]).then(([rows, topics]) => {`;

const repl1 = `const db = getDrizzleDb();
      void Promise.all([
        db.select({ subject_id: topicsTable.subjectId, c: sql\`CAST(COUNT(*) AS INTEGER)\` })
          .from(topicsTable)
          .where(like(sql\`LOWER(\${topicsTable.name})\`, \`%\${searchLower}%\`))
          .groupBy(topicsTable.subjectId),
        db.select({
          id: topicsTable.id,
          name: topicsTable.name,
          subject_id: topicsTable.subjectId,
          subject_name: subjectsTable.name,
          color_hex: subjectsTable.colorHex
        })
        .from(topicsTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, topicsTable.subjectId))
        .where(like(sql\`LOWER(\${topicsTable.name})\`, \`%\${searchLower}%\`))
        .orderBy(desc(topicsTable.inicetPriority), asc(topicsTable.name))
        .limit(24)
      ]).then(([rows, topicsData]) => {
        const topics = topicsData as unknown as TopicSearchResult[];`;

text = text.replace(p1, repl1);

const p2 = `const db = getDb();
    const [countRow, subjects, coverage] = await Promise.all([
      db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM topics'),
      db.getAllAsync<any>('SELECT id, name FROM subjects'),
      db.getAllAsync<any>('SELECT subject_id, COUNT(*) as c FROM topics GROUP BY subject_id'),
    ]);`;

const repl2 = `const db = getDrizzleDb();
    const [countRows, subjectsRaw, coverageRaw] = await Promise.all([
      db.select({ c: sql\`CAST(COUNT(*) AS INTEGER)\` }).from(topicsTable),
      db.select({ id: subjectsTable.id, name: subjectsTable.name }).from(subjectsTable),
      db.select({ subject_id: topicsTable.subjectId, c: sql\`CAST(COUNT(*) AS INTEGER)\` }).from(topicsTable).groupBy(topicsTable.subjectId)
    ]);
    const countRow = countRows[0];
    const subjects = subjectsRaw as any;
    const coverage = coverageRaw as any;`;

text = text.replace(p2, repl2);

fs.writeFileSync('src/screens/SyllabusScreen.tsx', text);
