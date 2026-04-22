/**
 * catalyze — public API preserved for existing callers.
 *
 * Implementation now delegates to the `catalyze_transcript` v2 tool so there
 * is ONE path for lecture analysis. Quiz auto-save (Question Bank) remains
 * here because it's a persistence side-effect, not LLM work.
 */

import type { z } from 'zod';
import type { CatalystSchema } from './schemas';
import { saveBulkQuestions } from '../../db/queries/questionBank';
import type { SaveQuestionInput } from '../../types';
import { catalyzeTranscriptTool } from './v2/tools/lectureTools';
import { invokeTool } from './v2/toolRunner';

export async function catalyzeTranscript(
  transcript: string,
): Promise<z.infer<typeof CatalystSchema>> {
  const parsed = await invokeTool(catalyzeTranscriptTool, {
    input: { transcript },
    tag: 'catalyzeTranscript',
  });

  // Side-effect: auto-save quiz questions to Question Bank.
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
