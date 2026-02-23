/**
 * transcriptionService.ts
 *
 * Two engines:
 *  1. Gemini Audio (default, free) — sends raw .m4a directly to Gemini 1.5 Flash
 *     which transcribes + parses topics in one shot. Uses existing Gemini key.
 *  2. OpenAI Whisper (paid, $0.006/min) — sends audio to Whisper for transcript,
 *     then Gemini for medical topic extraction.
 *
 * Note on on-device: Galaxy S10+ (Exynos 9820) can run whisper-tiny.en but
 * integration requires NDK + JNI + CMakeLists.txt setup. Gemini free tier is
 * strictly better for quality. On-device can be added as v3 when needed.
 */

import * as FileSystem from 'expo-file-system/legacy';

export interface LectureAnalysis {
  subject: string;
  topics: string[];
  keyConcepts: string[];
  lectureSummary: string;
  estimatedConfidence: 1 | 2 | 3;
  transcript?: string; // Only populated with OpenAI engine
}

const MEDICAL_EXTRACT_PROMPT = `You are a NEET-PG/INICET medical education assistant analyzing audio from a lecture recording.

The audio was recorded while a student watched a medical lecture app (Marrow, Cerebellum, PrepLadder, DBMCI etc) on their Android phone. The audio is captured from the phone microphone so quality may vary. Lectures are often in Hindi-English mix (Hinglish).

Your task:
1. Transcribe relevant medical content
2. Identify the subject and specific topics covered
3. Extract key concepts as brief bullet points
4. Write a one-line summary

IMPORTANT: For "topics", use standard medical education topic names that would appear in a syllabus. 
Prefer broad recognizable names over ultra-specific terms.
Examples of GOOD topic names: "Renin-Angiotensin System", "Brachial Plexus", "Cardiac Cycle & Heart Sounds", "Hemostasis", "Thyroid Disorders", "Pneumonia", "Fractures", "Glaucoma"
Examples of BAD topic names: "JGA cells", "ACE inhibitors mechanism" (too narrow), "Introduction" (too vague)

Return ONLY valid JSON:
{
  "subject": "Physiology",
  "topics": ["Renin-Angiotensin System", "Cardiovascular System"],
  "key_concepts": [
    "JGA cells release renin in response to low BP",
    "ACE converts Angiotensin I to II in lungs",
    "AT1 receptors mediate vasoconstriction"
  ],
  "lecture_summary": "RAAS pathway from renin release to aldosterone effect",
  "estimated_confidence": 2
}

Subject must be one of: Anatomy, Physiology, Biochemistry, Pathology, Microbiology, Pharmacology, Medicine, Surgery, OBG, Pediatrics, Ophthalmology, ENT, Psychiatry, Radiology, Anesthesia, Dermatology, Orthopedics, Forensic Medicine, SPM
Topics: max 5 specific topics (use standard syllabus names)
Key concepts: max 8 bullet points, each ≤15 words
estimated_confidence: 1=introduced/hard to follow, 2=understood, 3=can explain clearly

If no clear medical content detected (silence, music, ambient noise only), return:
{"subject":"Unknown","topics":[],"key_concepts":[],"lecture_summary":"No medical content detected","estimated_confidence":1}`;

/** Engine 1: Gemini Audio — sends base64 audio directly, handles transcription + extraction */
export async function transcribeWithGemini(
  audioFilePath: string,
  geminiKey: string,
): Promise<LectureAnalysis> {
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;
  
  // 1. Upload to Gemini Files API
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`;
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  
  if (!fileInfo.exists) {
    throw new Error('Audio file does not exist');
  }

  const uploadRes = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'X-Goog-Upload-Protocol': 'raw',
      'X-Goog-Upload-Command': 'start, upload, finalize',
      'X-Goog-Upload-Header-Content-Length': fileInfo.size.toString(),
      'X-Goog-Upload-Header-Content-Type': 'audio/mp4',
      'Content-Type': 'audio/mp4',
    },
  });

  if (uploadRes.status !== 200) {
     throw new Error(`Gemini upload error ${uploadRes.status}: ${uploadRes.body}`);
  }

  const uploadData = JSON.parse(uploadRes.body);
  const fileUriGemini = uploadData.file.uri;

  // 2. Wait for processing if needed (audio usually fast, but good practice)
  // For audio, it's generally immediate enough for a simple generateContent call.

  // 3. Generate Content using the File URI
  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

  const body = {
    contents: [{
      parts: [
        { file_data: { mime_type: 'audio/mp4', file_uri: fileUriGemini } },
        { text: MEDICAL_EXTRACT_PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1000,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(generateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Gemini generate error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini audio');

  const parsed = JSON.parse(text);
  return normalizeParsed(parsed);
}

/** Engine 2: OpenAI Whisper → Gemini topic extraction */
export async function transcribeWithOpenAI(
  audioFilePath: string,
  openaiKey: string,
  geminiKey: string,
): Promise<LectureAnalysis> {
  // Step 1: Whisper transcription
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'lecture.m4a',
    type: 'audio/mp4',
  } as any);
  formData.append('model', 'whisper-1');
  formData.append('language', 'hi'); // Hindi-English mix; Whisper handles Hinglish well

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  });

  if (!whisperRes.ok) {
    const err = await whisperRes.text().catch(() => whisperRes.status.toString());
    throw new Error(`Whisper API error ${whisperRes.status}: ${err}`);
  }

  const whisperData = await whisperRes.json();
  const transcript: string = whisperData.text ?? '';

  if (!transcript.trim()) {
    return { subject: 'Unknown', topics: [], keyConcepts: [], lectureSummary: 'No speech detected', estimatedConfidence: 1, transcript: '' };
  }

  // Step 2: Gemini topic extraction from text transcript
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
  const extractPrompt = `${MEDICAL_EXTRACT_PROMPT}\n\nHere is the lecture transcript:\n"""\n${transcript.slice(0, 8000)}\n"""`;

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: extractPrompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 800, responseMimeType: 'application/json' },
    }),
  });

  if (!geminiRes.ok) throw new Error(`Gemini extract error ${geminiRes.status}`);

  const geminiData = await geminiRes.json();
  const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini extraction');

  const parsed = JSON.parse(text);
  return { ...normalizeParsed(parsed), transcript };
}

function normalizeParsed(raw: any): LectureAnalysis {
  return {
    subject: raw.subject ?? 'Unknown',
    topics: Array.isArray(raw.topics) ? raw.topics.slice(0, 5) : [],
    keyConcepts: Array.isArray(raw.key_concepts) ? raw.key_concepts.slice(0, 8) : [],
    lectureSummary: raw.lecture_summary ?? '',
    estimatedConfidence: ([1, 2, 3].includes(raw.estimated_confidence) ? raw.estimated_confidence : 2) as 1 | 2 | 3,
  };
}

/** Mark analysed topics as 'seen' in the topic_progress DB.
 *  Matching strategy (per AI topic):
 *    1. Exact case-insensitive match within detected subject
 *    2. LIKE contains match within detected subject
 *    3. Reverse contains (DB topic name inside AI topic string)
 *    4. Fallback to cross-subject exact/contains match
 *  This prevents "Cell" matching every topic with "Cell" in the name
 *  while still catching "Renin-Angiotensin" → "Cardiovascular System (CVS)" subtopics.
 */
export function markTopicsFromLecture(
  db: import('expo-sqlite').SQLiteDatabase,
  topics: string[],
  confidence: number,
  subjectName?: string,
): void {
  const today = new Date().toISOString().slice(0, 10);
  // +3 days default review for newly watched topics
  const reviewDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  // Resolve subject ID for scoped matching
  let subjectId: number | null = null;
  if (subjectName) {
    const subj = db.getFirstSync<{ id: number }>(
      `SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)`,
      [subjectName],
    );
    subjectId = subj?.id ?? null;
  }

  const matched = new Set<number>(); // Avoid double-marking

  for (const topicName of topics) {
    const trimmed = topicName.trim();
    if (!trimmed) continue;

    let row: { id: number } | null = null;

    // Strategy 1: Exact match within subject
    if (subjectId) {
      row = db.getFirstSync<{ id: number }>(
        `SELECT id FROM topics WHERE subject_id = ? AND LOWER(name) = LOWER(?)`,
        [subjectId, trimmed],
      );
    }

    // Strategy 2: Contains match within subject (AI topic inside DB topic name)
    if (!row && subjectId) {
      row = db.getFirstSync<{ id: number }>(
        `SELECT id FROM topics WHERE subject_id = ? AND LOWER(name) LIKE LOWER(?)`,
        [subjectId, `%${trimmed}%`],
      );
    }

    // Strategy 3: Reverse contains within subject (DB topic name inside AI topic string)
    if (!row && subjectId) {
      const candidates = db.getAllSync<{ id: number; name: string }>(
        `SELECT id, name FROM topics WHERE subject_id = ?`,
        [subjectId],
      );
      for (const c of candidates) {
        if (trimmed.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(trimmed.toLowerCase())) {
          row = { id: c.id };
          break;
        }
      }
    }

    // Strategy 4: Cross-subject exact match fallback
    if (!row) {
      row = db.getFirstSync<{ id: number }>(
        `SELECT id FROM topics WHERE LOWER(name) = LOWER(?)`,
        [trimmed],
      );
    }

    // Strategy 5: Cross-subject contains fallback
    if (!row) {
      row = db.getFirstSync<{ id: number }>(
        `SELECT id FROM topics WHERE LOWER(name) LIKE LOWER(?)`,
        [`%${trimmed}%`],
      );
    }

    if (!row || matched.has(row.id)) continue;
    matched.add(row.id);

    db.runSync(
      `UPDATE topic_progress SET
        status = CASE WHEN status = 'unseen' THEN 'seen' ELSE status END,
        confidence = MAX(confidence, ?),
        times_studied = times_studied + 1,
        last_studied_at = ?,
        next_review_date = COALESCE(CASE WHEN next_review_date IS NULL THEN ? END, next_review_date)
       WHERE topic_id = ?`,
      [confidence, Date.now(), reviewDate, row.id],
    );
  }

  // Also mark the parent/umbrella topic for the subject as 'seen'
  // (e.g., if AI detected "JGA" under Physiology, also mark "Cardiovascular System (CVS)" parent)
  if (subjectId && matched.size > 0) {
    const matchedIds = Array.from(matched);
    const placeholders = matchedIds.map(() => '?').join(',');
    const parentRows = db.getAllSync<{ parent_topic_id: number }>(
      `SELECT DISTINCT parent_topic_id FROM topics WHERE id IN (${placeholders}) AND parent_topic_id IS NOT NULL`,
      matchedIds,
    );
    for (const pr of parentRows) {
      if (!matched.has(pr.parent_topic_id)) {
        db.runSync(
          `UPDATE topic_progress SET
            status = CASE WHEN status = 'unseen' THEN 'seen' ELSE status END,
            confidence = MAX(confidence, ?),
            last_studied_at = ?
           WHERE topic_id = ?`,
          [confidence, Date.now(), pr.parent_topic_id],
        );
      }
    }
  }
}
