import { z } from 'zod';
import { generateJSONWithRouting } from '../aiService';

export interface LectureAnalysis {
  subject: string;
  topics: string[];
  keyConcepts: string[];
  highYieldPoints: string[];
  lectureSummary: string;
  estimatedConfidence: 1 | 2 | 3;
  transcript?: string;
}

const MEDICAL_EXTRACT_PROMPT = `You are a NEET-PG/INICET medical education assistant analyzing a segment of a lecture transcript.
Your task:
1. Identify the subject and specific topics covered
2. Extract key concepts as brief bullet points
3. Extract "High-Yield Highlights" (extremely testable facts, specific drug names, or diagnostic criteria)
4. Write a brief summary of this segment

Return ONLY valid JSON:
{
  "subject": "Physiology",
  "topics": ["Renin-Angiotensin System"],
  "key_concepts": ["JGA cells release renin in response to low BP"],
  "high_yield_highlights": ["Renin is the **rate-limiting step** of RAAS"],
  "lecture_summary": "RAAS pathway from renin release to aldosterone effect",
  "estimated_confidence": 2
}
`;

const META_SUMMARIZE_PROMPT = `You are a NEET-PG/INICET medical education assistant.
You have been provided with summaries and facts from multiple segments of a long lecture.
Your task is to combine these into a final, cohesive analysis of the entire lecture.

Combine, deduplicate, and select the most important information:
1. Identify the main subject (choose one).
2. Select the top 3-5 overall topics.
3. Select the most critical 6-8 key concepts across all segments.
4. Select the most critical 3-5 high-yield highlights.
5. Write a single, comprehensive one-line summary of the entire lecture.
6. Estimate an overall confidence level (1-3) based on the input.

Return ONLY valid JSON in the exact same format:
{
  "subject": "Main Subject",
  "topics": ["Topic 1", "Topic 2"],
  "key_concepts": ["Key Concept 1"],
  "high_yield_highlights": ["Highlight 1"],
  "lecture_summary": "Overall summary",
  "estimated_confidence": 2
}
`;

const LectureAnalysisSchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  key_concepts: z.array(z.string()),
  high_yield_highlights: z.array(z.string()).optional(),
  lecture_summary: z.string(),
  estimated_confidence: z.number().int().min(1).max(3),
});

export async function analyzeTranscript(transcript: string): Promise<LectureAnalysis> {
  // Use hierarchical summarization for long transcripts
  return analyzeTranscriptHierarchically(transcript);
}

const SEGMENT_SIZE = 12000;

export async function analyzeTranscriptHierarchically(transcript: string): Promise<LectureAnalysis> {
  const normalized = transcript.trim();

  // If the transcript is small enough, do a single pass to save tokens and time
  if (normalized.length <= SEGMENT_SIZE * 1.5) {
      return runSingleAnalysisPass(normalized);
  }

  // Split into manageable segments
  const segments: string[] = [];
  let currentPos = 0;
  while (currentPos < normalized.length) {
    let endPos = currentPos + SEGMENT_SIZE;
    if (endPos < normalized.length) {
      // Try to break at a newline to avoid splitting words
      const lastNewline = normalized.lastIndexOf('\n', endPos);
      if (lastNewline > currentPos) {
        endPos = lastNewline;
      }
    }
    segments.push(normalized.substring(currentPos, endPos).trim());
    currentPos = endPos;
  }

  const segmentAnalyses: LectureAnalysis[] = [];

  for (let i = 0; i < segments.length; i++) {
    console.log(`[Analysis] Analyzing segment ${i + 1}/${segments.length}`);
    try {
      const analysis = await runSingleAnalysisPass(segments[i]);
      segmentAnalyses.push(analysis);
    } catch (e) {
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
  try {
    const { parsed } = await generateJSONWithRouting(
      [{ role: 'user', content: extractPrompt }],
      LectureAnalysisSchema,
      'high',
    );
    return mapParsedAnalysis(parsed);
  } catch (err) {
    throw err;
  }
}

async function metaSummarize(analyses: LectureAnalysis[]): Promise<LectureAnalysis> {
  const aggregatedInput = analyses.map((a, i) => `
Segment ${i + 1}:
- Subject: ${a.subject}
- Topics: ${a.topics.join(', ')}
- Key Concepts: ${a.keyConcepts.join('; ')}
- High Yield: ${a.highYieldPoints.join('; ')}
- Summary: ${a.lectureSummary}
`).join('\n');

  const extractPrompt = `${META_SUMMARIZE_PROMPT}\n\nHere are the segment summaries:\n"""\n${aggregatedInput}\n"""`;

  console.log('[Analysis] Running final meta-summarization pass...');
  try {
    const { parsed } = await generateJSONWithRouting(
      [{ role: 'user', content: extractPrompt }],
      LectureAnalysisSchema,
      'high',
    );
    return mapParsedAnalysis(parsed);
  } catch (err) {
    console.warn('[Analysis] Meta-summarization failed, using basic aggregation fallback.');
    // Fallback: Just smash everything together and take the first few
    return {
      subject: analyses[0]?.subject ?? 'Unknown',
      topics: [...new Set(analyses.flatMap(a => a.topics))].slice(0, 5),
      keyConcepts: [...new Set(analyses.flatMap(a => a.keyConcepts))].slice(0, 8),
      highYieldPoints: [...new Set(analyses.flatMap(a => a.highYieldPoints))].slice(0, 5),
      lectureSummary: analyses.map(a => a.lectureSummary).join(' ').slice(0, 200) + '...',
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
    lectureSummary: parsed.lecture_summary ?? '',
    estimatedConfidence: (parsed.estimated_confidence ?? 2) as 1 | 2 | 3,
  };
}
