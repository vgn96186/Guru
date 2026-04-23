import type { GuruTutorIntent } from '../../guruChatSessionSummary';

export function detectStudentIntent(question: string): GuruTutorIntent {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return 'clarify_doubt';
  if (/(compare|difference between|differentiate|vs\b|versus)/i.test(normalized)) return 'compare';
  if (/(quiz me|test me|ask me|mcq|question me)/i.test(normalized)) return 'quiz_me';
  if (/(wrong|why .*wrong|mistake|explanation for this answer)/i.test(normalized))
    return 'explain_wrong_answer';
  if (/(recap|summari[sz]e|short summary|revise quickly)/i.test(normalized)) return 'recap';
  if (
    /(just tell me|just explain|directly|straight answer|explain it|teach me|i don't know|dont know|do not know|no idea)/i.test(
      normalized,
    )
  )
    return 'direct_teach';
  if (/(another thing|also|side note|by the way|unrelated)/i.test(normalized)) return 'tangent';
  if (/(next|move on|continue|go ahead)/i.test(normalized)) return 'advance';
  return 'clarify_doubt';
}
