const fs = require('fs');

function processFile(file) {
  let content = fs.readFileSync(file, 'utf-8');

  // Replace import
  content = content.replace(/import \{ getDb \} from '..\/..\/..\/..\/db\/database';/g, "import { getDrizzleDb } from '../../../../db/drizzle';\nimport { topics, topicProgress, subjects, questionBank, aiCache } from '../../../../db/drizzleSchema';\nimport { sql, like, eq } from 'drizzle-orm';");
  content = content.replace(/const \{ getDb \} = await import\('\.\.\/\.\.\/\.\.\/\.\.\/db\/database'\);/g, "const { getDrizzleDb } = await import('../../../../db/drizzle');\n    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');\n    const { sql, like, eq } = await import('drizzle-orm');");

  // Replace await getDb() with getDrizzleDb()
  content = content.replace(/const db = await getDb\(\);/g, 'const db = getDrizzleDb();');

  // Replace topic finding
  const topicQueryRegex = /const topicRow = await db\.getFirstAsync<\s*\{\s*id:\s*number;\s*name:\s*string\s*\}\s*>\(\s*`\s*SELECT id, name FROM topics\s*WHERE lower\(name\) LIKE lower\(\?\)\s*ORDER BY LENGTH\(name\) ASC LIMIT 1\s*`,\s*\[`%\$\{topicName\}%`\],\s*\);/g;
  content = content.replace(topicQueryRegex, `const rows = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(like(sql\`lower(\${topics.name})\`, \`%\${topicName.toLowerCase()}%\`))
      .orderBy(sql\`LENGTH(\${topics.name}) ASC\`)
      .limit(1);
    const topicRow = rows[0];`);

  // Questions fetch
  const questionsRegex = /const questions = await db\.getAllAsync<\s*\{\s*id:\s*number;\s*stem:\s*string;\s*options_json:\s*string;\s*correct_index:\s*number;\s*explanation:\s*string\s*\|\s*null;\s*\}\s*>\(\s*`\s*SELECT id, stem, options_json, correct_index, explanation\s*FROM question_bank\s*WHERE topic_id = \?\s*ORDER BY RANDOM\(\)\s*LIMIT \?\s*`,\s*\[topicRow\.id, questionCount\],\s*\);/g;
  content = content.replace(questionsRegex, `const questionsRaw = await db
      .select({
        id: questionBank.id,
        stem: questionBank.stem,
        options_json: questionBank.optionsJson,
        correct_index: questionBank.correctIndex,
        explanation: questionBank.explanation,
      })
      .from(questionBank)
      .where(eq(questionBank.topicId, topicRow.id))
      .orderBy(sql\`RANDOM()\`)
      .limit(questionCount);
    const questions = questionsRaw.map(q => ({
      id: q.id,
      stem: q.stem,
      options_json: q.options_json ?? '[]',
      correct_index: q.correct_index,
      explanation: q.explanation,
    }));`);

  // Topic description
  const topicDescRegex = /const topicRow = await db\.getFirstAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*description:\s*string\s*\|\s*null;\s*\}\s*>\(\s*`\s*SELECT id, name, description FROM topics\s*WHERE lower\(name\) LIKE lower\(\?\)\s*ORDER BY LENGTH\(name\) ASC LIMIT 1\s*`,\s*\[`%\$\{topicName\}%`\],\s*\);/g;
  content = content.replace(topicDescRegex, `const rows = await db
      .select({ id: topics.id, name: topics.name, description: topics.description })
      .from(topics)
      .where(like(sql\`lower(\${topics.name})\`, \`%\${topicName.toLowerCase()}%\`))
      .orderBy(sql\`LENGTH(\${topics.name}) ASC\`)
      .limit(1);
    const topicRow = rows[0];`);

  // AI cache keypoints
  const aiCacheRegex = /const cachedContent = await db\.getFirstAsync<\s*\{\s*content_json:\s*string\s*\}\s*>\(\s*`SELECT content_json FROM guru_aicache\.ai_cache WHERE topic_id = \? AND content_type = 'keypoints'`,\s*\[topicRow\.id\],\s*\);/g;
  content = content.replace(aiCacheRegex, `const cacheRows = await db
        .select({ content_json: aiCache.contentJson })
        .from(aiCache)
        .where(sql\`\${aiCache.topicId} = \${topicRow.id} AND \${aiCache.contentType} = 'keypoints'\`)
        .limit(1);
      const cachedContent = cacheRows[0];`);

  // The long topic query
  const bigTopicRegex = /const topicRow = await db\.getFirstAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*subjectName:\s*string;\s*status:\s*string\s*\|\s*null;\s*confidence:\s*number\s*\|\s*null;\s*\}\s*>\(\s*`SELECT t\.id, t\.name, s\.name as subjectName, p\.status, p\.confidence\s*FROM topics t\s*JOIN subjects s ON t\.subject_id = s\.id\s*LEFT JOIN topic_progress p ON p\.topic_id = t\.id\s*WHERE lower\(t\.name\) LIKE lower\(\?\)\s*ORDER BY LENGTH\(t\.name\) ASC LIMIT 1`,\s*\[`%\$\{topicName\}%`\],\s*\);/g;
  content = content.replace(bigTopicRegex, `const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql\`lower(\${topics.name})\`, \`%\${topicName.toLowerCase()}%\`))
      .orderBy(sql\`LENGTH(\${topics.name}) ASC\`)
      .limit(1);
    const topicRow = rows[0];`);

  fs.writeFileSync(file, content);
}

processFile('src/services/ai/v2/tools/contentTools.ts');
