import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../constants/prompts';
import type { Message } from './types';
import { CatalystSchema } from './schemas';
import { generateJSONWithRouting } from './generate';

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

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const { parsed } = await generateJSONWithRouting(messages, CatalystSchema, 'high');
  return parsed;
}
