import type { AIContent, AgendaItem, QuestionBankItem } from '../../types';

export function formatSessionModelLabel(modelUsed?: string | null): string {
  if (!modelUsed?.trim()) return 'AI · model not recorded';
  if (modelUsed.startsWith('fallback/')) return 'AI · Auto (fallback)';
  const m = modelUsed.replace(/^local-/, '');
  if (m.startsWith('groq/')) return `AI · Groq / ${m.slice(5)}`;
  if (m.startsWith('gemini/')) return `AI · Gemini / ${m.slice(7)}`;
  if (m.startsWith('github/')) return `AI · GitHub Models / ${m.slice(7)}`;
  if (m.startsWith('github_copilot/'))
    return `AI · GitHub Copilot / ${m.slice('github_copilot/'.length)}`;
  if (m.startsWith('gitlab_duo/')) return `AI · GitLab Duo / ${m.slice('gitlab_duo/'.length)}`;
  if (m.startsWith('poe/')) return `AI · Poe / ${m.slice(4)}`;
  if (m.startsWith('deepseek/')) return `AI · DeepSeek / ${m.slice(9)}`;
  if (m.startsWith('cf/')) return `AI · Cloudflare / ${m.slice(3)}`;
  if (modelUsed.startsWith('local-')) return `AI · On-device / ${m}`;
  if (m.includes('/')) return `AI · ${m.replace('/', ' / ')}`;
  return `AI · ${m}`;
}

export function buildCachedQuestionFallbackContent(
  topicName: string,
  questions: QuestionBankItem[],
): AIContent {
  return {
    type: 'quiz',
    topicName,
    questions: questions.map((question) => ({
      question: question.question,
      options: question.options,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      imageUrl: question.imageUrl ?? undefined,
    })),
    modelUsed: 'cache/question_bank',
  };
}

export function deriveSessionProgressStatus(
  previousStatus: AgendaItem['topic']['progress']['status'],
  confidence: number,
): 'seen' | 'reviewed' {
  if (confidence <= 1) return 'seen';
  if (previousStatus === 'unseen') return 'seen';
  return 'reviewed';
}
