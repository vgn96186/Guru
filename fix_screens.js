const fs = require('fs');

// NotesSearchScreen
let nSearch = fs.readFileSync('src/screens/NotesSearchScreen.tsx', 'utf-8');
nSearch = nSearch.replace(/import \{ getDrizzleDb \} from '\.\.\/db\/drizzle';\nimport \{ topics, topicProgress \} from '\.\.\/db\/drizzleSchema';\nimport \{ sql, like, eq \} from 'drizzle-orm';/g, "import { getDb } from '../db/database';");
nSearch = nSearch.replace(/const db = getDrizzleDb\(\);/g, 'const db = getDb();');

const nSearchQuery = /const topicRowsRaw = await db\s*\.select\(\{\s*id: topics\.id,\s*name: topics\.name,\s*user_notes: topicProgress\.userNotes,\s*subject_id: topics\.subjectId,\s*\}\)\s*\.from\(topics\)\s*\.innerJoin\(topicProgress, eq\(topicProgress\.topicId, topics\.id\)\)\s*\.where\(sql`\$\{topicProgress\.userNotes\} != '' AND \(\$\{topics\.name\} LIKE \$\{'%' \+ query \+ '%'} OR \$\{topicProgress\.userNotes\} LIKE \$\{'%' \+ query \+ '%'}\)`\)\s*\.orderBy\(topics\.name\)\s*\.limit\(50\);\s*const topicRows = topicRowsRaw;/;

nSearch = nSearch.replace(nSearchQuery, `const topicRows = await db.getAllAsync<{
          id: number;
          name: string;
          user_notes: string;
          subject_id: number;
        }>(
          \`SELECT t.id, t.name, p.user_notes, t.subject_id
           FROM topics t
           JOIN topic_progress p ON p.topic_id = t.id
           WHERE p.user_notes != ''
             AND (t.name LIKE ? OR p.user_notes LIKE ?)
           ORDER BY t.name ASC
           LIMIT 50\`,
          [\`%\${query}%\`, \`%\${query}%\`],
        );`);

nSearch = nSearch.replace(/await db\.update\(topicProgress\)\.set\(\{ userNotes: '' \}\)\.where\(eq\(topicProgress\.topicId, topicId\)\);/g, "await db.runAsync('UPDATE topic_progress SET user_notes = ? WHERE topic_id = ?', ['', topicId]);");
nSearch = nSearch.replace(/await db\.update\(topicProgress\)\.set\(\{ userNotes: '' \}\)\.where\(eq\(topicProgress\.topicId, id\)\);/g, "await db.runAsync('UPDATE topic_progress SET user_notes = ? WHERE topic_id = ?', ['', id]);");
fs.writeFileSync('src/screens/NotesSearchScreen.tsx', nSearch);

// NotesHubScreen
let nHub = fs.readFileSync('src/screens/NotesHubScreen.tsx', 'utf-8');
nHub = nHub.replace(/import \{ getDrizzleDb \} from '\.\.\/db\/drizzle';\nimport \{ lectureNotes, topicProgress, topics, subjects \} from '\.\.\/db\/drizzleSchema';\nimport \{ sql, eq, desc, asc \} from 'drizzle-orm';/g, "import { getDb } from '../db/database';");
nHub = nHub.replace(/const db = getDrizzleDb\(\);/g, 'const db = getDb();');

const nHubQuery = /const \[lectureCountRows, topicNoteCountRows, recentTopicNotes, failed\] = await Promise\.all\(\[\s*db\.select\(\{\s*count: sql<number>`CAST\(COUNT\(\*\) AS INTEGER\)`\s*\}\)\.from\(lectureNotes\),\s*db\.select\(\{\s*count: sql<number>`CAST\(COUNT\(\*\) AS INTEGER\)`\s*\}\)\.from\(topicProgress\)\.where\(sql`TRIM\(COALESCE\(\$\{topicProgress\.userNotes\}, ''\)\) <> ''`\),\s*db\.select\(\{\s*topic_id: topics\.id,\s*topic_name: topics\.name,\s*subject_id: subjects\.id,\s*subject_name: subjects\.name,\s*user_notes: topicProgress\.userNotes,\s*\}\)\s*\.from\(topicProgress\)\s*\.innerJoin\(topics, eq\(topics\.id, topicProgress\.topicId\)\)\s*\.innerJoin\(subjects, eq\(subjects\.id, topics\.subjectId\)\)\s*\.where\(sql`TRIM\(COALESCE\(\$\{topicProgress\.userNotes\}, ''\)\) <> ''`\)\s*\.orderBy\(desc\(sql`COALESCE\(\$\{topicProgress\.lastStudiedAt\}, 0\)`\), topics\.name\)\s*\.limit\(4\),\s*getFailedOrPendingTranscriptions\(\),\s*\]\);\s*const lectureCountRow = lectureCountRows\[0\] as \{ count: number \};\s*const topicNoteCountRow = topicNoteCountRows\[0\] as \{ count: number \};/;

nHub = nHub.replace(nHubQuery, `const [lectureCountRow, topicNoteCountRow, recentTopicNotes, failed] = await Promise.all([
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM lecture_notes'),
        db.getFirstAsync<{ count: number }>(
          \`SELECT COUNT(*) AS count
           FROM topic_progress
           WHERE TRIM(COALESCE(user_notes, '')) <> ''\`,
        ),
        db.getAllAsync<{
          topic_id: number;
          topic_name: string;
          subject_id: number;
          subject_name: string;
          user_notes: string;
        }>(
          \`SELECT t.id AS topic_id, t.name AS topic_name, s.id AS subject_id, s.name AS subject_name, p.user_notes
           FROM topic_progress p
           JOIN topics t ON t.id = p.topic_id
           JOIN subjects s ON s.id = t.subject_id
           WHERE TRIM(COALESCE(p.user_notes, '')) <> ''
           ORDER BY COALESCE(p.last_studied_at, 0) DESC, t.name ASC
           LIMIT 4\`,
        ),
        getFailedOrPendingTranscriptions(),
      ]);`);
fs.writeFileSync('src/screens/NotesHubScreen.tsx', nHub);

// SyllabusScreen
let syll = fs.readFileSync('src/screens/SyllabusScreen.tsx', 'utf-8');
syll = syll.replace(/import \{ getDb \} from '\.\.\/db\/database';\nimport \{ getDrizzleDb \} from '\.\.\/db\/drizzle';\nimport \{ topics as topicsTable, subjects as subjectsTable \} from '\.\.\/db\/drizzleSchema';\nimport \{ sql, like, eq, desc, asc \} from 'drizzle-orm';/g, "import { getDb } from '../db/database';");
syll = syll.replace(/const db = getDrizzleDb\(\);/g, 'const db = getDb();');

const syllQ1 = /void Promise\.all\(\[\s*db\.select\(\{ subject_id: topicsTable\.subjectId, c: sql`CAST\(COUNT\(\*\) AS INTEGER\)` \}\)\s*\.from\(topicsTable\)\s*\.where\(like\(sql`LOWER\(\$\{topicsTable\.name\}\)`, `%\$\{searchLower\}%`\)\)\s*\.groupBy\(topicsTable\.subjectId\),\s*db\.select\(\{\s*id: topicsTable\.id,\s*name: topicsTable\.name,\s*subject_id: topicsTable\.subjectId,\s*subject_name: subjectsTable\.name,\s*color_hex: subjectsTable\.colorHex\s*\}\)\s*\.from\(topicsTable\)\s*\.innerJoin\(subjectsTable, eq\(subjectsTable\.id, topicsTable\.subjectId\)\)\s*\.where\(like\(sql`LOWER\(\$\{topicsTable\.name\}\)`, `%\$\{searchLower\}%`\)\)\s*\.orderBy\(desc\(topicsTable\.inicetPriority\), asc\(topicsTable\.name\)\)\s*\.limit\(24\)\s*\]\)\.then\(\(\[rows, topicsData\]\) => \{\s*const topics = topicsData as unknown as TopicSearchResult\[\];/g;
syll = syll.replace(syllQ1, `void Promise.all([
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
      ]).then(([rows, topics]) => {`);

const syllQ2 = /const \[countRows, subjectsRaw, coverageRaw\] = await Promise\.all\(\[\s*db\.select\(\{ c: sql`CAST\(COUNT\(\*\) AS INTEGER\)` \}\)\.from\(topicsTable\),\s*db\.select\(\{ id: subjectsTable\.id, name: subjectsTable\.name \}\)\.from\(subjectsTable\),\s*db\.select\(\{ subject_id: topicsTable\.subjectId, c: sql`CAST\(COUNT\(\*\) AS INTEGER\)` \}\)\.from\(topicsTable\)\.groupBy\(topicsTable\.subjectId\)\s*\]\);\s*const countRow = countRows\[0\];\s*const subjects = subjectsRaw as any;\s*const coverage = coverageRaw as any;/g;
syll = syll.replace(syllQ2, `const [countRow, subjects, coverage] = await Promise.all([
      db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM topics'),
      db.getAllAsync<any>('SELECT id, name FROM subjects'),
      db.getAllAsync<any>('SELECT subject_id, COUNT(*) as c FROM topics GROUP BY subject_id'),
    ]);`);
fs.writeFileSync('src/screens/SyllabusScreen.tsx', syll);
