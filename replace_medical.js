const fs = require('fs');

function processFile(file) {
  let content = fs.readFileSync(file, 'utf-8');

  // Replace import
  content = content.replace(/import \{ getDb \} from '..\/..\/..\/..\/db\/database';/g, "import { getDrizzleDb } from '../../../../db/drizzle';\nimport { topics, topicProgress, questionBank, topicNotes } from '../../../../db/drizzleSchema';\nimport { sql, like, eq } from 'drizzle-orm';");
  content = content.replace(/const \{ getDb \} = await import\('\.\.\/\.\.\/\.\.\/\.\.\/db\/database'\);/g, "const { getDrizzleDb } = await import('../../../../db/drizzle');\n    const { topics } = await import('../../../../db/drizzleSchema');\n    const { sql, like } = await import('drizzle-orm');");

  // Replace await getDb() with getDrizzleDb()
  content = content.replace(/const db = await getDb\(\);/g, 'const db = getDrizzleDb();');

  // lookup_topic
  const lookupRegex = /const row = await db\.getFirstAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*status:\s*string;\s*confidence:\s*number\s*\|\s*null;\s*subject_id:\s*number;\s*stability:\s*number\s*\|\s*null;\s*\}\s*>\(\s*`SELECT t\.id, t\.name, p\.status, p\.confidence, t\.subject_id, p\.stability\s*FROM topics t\s*LEFT JOIN topic_progress p ON p\.topic_id = t\.id\s*WHERE lower\(t\.name\) LIKE lower\(\?\)\s*ORDER BY LENGTH\(t\.name\) ASC\s*LIMIT 1`,\s*\[`%\$\{name\}%`\],\s*\);/g;
  content = content.replace(lookupRegex, `const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
        subject_id: topics.subjectId,
        stability: topicProgress.fsrsStability,
      })
      .from(topics)
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql\`lower(\${topics.name})\`, \`%\${name.toLowerCase()}%\`))
      .orderBy(sql\`LENGTH(\${topics.name}) ASC\`)
      .limit(1);
    const row = rows[0];`);

  // get_quiz_questions
  const questionsRegex = /const rows = await db\.getAllAsync<\s*\{\s*id:\s*number;\s*stem:\s*string;\s*options_json:\s*string;\s*correct_index:\s*number;\s*explanation:\s*string\s*\|\s*null;\s*\}\s*>\(\s*`SELECT id, stem, options_json, correct_index, explanation\s*FROM question_bank\s*WHERE topic_id = \?\s*ORDER BY RANDOM\(\)\s*LIMIT \?`,\s*\[topicId, limit \?\? 3\],\s*\);/g;
  content = content.replace(questionsRegex, `const rowsRaw = await db
      .select({
        id: questionBank.id,
        stem: questionBank.stem,
        options_json: questionBank.optionsJson,
        correct_index: questionBank.correctIndex,
        explanation: questionBank.explanation,
      })
      .from(questionBank)
      .where(eq(questionBank.topicId, topicId))
      .orderBy(sql\`RANDOM()\`)
      .limit(limit ?? 3);
    const rows = rowsRaw.map(r => ({
      id: r.id,
      stem: r.stem,
      options_json: r.options_json ?? '[]',
      correct_index: r.correct_index,
      explanation: r.explanation,
    }));`);

  // save_to_notes
  const saveNotesRegex = /await db\.runAsync\(\s*`INSERT INTO topic_notes \(topic_id, content, created_at, updated_at\)\s*VALUES \(\?, \?, \?, \?\)`,\s*\[topicId, content, Date\.now\(\), Date\.now\(\)\],\s*\);/g;
  content = content.replace(saveNotesRegex, `await db.insert(topicNotes).values({
        topicId,
        content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });`);

  // mark_topic_reviewed
  const markReviewRegex = /await db\.runAsync\(\s*`UPDATE topic_progress \s*SET status = 'reviewed', confidence = \?, last_studied_at = \?\s*WHERE topic_id = \?`,\s*\[confidence, Date\.now\(\), topicId\],\s*\);/g;
  content = content.replace(markReviewRegex, `await db.update(topicProgress)
        .set({ status: 'reviewed', confidence, lastStudiedAt: Date.now() })
        .where(eq(topicProgress.topicId, topicId));`);

  // generate_flashcards
  const findTopicRegex = /const topicRow = await db\.getFirstAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*subject_id:\s*number;\s*\}\s*>\(\s*`SELECT t\.id, t\.name, t\.subject_id FROM topics t\s*WHERE lower\(t\.name\) LIKE lower\(\?\)\s*ORDER BY LENGTH\(t\.name\) ASC LIMIT 1`,\s*\[`%\$\{topicName\}%`\],\s*\);/g;
  content = content.replace(findTopicRegex, `const rows = await db
        .select({ id: topics.id, name: topics.name, subject_id: topics.subjectId })
        .from(topics)
        .where(like(sql\`lower(\${topics.name})\`, \`%\${topicName.toLowerCase()}%\`))
        .orderBy(sql\`LENGTH(\${topics.name}) ASC\`)
        .limit(1);
      const topicRow = rows[0];`);

  fs.writeFileSync(file, content);
}

processFile('src/services/ai/v2/tools/medicalTools.ts');
