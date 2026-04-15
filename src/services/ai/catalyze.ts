import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../constants/prompts';
import { CatalystSchema } from './schemas';
import { profileRepository } from '../../db/repositories/profileRepository';
import { createGuruFallbackModel } from './v2/providers/guruFallback';
import { generateObject } from './v2/generateObject';
import { saveBulkQuestions } from '../../db/queries/questionBank';
import { DEFAULT_PROVIDER_ORDER } from '../../types';
import type { SaveQuestionInput } from '../../types';

export async function catalyzeTranscript(
  transcript: string,
): Promise<z.infer<typeof CatalystSchema>> {
  const userPrompt = `
You are a medical lecture analyst. Below is a raw transcript or summary of a lecture.
Your task is to:
1. Identify the primary medical subject.
2. Extract specific topic names mentioned.
3. Provide a 2-line high-level summary.
4. Extract 5 high-yield key concepts.
5. Generate a 3-question MCQ quiz based on the content.

TRANSCRIPT:
${transcript}

Return ONLY a JSON object matching this structure:
{
  "subject": "string",
  "topics": ["string", "string"],
  "summary": "string",
  "keyConcepts": ["string", "string"],
  "quiz": {
    "questions": [
      { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..." }
    ]
  }
}
`;

  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({
    profile,
    forceOrder: DEFAULT_PROVIDER_ORDER,
  });

  const { object: parsed } = await generateObject({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    schema: CatalystSchema,
  });

  // Auto-save quiz questions to Question Bank
  if (parsed.quiz?.questions?.length) {
    const inputs: SaveQuestionInput[] = parsed.quiz.questions.map((q) => ({
      question: q.question,
      options: q.options as [string, string, string, string],
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      subjectName: parsed.subject ?? '',
      topicName: parsed.topics?.[0] ?? '',
      source: 'lecture_quiz' as const,
    }));
    saveBulkQuestions(inputs).catch((err) => {
      if (__DEV__) console.warn('[QuestionBank] Auto-save from catalyze failed:', err);
    });
  }

  return parsed;
}
