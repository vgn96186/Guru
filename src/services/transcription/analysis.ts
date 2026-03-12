import { z } from 'zod';
import { generateJSONWithRouting } from '../aiService';

export interface LectureAnalysis {
  subject: string;
  topics: string[];
  keyConcepts: string[];
  lectureSummary: string;
  estimatedConfidence: 1 | 2 | 3;
  transcript?: string;
}

const MEDICAL_EXTRACT_PROMPT = `You are a NEET-PG/INICET medical education assistant analyzing audio from a lecture recording.
Your task:
1. Transcribe relevant medical content
2. Identify the subject and specific topics covered
3. Extract key concepts as brief bullet points
4. Write a one-line summary

Return ONLY valid JSON:
{
  "subject": "Physiology",
  "topics": ["Renin-Angiotensin System", "Cardiovascular System"],
  "key_concepts": ["JGA cells release renin in response to low BP"],
  "lecture_summary": "RAAS pathway from renin release to aldosterone effect",
  "estimated_confidence": 2
}
`;

const LectureAnalysisSchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  key_concepts: z.array(z.string()),
  lecture_summary: z.string(),
  estimated_confidence: z.number().int().min(1).max(3),
});

export async function analyzeTranscript(transcript: string): Promise<LectureAnalysis> {
  const extractPrompt = `${MEDICAL_EXTRACT_PROMPT}\n\nHere is the lecture transcript:\n"""\n${transcript.slice(0, 12000)}\n"""`;

  try {
    const { parsed } = await generateJSONWithRouting(
      [{ role: 'user', content: extractPrompt }],
      LectureAnalysisSchema,
      'high',
    );
    return {
      subject: parsed.subject ?? 'Unknown',
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
      keyConcepts: Array.isArray(parsed.key_concepts) ? parsed.key_concepts.slice(0, 8) : [],
      lectureSummary: parsed.lecture_summary ?? '',
      estimatedConfidence: (parsed.estimated_confidence ?? 2) as 1 | 2 | 3,
    };
  } catch (err) {
    console.warn('[Analysis] LLM topic extraction failed, using basic fallback.');
    return {
      subject: 'Unknown',
      topics: [],
      keyConcepts: [],
      lectureSummary: 'Lecture content recorded',
      estimatedConfidence: 2,
    };
  }
}
