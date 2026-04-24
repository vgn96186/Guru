import type { Message } from '../types';
import { buildMedicalSearchQuery, clipText } from '../medicalSearch';
import type { GroundingContextSection, GroundingDecision, GroundingRequest } from './types';
import { clampMessagesToCharBudget } from '../providers/utils';

function buildGuruSystemPrompt(options: { grounded: boolean }): string {
  const promptLines = [
    'You are Guru, a Socratic medical tutor for NEET-PG/INICET.',
    'Primary goal: help the student understand high-yield concepts clearly and efficiently.',
    'Rules:',
    '1) Keep the answer concise, structured, and exam-oriented.',
    '2) Use plain language first, then add precise medical terms.',
    '3) If the student is weak on basics, teach prerequisites before advanced details.',
    options.grounded
      ? '4) When uncertain or when the question is guideline-sensitive, use the available tools before answering.'
      : '4) Do not call tools or mention retrieval. Answer from the provided context only.',
    '5) Prefer forward progress over repetitive quizzing.',
    '6) If the student asks for direct teaching, explain directly instead of forcing Socratic questions.',
    '7) For NEET-PG/INICET, prefer exam framing for concepts, but use clinical-authority sources for management/guidelines/treatment.',
    '8) Do not output citations inline unless the response naturally benefits from mentioning the source family.',
    '9) Output only Guru’s next reply. Never invent the student reply.',
    '10) If you ask a question, keep it to one focused checkpoint at the end only when useful.',
  ];

  if (options.grounded) {
    promptLines.push(
      '11) Use local context such as notes/transcripts when relevant before broad web retrieval.',
      '12) Only use reference-image tools when the student explicitly wants a visual explanation.',
    );
  }

  return promptLines.join('\n');
}

function buildTopicContextLine(
  topicName?: string,
  syllabusTopicId?: number,
  subjectName?: string,
): string | null {
  const parts: string[] = [];
  if (subjectName) parts.push(`Subject: ${subjectName}`);
  if (topicName) parts.push(`Topic: ${topicName}`);
  if (syllabusTopicId != null) parts.push(`Topic ID: ${syllabusTopicId}`);

  return parts.length > 0 ? `Context | ${parts.join(' | ')}` : null;
}

function compactSection(
  kind: GroundingContextSection['kind'],
  title: string,
  content: string | undefined,
  maxChars: number,
): GroundingContextSection | null {
  const trimmed = content?.trim();
  if (!trimmed) return null;
  return {
    kind,
    title,
    content: clipText(trimmed, maxChars),
  };
}

export function buildGroundingContextSections(
  request: GroundingRequest,
  decision: GroundingDecision,
): GroundingContextSection[] {
  const maxChars = decision.mode === 'local_tutor' ? 1200 : 2200;
  const sections = [
    compactSection('profile', 'Conversation guidance', request.profileContext, maxChars),
    compactSection(
      'profile',
      'Student profile notes',
      request.memoryContext?.profileNotes,
      maxChars,
    ),
    compactSection(
      'session',
      'Earlier thread summary',
      request.memoryContext?.sessionSummary,
      maxChars,
    ),
    compactSection(
      'tutor_state',
      'Structured tutoring state',
      request.memoryContext?.stateJson,
      maxChars,
    ),
    compactSection(
      'study',
      'Study snapshot from the progress DB',
      request.studyContext ?? request.memoryContext?.studyContext,
      maxChars,
    ),
    compactSection(
      'local_notes',
      request.memoryContext?.groundingTitle
        ? `Saved notes context (${request.memoryContext.groundingTitle})`
        : 'Saved notes context',
      request.memoryContext?.groundingContext,
      3000,
    ),
  ].filter(Boolean) as GroundingContextSection[];

  return sections;
}

export function buildGroundingPromptMessages(
  request: GroundingRequest,
  decision: GroundingDecision,
  sections: GroundingContextSection[],
): {
  systemPrompt: string;
  promptMessages: Message[];
  searchQuery: string;
} {
  const trimmedQuestion = request.question.replace(/\s+/g, ' ').trim();
  const topicContextLine = buildTopicContextLine(
    request.topicName,
    request.syllabusTopicId ?? request.memoryContext?.syllabusTopicId,
    request.subjectName,
  );
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, request.topicName);

  const sectionText = sections
    .map((section) => `${section.title}:\n${section.content}`)
    .join('\n\n');

  const userPrompt = [
    topicContextLine,
    sectionText || null,
    `Grounding mode: ${decision.mode}`,
    `Intent: ${decision.intent}`,
    `Source sensitivity: ${decision.sourceSensitivity ? 'yes' : 'no'}`,
    `Visual intent: ${decision.visualIntent ? 'yes' : 'no'}`,
    `Student question: ${trimmedQuestion}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const historyLimit = decision.mode === 'local_tutor' ? 2 : 6;
  const historyMessages: Message[] = (request.history ?? []).slice(-historyLimit).map((entry) => ({
    role: entry.role === 'user' ? 'user' : 'assistant',
    content: clipText(entry.text, 280),
  }));

  const systemPrompt = buildGuruSystemPrompt({ grounded: decision.mode === 'grounded_agent' });
  const promptMessages: Message[] = clampMessagesToCharBudget(
    [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: userPrompt },
    ],
    decision.retrievalBudget.promptCharBudget,
    `grounding:${request.caller}`,
  );

  return {
    systemPrompt,
    promptMessages,
    searchQuery,
  };
}
