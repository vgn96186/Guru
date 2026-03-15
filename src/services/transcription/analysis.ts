import { generateJSONWithRouting } from '../aiService';
import { LectureAnalysisSchema, type LectureAnalysis } from './analysis';

const MEDICAL_EXTRACT_PROMPT = `You are a medical scribe. Extract key clinical facts, subject, and topics from the following transcript segment.`;
const META_SUMMARIZE_PROMPT = `Combine the following medical transcript segment analyses into a single coherent lecture analysis.`;

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

export async function analyzeTranscript(transcript: string): Promise<LectureAnalysis> {
  const segments = splitTranscript(transcript);
  const segmentAnalyses: LectureAnalysis[] = [];

  for (let i = 0; i < segments.length; i++) {
    console.log(`[Analysis] Analyzing segment ${i + 1}/${segments.length}`);
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
      lectureSummary: 'Lecture content recorded (analysis failed)',
      estimatedConfidence: 1,
    };
  }

  if (segmentAnalyses.length === 1) {
    return segmentAnalyses[0];
  }

  return metaSummarize(segmentAnalyses);
}

async function runSingleAnalysisPass(text: string): Promise<LectureAnalysis> {
  const extractPrompt = `${MEDICAL_EXTRACT_PROMPT}\n\nHere is the transcript segment:\n"""\n${text}\n"""`;
  const { parsed } = await generateJSONWithRouting(
    [{ role: 'user', content: extractPrompt }],
    LectureAnalysisSchema,
    'high',
  );
  return mapParsedAnalysis(parsed);
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

  console.log('[Analysis] Running final meta-summarization pass...');
  try {
    const { parsed } = await generateJSONWithRouting(
      [{ role: 'user', content: extractPrompt }],
      LectureAnalysisSchema,
      'high',
    );
    return mapParsedAnalysis(parsed);
  } catch (_err) {
    console.warn('[Analysis] Meta-summarization failed, using basic aggregation fallback.');
    // Fallback: Just smash everything together and take the first few
    return {
      subject: analyses[0]?.subject ?? 'Unknown',
      topics: [...new Set(analyses.flatMap((a) => a.topics))].slice(0, 5),
      keyConcepts: [...new Set(analyses.flatMap((a) => a.keyConcepts))].slice(0, 8),
      highYieldPoints: [...new Set(analyses.flatMap((a) => a.highYieldPoints))].slice(0, 5),
      lectureSummary:
        analyses
          .map((a) => a.lectureSummary)
          .join(' ')
          .slice(0, 200) + '...',
      estimatedConfidence: analyses[0]?.estimatedConfidence ?? 2,
    };
  }
}

function mapParsedAnalysis(parsed: any): LectureAnalysis {
  return {
    subject: parsed.subject ?? 'Unknown',
    topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
    keyConcepts: Array.isArray(parsed.key_concepts) ? parsed.key_concepts.slice(0, 8) : [],
    highYieldPoints: Array.isArray(parsed.high_yield_highlights)
      ? parsed.high_yield_highlights.slice(0, 5)
      : [],
    lectureSummary: parsed.lecture_summary ?? 'Lecture summary captured.',
    estimatedConfidence: parsed.estimated_confidence ?? 2,
  };
}
