const fs = require('fs');

function processFile(file) {
  let content = fs.readFileSync(file, 'utf-8');

  // Imports
  content = content.replace(/import \{ getDb, nowTs, runInTransaction \} from '\.\.\/\.\.\/db\/database';/g, "import { getDrizzleDb } from '../../db/drizzle';\nimport { subjects, lectureNotes, externalAppLogs } from '../../db/drizzleSchema';\nimport { sql, eq } from 'drizzle-orm';\nconst nowTs = () => Date.now();");

  content = content.replace(/const db = getDb\(\);/g, 'const db = getDrizzleDb();');
  content = content.replace(/await runInTransaction\(/g, 'await db.transaction(');

  // findSubjectId
  const findSubj1 = /let res = await db\.getFirstAsync<\s*\{\s*id:\s*number\s*\}\s*>\(\s*'SELECT id FROM subjects WHERE LOWER\(name\) = LOWER\(\?\)',\s*\[normalized\],\s*\);/g;
  content = content.replace(findSubj1, `let resRaw1 = await db.select({ id: subjects.id }).from(subjects).where(sql\`LOWER(\${subjects.name}) = \${normalized}\`).limit(1);
  let res = resRaw1[0];`);

  const findSubj2 = /res = await db\.getFirstAsync<\s*\{\s*id:\s*number\s*\}\s*>\(\s*'SELECT id FROM subjects WHERE LOWER\(name\) = LOWER\(\?\)',\s*\[mapped\],\s*\);/g;
  content = content.replace(findSubj2, `let resRaw2 = await db.select({ id: subjects.id }).from(subjects).where(sql\`LOWER(\${subjects.name}) = \${mapped.toLowerCase()}\`).limit(1);
    res = resRaw2[0];`);

  const findSubj3 = /res = await db\.getFirstAsync<\s*\{\s*id:\s*number\s*\}\s*>('SELECT id FROM subjects WHERE LOWER\(name\) LIKE \?', \[\s*`%\$\{normalized\}%`,\s*\]\);/g;
  content = content.replace(findSubj3, `let resRaw3 = await db.select({ id: subjects.id }).from(subjects).where(sql\`LOWER(\${subjects.name}) LIKE \${'%' + normalized + '%'}\`).limit(1);
  res = resRaw3[0];`);

  // tx inserts
  const insertNote1 = /const result = await tx\.runAsync\(\s*`INSERT INTO lecture_notes \(\s*subject_id, note, created_at, transcript, summary, topics_json, app_name,\s*duration_minutes, confidence, embedding, recording_path\s*\)\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)`,\s*\[\s*subjectId,\s*opts\.quickNote,\s*nowTs\(\),\s*transcriptUri \?\? analysis\.transcript \?\? null,\s*analysis\.lectureSummary,\s*analysis\.topics \? JSON\.stringify\(analysis\.topics\) : null,\s*opts\.appName,\s*opts\.durationMinutes,\s*analysis\.estimatedConfidence,\s*embeddingForMatching \? embeddingToBlob\(embeddingForMatching\) : null,\s*originalRecordingPath,\s*\],\s*\);\s*const id = result\.lastInsertRowId;/g;
  content = content.replace(insertNote1, `const result = await tx.insert(lectureNotes).values({
        subjectId: subjectId ?? null,
        note: opts.quickNote,
        createdAt: nowTs(),
        transcriptUri: transcriptUri ?? analysis.transcript ?? null,
        summary: analysis.lectureSummary ?? null,
        topicsJson: analysis.topics ? JSON.stringify(analysis.topics) : null,
        appName: opts.appName,
        durationMinutes: opts.durationMinutes,
        confidence: analysis.estimatedConfidence,
        embedding: embeddingForMatching ? embeddingToBlob(embeddingForMatching) : null,
        recordingPath: originalRecordingPath,
      }).returning({ id: lectureNotes.id });
      const id = result[0].id;`);

  const updateExt1 = /await tx\.runAsync\(\s*'UPDATE external_app_logs SET transcription_status = \?, lecture_note_id = \? WHERE id = \?',\s*\['completed', id, opts\.logId\],\s*\);/g;
  content = content.replace(updateExt1, `await tx.update(externalAppLogs)
        .set({ transcriptionStatus: 'completed', lectureNoteId: id })
        .where(eq(externalAppLogs.id, opts.logId));`);

  const renameUpd1 = /await db\.runAsync\('UPDATE lecture_notes SET recording_path = \? WHERE id = \?', \[\s*renamedRecordingPath,\s*noteId,\s*\]\);/g;
  content = content.replace(renameUpd1, `await db.update(lectureNotes).set({ recordingPath: renamedRecordingPath }).where(eq(lectureNotes.id, noteId));`);

  const insertNote2 = /const insertResult = await tx\.runAsync\(\s*`INSERT INTO lecture_notes \(\s*subject_id, note, created_at, transcript_uri, summary, topics_json, app_name,\s*duration_minutes, confidence, embedding, recording_path\s*\)\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)`,\s*\[\s*subjectId,\s*opts\.quickNote,\s*nowTs\(\),\s*transcriptUri,\s*analysis\.lectureSummary,\s*analysis\.topics \? JSON\.stringify\(analysis\.topics\) : null,\s*opts\.appName \?\? 'LectureMode',\s*opts\.durationMinutes,\s*analysis\.estimatedConfidence,\s*embeddingForMatching \? embeddingToBlob\(embeddingForMatching\) : null,\s*opts\.recordingPath \?\? null,\s*\],\s*\);\s*const noteId = insertResult\.lastInsertRowId;/g;
  content = content.replace(insertNote2, `const insertResult = await tx.insert(lectureNotes).values({
      subjectId: subjectId ?? null,
      note: opts.quickNote,
      createdAt: nowTs(),
      transcriptUri: transcriptUri,
      summary: analysis.lectureSummary ?? null,
      topicsJson: analysis.topics ? JSON.stringify(analysis.topics) : null,
      appName: opts.appName ?? 'LectureMode',
      durationMinutes: opts.durationMinutes,
      confidence: analysis.estimatedConfidence,
      embedding: embeddingForMatching ? embeddingToBlob(embeddingForMatching) : null,
      recordingPath: opts.recordingPath ?? null,
    }).returning({ id: lectureNotes.id });
    const noteId = insertResult[0].id;`);

  const renameUpd2 = /await db\.runAsync\('UPDATE lecture_notes SET recording_path = \? WHERE id = \?', \[\s*renamedPath,\s*result\.noteId,\s*\]\);/g;
  content = content.replace(renameUpd2, `await db.update(lectureNotes).set({ recordingPath: renamedPath }).where(eq(lectureNotes.id, result.noteId));`);

  fs.writeFileSync(file, content);
}

processFile('src/services/lecture/persistence.ts');
