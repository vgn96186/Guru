import {
  QUESTION_PREFIX_RE,
  normalizeQuestionText,
  extractKeyTerms,
  buildConceptKey,
  conceptOverlap,
} from './concepts';
import type { GuruTutorIntent } from '../../guruChatSessionSummary';

export function splitReplyAndFinalQuestion(text: string): {
  body: string;
  question: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { body: '', question: null };

  const explicitQuestionMatch = trimmed.match(/(?:^|[\n\r])\s*question:\s*([\s\S]+?)\s*$/i);
  if (explicitQuestionMatch) {
    const fullMatch = explicitQuestionMatch[0] ?? '';
    return {
      body: trimmed.slice(0, trimmed.length - fullMatch.length).trim(),
      question: explicitQuestionMatch[1]?.trim() || null,
    };
  }

  const finalQuestionIndex = trimmed.lastIndexOf('?');
  if (finalQuestionIndex === -1) {
    return { body: trimmed, question: null };
  }

  const questionPrefixIndex = trimmed.toLowerCase().lastIndexOf('question:', finalQuestionIndex);
  if (questionPrefixIndex >= 0) {
    return {
      body: trimmed.slice(0, questionPrefixIndex).trim(),
      question: trimmed.slice(questionPrefixIndex).replace(QUESTION_PREFIX_RE, '').trim(),
    };
  }

  const boundaryIndex = Math.max(
    trimmed.lastIndexOf('\n', finalQuestionIndex),
    trimmed.lastIndexOf('. ', finalQuestionIndex),
    trimmed.lastIndexOf('! ', finalQuestionIndex),
  );

  if (boundaryIndex === -1) {
    return { body: '', question: trimmed };
  }

  const question = trimmed.slice(boundaryIndex + 1).trim();
  if (!question.endsWith('?')) {
    return { body: trimmed, question: null };
  }

  return {
    body: trimmed.slice(0, boundaryIndex + 1).trim(),
    question,
  };
}

export function truncateAfterAskedQuestion(text: string): string {
  const firstQuestionIndex = text.indexOf('?');
  if (firstQuestionIndex === -1) return text;
  const trailing = text.slice(firstQuestionIndex + 1).trim();
  if (!trailing) return text;

  const hasAnotherQuestion = trailing.includes('?');
  const startsLikeContinuationAnswer =
    /^[A-Z0-9*_(["']/.test(trailing) ||
    /^(the|it|they|this|that|these|those|because|so|therefore|plasma|interstitial|answer)\b/i.test(
      trailing,
    );

  if (hasAnotherQuestion || startsLikeContinuationAnswer) {
    return text.slice(0, firstQuestionIndex + 1).trim();
  }

  return text;
}

export function sanitizeSingleGuruTurn(raw: string): string {
  let text = (raw ?? '').replace(/\r/g, '').trim();
  if (!text) return '';

  text = text.replace(/^(?:guru|assistant)\s*:\s*/i, '').trim();

  const firstStudentTurn = text.search(/(?:^|\n|\s)(?:student|user|learner)\s*:/i);
  if (firstStudentTurn >= 0) {
    text = text.slice(0, firstStudentTurn).trim();
  }

  const secondGuruTurn = text.search(/(?:^|\n|\s)(?:guru|assistant)\s*:/i);
  if (secondGuruTurn >= 0) {
    text = text.slice(0, secondGuruTurn).trim();
  }

  text = truncateAfterAskedQuestion(text);

  return text;
}

export function shouldDropFinalQuestion(reply: string, recentQuestions: string[] = []): boolean {
  const { body, question } = splitReplyAndFinalQuestion(reply);
  if (!question || !body) return false;

  const normalizedQuestion = normalizeQuestionText(question);
  if (!normalizedQuestion) return false;

  if (recentQuestions.some((asked) => normalizeQuestionText(asked) === normalizedQuestion)) {
    return true;
  }

  const bodyTerms = new Set(extractKeyTerms(body));
  const questionTerms = extractKeyTerms(question);
  if (questionTerms.length === 0) return false;

  const overlapCount = questionTerms.filter((term) => bodyTerms.has(term)).length;
  const overlapRatio = overlapCount / questionTerms.length;

  const directAnswerCue =
    /\b(is|are|means|refers to|called|supplied by|innervated by|causes|because|therefore|so)\b/i.test(
      body,
    ) || /[.!]\s*$/.test(body);

  return overlapRatio >= 0.6 && directAnswerCue;
}

export type FinalizeGuruOptions = {
  recentQuestions?: string[];
  studentIntent?: GuruTutorIntent;
  blockedConcepts?: string[];
  studentQuestion?: string;
};

export function normalizeFinalizeGuruOptions(
  options: string[] | FinalizeGuruOptions | undefined,
): FinalizeGuruOptions {
  if (Array.isArray(options)) {
    return { recentQuestions: options };
  }
  return options ?? {};
}

export function shouldDropIntentQuestion(
  body: string,
  finalQuestion: string,
  options: FinalizeGuruOptions,
): boolean {
  const { studentIntent, blockedConcepts = [], studentQuestion } = options;
  if (!studentIntent) return false;

  const isDirectHelpIntent = [
    'clarify_doubt',
    'direct_teach',
    'compare',
    'explain_wrong_answer',
    'recap',
  ].includes(studentIntent);
  if (!isDirectHelpIntent) return false;

  const finalConcept = buildConceptKey(finalQuestion);
  const studentConcept = buildConceptKey(studentQuestion ?? '');
  if (!finalConcept) return false;

  if (studentConcept && conceptOverlap(finalConcept, studentConcept)) {
    return true;
  }

  if (conceptOverlap(finalQuestion, body)) {
    return true;
  }

  const bodyTerms = extractKeyTerms(body);
  const finalQuestionTerms = extractKeyTerms(finalQuestion);
  const sharedBodyTerms = finalQuestionTerms.filter((term) => bodyTerms.includes(term)).length;
  const bodyLooksExplanatory =
    /\b(because|due to|means|refers to|causes|happens when|so that)\b/i.test(body);
  if (sharedBodyTerms >= 1 && bodyLooksExplanatory) {
    return true;
  }

  return blockedConcepts.some((concept) => conceptOverlap(concept, finalQuestion));
}

export function finalizeGuruReply(
  reply: string,
  options: string[] | FinalizeGuruOptions = [],
): string {
  const normalizedOptions = normalizeFinalizeGuruOptions(options);
  const recentQuestions = normalizedOptions.recentQuestions ?? [];
  const sanitized = sanitizeSingleGuruTurn(reply);
  if (!sanitized) return sanitized;
  const { body, question } = splitReplyAndFinalQuestion(sanitized);
  if (!question) return sanitized;
  if (shouldDropIntentQuestion(body, question, normalizedOptions)) {
    return body.trim();
  }
  if (!shouldDropFinalQuestion(sanitized, recentQuestions)) return sanitized;
  return body.trim();
}

export function hasUnclosedMarkdownBoldMarkers(text: string): boolean {
  return (text.match(/\*\*/g) ?? []).length % 2 === 1;
}

export function looksTruncatedReply(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.includes('?')) return false;
  if (hasUnclosedMarkdownBoldMarkers(t)) return true;
  if (/[A-Za-z0-9]+-$/.test(t)) return true;
  if (/[([{"'`]$/.test(t)) return true;
  const openParens = (t.match(/\(/g) ?? []).length;
  const closeParens = (t.match(/\)/g) ?? []).length;
  if (openParens > closeParens) return true;
  if (t.length >= 320 && !/[.!?]["')\]]?$/.test(t)) return true;
  return false;
}
