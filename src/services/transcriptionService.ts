/**
 * transcriptionService.ts
 *
 * Engines:
 *  1. Local Whisper (on-device) for offline transcription
 *  2. Groq Whisper (cloud) for transcription when local model is unavailable
 *
 * Transcript analysis/extraction is always routed through aiService
 * (local model first, then Groq/OpenRouter cloud fallback).
 */

import * as FileSystem from 'expo-file-system/legacy';
import { z } from 'zod';
import { generateJSONWithRouting, generateTextWithRouting, getApiKeys } from './aiService';
import { initWhisper } from 'whisper.rn';
import { convertToWav } from '../../modules/app-launcher';
import { getUserProfile } from '../db/queries/progress';

const LOG_TAG = '[Transcription]';

/** Slice text at a word boundary to avoid cutting mid-word. */
function sliceAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sliced = text.slice(0, maxLen);
  const lastSpace = sliced.lastIndexOf(' ');
  return lastSpace > maxLen * 0.8 ? sliced.slice(0, lastSpace) : sliced;
}

/**
 * Medical vocabulary hint for Whisper's `prompt` parameter.
 * This biases the model toward correct medical term spellings
 * and handles Hindi-English (Hinglish) code-switching common in
 * Indian medical lectures.
 */
const WHISPER_MEDICAL_PROMPT =
  'Medical lecture: NEET-PG, INICET preparation. ' +
  'Common terms: hemostasis, renin-angiotensin system, glomerular filtration rate, ' +
  'brachial plexus, pneumonia, cirrhosis, pharmacokinetics, pharmacodynamics, ' +
  'myocardial infarction, atherosclerosis, nephrotic syndrome, ' +
  'ECG, ABG, CSF, MRI, CT scan, CBC, LFT, RFT, ABG. ' +
  'Hindi-English mix (Hinglish). Toh, matlab, yahan pe, dekhiye, samajh lo.';

export interface LectureAnalysis {
  subject: string;
  topics: string[];
  keyConcepts: string[];
  lectureSummary: string;
  estimatedConfidence: 1 | 2 | 3;
  transcript?: string; // Raw/cleaned transcript text, when available
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

const LectureAnalysisSchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  key_concepts: z.array(z.string()),
  lecture_summary: z.string(),
  estimated_confidence: z.number().int().min(1).max(3),
});

function createEmptyAnalysis(lectureSummary: string, transcript = ''): LectureAnalysis {
  return {
    subject: 'Unknown',
    topics: [],
    keyConcepts: [],
    lectureSummary,
    estimatedConfidence: 1,
    transcript,
  };
}

/** Cloud fallback: Groq Whisper transcription */
export async function transcribeRawWithGroq(
  audioFilePath: string,
  groqKey: string,
): Promise<string> {
  if (!groqKey?.trim()) {
    throw new Error('Groq API key missing. Add one in Settings or enable Local Whisper.');
  }
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'lecture.m4a',
    type: 'audio/mp4',
  } as any);
  formData.append('model', 'whisper-large-v3-turbo');
  // Don't hardcode language — let Whisper auto-detect for Hinglish lectures
  formData.append('temperature', '0');
  formData.append('prompt', WHISPER_MEDICAL_PROMPT);

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq transcription error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const rawTranscript = String(data?.text ?? '').trim();
  return sanitizeTranscript(rawTranscript);
}

export async function transcribeWithGroq(
  audioFilePath: string,
  groqKey: string,
): Promise<LectureAnalysis> {
  const transcript = await transcribeRawWithGroq(audioFilePath, groqKey);
  if (!transcript) {
    return createEmptyAnalysis('No speech detected');
  }

  const analysis = await analyzeTranscript(transcript);
  return { ...analysis, transcript };
}

/** Engine 2: OpenAI Whisper → local/Groq extraction */
export async function transcribeRawWithOpenAI(
  audioFilePath: string,
  openaiKey: string,
): Promise<string> {
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'lecture.m4a',
    type: 'audio/mp4',
  } as any);
  formData.append('model', 'whisper-1');
  // Don't hardcode language — let Whisper auto-detect for Hinglish lectures
  formData.append('prompt', WHISPER_MEDICAL_PROMPT);

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
  const rawTranscript = String(whisperData?.text ?? '').trim();
  return sanitizeTranscript(rawTranscript);
}

export async function transcribeWithOpenAI(
  audioFilePath: string,
  openaiKey: string,
): Promise<LectureAnalysis> {
  const transcript = await transcribeRawWithOpenAI(audioFilePath, openaiKey);
  if (!transcript) {
    return createEmptyAnalysis('No speech detected');
  }

  const analysis = await analyzeTranscript(transcript);
  return { ...analysis, transcript };
}

/** Engine 3: Local Whisper.rn → Local Llama (via aiService routing) */
export async function transcribeRawWithLocalWhisper(
  audioFilePath: string,
  localWhisperPath: string,
): Promise<string> {
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;

  // Check file exists and log size
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  console.log(`${LOG_TAG} Audio file: ${audioFilePath}, exists: ${fileInfo.exists}, size: ${fileInfo.exists ? fileInfo.size : 0} bytes`);
  if (!fileInfo.exists || fileInfo.size === 0) {
    return '';
  }

  // 1. Convert M4A → WAV (whisper.rn only accepts WAV/PCM input)
  let whisperInputUri = fileUri;
  if (audioFilePath.endsWith('.m4a') || audioFilePath.endsWith('.mp4')) {
    console.log(`${LOG_TAG} Converting M4A to WAV for Whisper...`);
    const wavPath = await convertToWav(audioFilePath);
    if (wavPath) {
      whisperInputUri = wavPath.startsWith('file://') ? wavPath : `file://${wavPath}`;
      console.log(`${LOG_TAG} WAV conversion done: ${wavPath}`);
    } else {
      console.warn(`${LOG_TAG} WAV conversion failed, trying original file`);
    }
  }

  // 2. Initialize Whisper
  const whisperContext = await initWhisper({ filePath: localWhisperPath });

  // 3. Transcribe — prefer fast greedy decoding so the return flow is responsive.
  try {
    const { promise } = whisperContext.transcribe(whisperInputUri, {
      language: 'en',
      maxThreads: 4,
      maxContext: 0,
      maxLen: 64,
      tokenTimestamps: false,
      beamSize: 1,
      bestOf: 1,
      temperature: 0,
      prompt: WHISPER_MEDICAL_PROMPT,
    });

    const { result } = await promise;
    console.log(`${LOG_TAG} Raw Whisper result: "${result}"`);

    // Filter out Whisper noise/non-speech tokens before checking for content
    const rawTranscript: string = result?.trim() ?? '';
    return sanitizeTranscript(rawTranscript);
  } finally {
    await whisperContext.release();
    // Clean up the converted WAV file if we created one
    if (whisperInputUri !== fileUri) {
      try {
        await FileSystem.deleteAsync(whisperInputUri, { idempotent: true });
        console.log(`${LOG_TAG} Cleaned up temp WAV file`);
      } catch { /* best effort */ }
    }
  }
}

export async function transcribeWithLocalWhisper(
  audioFilePath: string,
  localWhisperPath: string,
): Promise<LectureAnalysis> {
  const transcript = await transcribeRawWithLocalWhisper(audioFilePath, localWhisperPath);
  if (!transcript) {
    return createEmptyAnalysis('No speech detected locally');
  }

  const analysis = await analyzeTranscript(transcript);
  return { ...analysis, transcript };
}

/**
 * Unified transcription entry point — Groq first, local Whisper fallback.
 * Callers should use this instead of calling individual engines directly.
 */
export async function transcribeAudio(audioFilePath: string): Promise<LectureAnalysis> {
  const profile = getUserProfile();
  const { groqKey } = getApiKeys();
  const hasGroq = !!groqKey?.trim();
  const hasLocal = !!(profile.useLocalWhisper && profile.localWhisperPath);

  if (!hasGroq && !hasLocal) {
    throw new Error('No transcription engine available. Enable Local Whisper or add a Groq API key in Settings.');
  }

  // Try Groq first
  if (hasGroq) {
    try {
      return await transcribeWithGroq(audioFilePath, groqKey!);
    } catch (err) {
      console.warn(`${LOG_TAG} Groq transcription failed, falling back to local:`, (err as Error).message);
      if (!hasLocal) throw err;
    }
  }

  // Fall back to local Whisper
  return await transcribeWithLocalWhisper(audioFilePath, profile.localWhisperPath!);
}

function sanitizeTranscript(rawTranscript: string): string {
  const NOISE_PATTERNS = /^\s*(\(.*?\)|\[.*?\]|\*.*?\*)\s*$/i;
  return rawTranscript
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !NOISE_PATTERNS.test(l))
    .join('\n')
    .trim();
}

export async function analyzeTranscript(
  transcript: string,
): Promise<LectureAnalysis> {
  const extractPrompt = `${MEDICAL_EXTRACT_PROMPT}\n\nHere is the lecture transcript:\n"""\n${sliceAtWordBoundary(transcript, 12000)}\n"""`;

  try {
    const { parsed } = await generateJSONWithRouting(
      [{ role: 'user', content: extractPrompt }],
      LectureAnalysisSchema,
      'high',
    );
    return normalizeParsed(parsed);
  } catch (err) {
    console.warn(`${LOG_TAG} LLM topic extraction failed, using basic fallback:`, (err as Error).message);
    return buildFallbackAnalysis(transcript);
  }
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

/** Keyword-based subject detection when LLM is unavailable */
const SUBJECT_KEYWORDS: Record<string, string[]> = {
  'Biochemistry': ['glucose', 'glycogen', 'enzyme', 'amino acid', 'protein', 'lipid', 'carbohydrate', 'ATP', 'krebs', 'glycolysis', 'metabolism', 'DNA', 'RNA', 'nucleotide', 'coenzyme', 'vitamin', 'oxidation', 'reduction', 'fatty acid', 'cholesterol', 'urea cycle', 'dehydration', 'polysaccharide', 'disaccharide', 'monosaccharide', 'fructose', 'galactose', 'sucrose', 'lactose', 'maltose'],
  'Physiology': ['cardiac output', 'blood pressure', 'heart rate', 'GFR', 'renal', 'nerve', 'action potential', 'synapse', 'reflex', 'ventilation', 'respiration', 'hemoglobin', 'oxygen', 'baroreceptor', 'hormone', 'endocrine', 'renin', 'angiotensin', 'aldosterone'],
  'Anatomy': ['muscle', 'nerve', 'artery', 'vein', 'bone', 'ligament', 'tendon', 'fascia', 'plexus', 'foramen', 'fossa', 'triangle', 'vertebra', 'thorax', 'abdomen', 'pelvis', 'limb'],
  'Pathology': ['neoplasm', 'tumor', 'cancer', 'inflammation', 'necrosis', 'apoptosis', 'edema', 'thrombus', 'embolism', 'infarction', 'granuloma', 'abscess', 'metaplasia', 'dysplasia', 'hyperplasia', 'atrophy', 'hypertrophy'],
  'Pharmacology': ['drug', 'receptor', 'agonist', 'antagonist', 'dose', 'bioavailability', 'half-life', 'clearance', 'side effect', 'contraindication', 'mechanism of action', 'pharmacokinetics', 'pharmacodynamics'],
  'Microbiology': ['bacteria', 'virus', 'fungus', 'parasite', 'gram positive', 'gram negative', 'culture', 'antibiotic', 'infection', 'immunity', 'vaccine', 'antigen', 'antibody', 'PCR', 'staining'],
  'Medicine': ['diabetes', 'hypertension', 'fever', 'anemia', 'jaundice', 'cirrhosis', 'COPD', 'asthma', 'pneumonia', 'tuberculosis', 'heart failure', 'thyroid', 'liver', 'kidney disease'],
  'Surgery': ['incision', 'suture', 'wound', 'fracture', 'hernia', 'appendicitis', 'cholecystectomy', 'laparoscopy', 'abscess', 'drainage', 'debridement'],
};

/**
 * Builds a basic LectureAnalysis from transcript text when LLM is unavailable.
 * Uses keyword matching to detect subject and extracts key sentences.
 */
function buildFallbackAnalysis(transcript: string): LectureAnalysis {
  const lower = transcript.toLowerCase();

  // Detect subject by keyword frequency
  let bestSubject = 'Unknown';
  let bestScore = 0;
  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSubject = subject;
    }
  }

  // Extract key concepts: pick sentences with medical-sounding words, limit to 5
  const sentences = transcript
    .replace(/\s+/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200);
  const keyConcepts = sentences.slice(0, 5);

  // Summary: first substantial sentence
  const summary = sentences[0]
    ? sentences[0].slice(0, 120) + (sentences[0].length > 120 ? '...' : '')
    : 'Lecture content recorded';

  return {
    subject: bestSubject,
    topics: [], // Can't reliably extract topic names without LLM
    keyConcepts,
    lectureSummary: summary,
    estimatedConfidence: 2,
  };
}

// ──────────────────────────────────────────────────
// ADHD-Friendly Note Generation
// ──────────────────────────────────────────────────

const ADHD_NOTE_SYSTEM_PROMPT = `You create study notes for a medical student with ADHD.
Rules:
- SCANNABLE: Short chunks, never walls of text. Max 250 words total.
- VISUAL: Use emoji anchors so the eye has landmarks.
- MEMORABLE: Include one weird/funny mnemonic or analogy for the hardest concept.
- ACTIONABLE: End with 2 quick self-test questions.

Format EXACTLY like this (markdown):

# [EMOJI] [Topic] — [One-line hook that sparks curiosity]

## TL;DR
[2-3 sentences MAX. The "if you remember nothing else" version.]

## Key Points
1. **[Trigger word]** — one-line explanation
2. **[Trigger word]** — one-line explanation
(max 6 points, each ONE line)

## Memory Hook
[A weird analogy, mnemonic, or mental image. Make it STICK.]

## Quick Self-Test
- Q: [question]?
- Q: [question]?

Return ONLY the formatted note. No preamble, no sign-off.`;

/**
 * Generate an ADHD-friendly formatted note from a lecture analysis.
 * Uses the LLM routing chain (local → Groq → OpenRouter).
 * Falls back to a basic formatted version if LLM fails.
 */
export async function generateADHDNote(analysis: LectureAnalysis): Promise<string> {
  const input = `Subject: ${analysis.subject}
Topics: ${analysis.topics.join(', ')}
Key concepts:
${analysis.keyConcepts.map(c => `- ${c}`).join('\n')}
Summary: ${analysis.lectureSummary}
Confidence level: ${analysis.estimatedConfidence} (1=introduced, 2=understood, 3=can explain)`;

  try {
    const { text } = await generateTextWithRouting(
      [
        { role: 'system', content: ADHD_NOTE_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
    );
    const trimmed = text.trim();
    if (trimmed.length > 50) return trimmed; // Valid note
    throw new Error('Generated note too short');
  } catch (e) {
    console.warn(`${LOG_TAG} ADHD note generation failed, using fallback:`, (e as Error).message);
    return buildQuickLectureNote(analysis);
  }
}

/** Simple fallback when LLM is unavailable */
export function buildQuickLectureNote(analysis: LectureAnalysis): string {
  const emoji = analysis.estimatedConfidence === 3 ? '🌳' : analysis.estimatedConfidence === 2 ? '🌿' : '🌱';
  const topicStr = analysis.topics.length > 0 ? analysis.topics[0] : analysis.subject;
  const points = analysis.keyConcepts
    .slice(0, 6)
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n');

  return `# ${emoji} ${topicStr} — ${analysis.lectureSummary}

## TL;DR
${analysis.lectureSummary}. Topics covered: ${analysis.topics.join(', ') || 'General overview'}.

## Key Points
${points || '(No key concepts extracted from this lecture)'}

## Quick Self-Test
- Q: What are the main concepts from this ${analysis.subject} lecture?
- Q: Can you explain ${analysis.topics[0] ?? analysis.subject} in your own words?`;
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
