import { generateJSONWithRouting } from '../aiService';
import { z } from 'zod';

export const LectureAnalysisSchema = z.object({
  subject: z.string().nullable().catch('Unknown'),
  topics: z.array(z.string()).catch([]),
  key_concepts: z.array(z.string()).catch([]),
  high_yield_highlights: z.array(z.string()).catch([]),
  lecture_summary: z.string().nullable().catch('Lecture content recorded.'),
  estimated_confidence: z.number().min(1).max(3).catch(1),
});

export type LectureAnalysis = {
  subject: string;
  topics: string[];
  keyConcepts: string[];
  highYieldPoints: string[];
  lectureSummary: string;
  estimatedConfidence: 1 | 2 | 3;
  transcript?: string;
  modelUsed?: string;
  embedding?: number[] | null;
};

export interface TranscriptAnalysisProgress {
  message: string;
  detail?: string;
  currentStep: number;
  totalSteps: number;
  percent: number;
}

const NON_MEANINGFUL_SUMMARIES = new Set([
  'No audio recorded (empty file)',
  'No speech detected (silent audio)',
  'No speech detected',
  'Lecture content recorded',
  'No medical content detected',
  'Lecture content recorded. Review transcript for details.',
  'Lecture summary captured.',
]);
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

const MEDICAL_EXTRACT_PROMPT = `You are a medical scribe. Extract key clinical facts, subject, and topics from the following transcript segment.`;
const META_SUMMARIZE_PROMPT = `Combine the following medical transcript segment analyses into a single coherent lecture analysis.`;
const ANALYSIS_COMPLEXITY = 'low' as const;

function normalizeSummary(summary: string | null | undefined): string {
  return summary?.trim().replace(/[.]+$/, '') ?? '';
}

function hasMeaningfulSummary(summary: string | null | undefined): boolean {
  const normalized = normalizeSummary(summary);
  return (
    !!normalized &&
    !NON_MEANINGFUL_SUMMARIES.has(normalized) &&
    !NON_MEANINGFUL_SUMMARIES.has(`${normalized}.`)
  );
}

function cleanTopicLabel(topic: string): string {
  return topic.replace(/\s+/g, ' ').trim();
}

function buildLectureFallbackTitle(parsed: ParsedAnalysis): string {
  const subject = parsed.subject?.trim();
  const topics = (Array.isArray(parsed.topics) ? parsed.topics : [])
    .map(cleanTopicLabel)
    .filter(Boolean)
    .slice(0, 2);
  const keyConcepts = (Array.isArray(parsed.key_concepts) ? parsed.key_concepts : [])
    .map(cleanTopicLabel)
    .filter(Boolean)
    .slice(0, 2);

  if (topics.length >= 2) {
    return `${topics[0]} & ${topics[1]}`;
  }
  if (topics.length === 1) {
    return topics[0];
  }
  if (subject && subject !== 'Unknown' && keyConcepts.length >= 2) {
    return `${subject}: ${keyConcepts[0]} & ${keyConcepts[1]}`;
  }
  if (subject && subject !== 'Unknown' && keyConcepts.length === 1) {
    return `${subject}: ${keyConcepts[0]}`;
  }
  if (subject && subject !== 'Unknown') {
    return `${subject} Lecture Highlights`;
  }
  if (keyConcepts.length >= 2) {
    return `${keyConcepts[0]} & ${keyConcepts[1]}`;
  }
  if (keyConcepts.length === 1) {
    return keyConcepts[0];
  }
  return 'Lecture Review Notes';
}

/**
 * Split transcript into manageable segments for hierarchical analysis.
 */
function splitTranscript(transcript: string, maxChars = 12000): string[] {
  const segments: string[] = [];
  let currentPos = 0;
  while (currentPos < transcript.length) {
    segments.push(transcript.slice(currentPos, currentPos + maxChars));
    currentPos += maxChars;
  }
  return segments;
}

export async function analyzeTranscript(
  transcript: string,
  onProgress?: (progress: TranscriptAnalysisProgress) => void,
): Promise<LectureAnalysis> {
  const segments = splitTranscript(transcript);
  const segmentAnalyses: LectureAnalysis[] = [];
  const totalSteps = segments.length + (segments.length > 1 ? 1 : 0);

  for (let i = 0; i < segments.length; i++) {
    onProgress?.({
      message:
        segments.length === 1
          ? 'Extracting subject, topics, and key concepts'
          : `Analyzing transcript segment ${i + 1} of ${segments.length}`,
      detail:
        segments.length === 1
          ? 'Identifying the lecture subject and high-yield points'
          : 'Summarizing this transcript slice before combining the full lecture',
      currentStep: i + 1,
      totalSteps,
      percent: Math.round(((i + 1) / totalSteps) * 100),
    });
    if (isDev) console.log(`[Analysis] Analyzing segment ${i + 1}/${segments.length}`);
    try {
      const analysis = await runSingleAnalysisPass(segments[i]);
      segmentAnalyses.push(analysis);
    } catch (_e) {
      console.warn(`[Analysis] Failed to analyze segment ${i}, skipping.`);
    }
  }

  if (segmentAnalyses.length === 0) {
    console.warn('[Analysis] All segment analyses failed, returning fallback.');
    return {
      subject: 'Unknown',
      topics: [],
      keyConcepts: [],
      highYieldPoints: [],
      lectureSummary: 'Lecture Review Notes',
      estimatedConfidence: 1,
    };
  }

  if (segmentAnalyses.length === 1) {
    return segmentAnalyses[0];
  }

  onProgress?.({
    message: 'Combining segment analyses into one lecture summary',
    detail: 'Merging subject guesses, topics, and high-yield takeaways',
    currentStep: totalSteps,
    totalSteps,
    percent: 100,
  });

  return metaSummarize(segmentAnalyses);
}

export function isMeaningfulLectureAnalysis(analysis: Partial<LectureAnalysis> | null | undefined) {
  if (!analysis?.transcript?.trim()) {
    return false;
  }

  if ((analysis.topics?.length ?? 0) > 0) return true;
  if ((analysis.keyConcepts?.length ?? 0) > 0) return true;
  if ((analysis.highYieldPoints?.length ?? 0) > 0) return true;

  const summary = analysis.lectureSummary?.trim();
  return !!summary && !NON_MEANINGFUL_SUMMARIES.has(summary);
}

async function runSingleAnalysisPass(text: string): Promise<LectureAnalysis> {
  const extractPrompt = `${MEDICAL_EXTRACT_PROMPT}\n\nHere is the transcript segment:\n"""\n${text}\n"""`;
  const { parsed, modelUsed } = await generateJSONWithRouting(
    [{ role: 'user', content: extractPrompt }],
    LectureAnalysisSchema,
    ANALYSIS_COMPLEXITY,
    true,
    'groq',
  );
  return { ...mapParsedAnalysis(parsed), modelUsed };
}

async function metaSummarize(analyses: LectureAnalysis[]): Promise<LectureAnalysis> {
  const aggregatedInput = analyses
    .map(
      (a, i) => `
Segment ${i + 1}:
- Subject: ${a.subject}
- Topics: ${a.topics.join(', ')}
- Key Concepts: ${a.keyConcepts.join('; ')}
- High Yield: ${a.highYieldPoints.join('; ')}
- Summary: ${a.lectureSummary}
`,
    )
    .join('\n');

  const extractPrompt = `${META_SUMMARIZE_PROMPT}\n\nHere are the segment summaries:\n"""\n${aggregatedInput}\n"""`;

  if (isDev) console.log('[Analysis] Running final meta-summarization pass...');
  try {
    const { parsed, modelUsed } = await generateJSONWithRouting(
      [{ role: 'user', content: extractPrompt }],
      LectureAnalysisSchema,
      ANALYSIS_COMPLEXITY,
      true,
      'groq',
    );
    return { ...mapParsedAnalysis(parsed), modelUsed };
  } catch (_err) {
    console.warn('[Analysis] Meta-summarization failed, using basic aggregation fallback.');
    // Fallback: Just smash everything together and take the first few
    return {
      subject: analyses[0]?.subject ?? 'Unknown',
      topics: [...new Set(analyses.flatMap((a: LectureAnalysis) => a.topics))].slice(0, 5),
      keyConcepts: [...new Set(analyses.flatMap((a: LectureAnalysis) => a.keyConcepts))].slice(
        0,
        8,
      ),
      highYieldPoints: [
        ...new Set(analyses.flatMap((a: LectureAnalysis) => a.highYieldPoints)),
      ].slice(0, 5),
      lectureSummary:
        analyses
          .map((a: LectureAnalysis) => a.lectureSummary)
          .join(' ')
          .slice(0, 200) + '...',
      estimatedConfidence: (analyses[0]?.estimatedConfidence ?? 2) as 1 | 2 | 3,
    };
  }
}

interface ParsedAnalysis {
  subject?: string | null;
  topics?: string[];
  key_concepts?: string[];
  high_yield_highlights?: string[];
  lecture_summary?: string | null;
  estimated_confidence?: number;
}

function mapParsedAnalysis(parsed: ParsedAnalysis): LectureAnalysis {
  const lectureSummary = hasMeaningfulSummary(parsed.lecture_summary)
    ? parsed.lecture_summary!.trim()
    : buildLectureFallbackTitle(parsed);
  return {
    subject: parsed.subject ?? 'Unknown',
    topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
    keyConcepts: Array.isArray(parsed.key_concepts) ? parsed.key_concepts.slice(0, 8) : [],
    highYieldPoints: Array.isArray(parsed.high_yield_highlights)
      ? parsed.high_yield_highlights.slice(0, 5)
      : [],
    lectureSummary,
    estimatedConfidence: (parsed.estimated_confidence ?? 2) as 1 | 2 | 3,
  };
}
