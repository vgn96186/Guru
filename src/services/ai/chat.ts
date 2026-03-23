import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../constants/prompts';
import type { Message } from './types';
import {
  generateJSONWithRouting,
  generateTextWithRouting,
  generateTextWithRoutingStream,
} from './generate';
import {
  searchLatestMedicalSources,
  renderSourcesForPrompt,
  clipText,
  buildMedicalSearchQuery,
} from './medicalSearch';

function mapGroundedChatError(error: unknown): Error {
  const msg = error instanceof Error ? error.message : String(error);
  if (__DEV__) console.warn('[GuruGrounded] Generation failed:', msg);
  if (
    typeof msg === 'string' &&
    msg.toLowerCase().includes('invalid') &&
    msg.toLowerCase().includes('key')
  ) {
    return new Error(
      'Invalid API key. Check Settings or .env (EXPO_PUBLIC_BUNDLED_GROQ_KEY). Restart with: npx expo start --clear',
    );
  }
  if (
    typeof msg === 'string' &&
    (msg.includes('429') || msg.toLowerCase().includes('rate limit'))
  ) {
    return new Error('Rate limit hit. Wait a minute or try again.');
  }
  return new Error(`Guru couldn't respond: ${String(msg).slice(0, 120)}`);
}

export async function chatWithGuru(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
  studyContext?: string,
): Promise<{ reply: string }> {
  const historyStr = history
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.text}`)
    .join('\n');
  const systemPrompt = `You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers — never lecture.
Rules:
1. Ask ONE focused clinical question per response. No information dumps.
2. If the student answers, react in one sentence (affirm or gently correct), then ask the next logical question.
3. Focus only on high-yield exam facts — ignore rare minutiae.
4. Max 3 sentences per response. Be warm and conversational.
5. Wrap key clinical terms in **bold**.
6. If the student says "just tell me" or "explain it", give a brief 2-sentence summary then ask a follow-up.
7. Use the STUDY CONTEXT when it is provided so your answer matches the exact card, question, or explanation the student is viewing.
8. Never output JSON.`;
  const userPrompt = `Topic: ${topicName}${
    studyContext ? `\n\nStudy context:\n${studyContext}` : ''
  }${historyStr ? `\n\nConversation so far:\n${historyStr}` : ''}\n\nStudent: ${question}`;
  const { text } = await generateTextWithRouting(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { chosenModel },
  );
  return { reply: text.trim() };
}

export async function chatWithGuruGrounded(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
): Promise<import('./types').GroundedGuruResponse> {
  const trimmedQuestion = question.replace(/\s+/g, ' ').trim();
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, topicName);
  const sources = await searchLatestMedicalSources(searchQuery, 6);

  const historyStr = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Guru'}: ${clipText(m.text, 280)}`)
    .join('\n');

  const sourcesBlock =
    sources.length > 0
      ? renderSourcesForPrompt(sources)
      : 'No live web sources were retrieved for this query.';

  const systemPrompt = `You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers — never lecture.
Rules:
1) Ask ONE focused clinical question per response. No information dumps.
2) If the student answers, react in one sentence (affirm or correct briefly), then ask the next logical question.
3) Use your medical knowledge as the PRIMARY basis for answers. Sources below are supplementary references only — ignore irrelevant ones.
4) Max 3 sentences per response. Be warm and conversational.
5) Wrap key clinical terms in **bold**.
6) If the student says "just tell me" or "explain it", give a 2-sentence summary then follow up with a question.
7) Do not use citations inline — keep it natural, not academic.
8) NEVER refuse to answer a medical question. Always provide your best knowledge even if sources are unavailable or irrelevant.`;

  const userPrompt = `Topic context: ${topicName || 'General Medicine'}
${historyStr ? `Recent conversation:\n${historyStr}\n` : ''}
Student question: ${trimmedQuestion}
${sources.length > 0 ? `\nSUPPLEMENTARY REFERENCES (use only if relevant):\n${sourcesBlock}` : ''}
Respond using your medical knowledge. Reference the sources only if they are directly relevant.`;

  const msgs: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await generateTextWithRouting(msgs, { chosenModel });
    return {
      reply: response.text.trim(),
      sources,
      modelUsed: response.modelUsed,
      searchQuery,
    };
  } catch (error: unknown) {
    throw mapGroundedChatError(error);
  }
}

export type GuruChatMemoryContext = {
  /** Rolling summary of earlier turns in this thread (SQLite). */
  sessionSummary?: string;
  /** Optional facts the student saved in Settings (exam goals, weak subjects, etc.). */
  profileNotes?: string;
  /** Bounded FSRS/review + exam countdown line from DB (see `buildBoundedGuruChatStudyContext`). */
  studyContext?: string;
  /** Syllabus `topics.id` when navigation provided it (disambiguation / grounding). */
  syllabusTopicId?: number;
};

/** Grounded Guru chat with SSE-style token deltas for cloud routes (local emits once at end). */
export async function chatWithGuruGroundedStreaming(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel: string | undefined,
  onReplyDelta: (delta: string) => void,
  memoryContext?: GuruChatMemoryContext,
): Promise<import('./types').GroundedGuruResponse> {
  const trimmedQuestion = question.replace(/\s+/g, ' ').trim();
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, topicName);
  const sources = await searchLatestMedicalSources(searchQuery, 6);

  const historyStr = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Guru'}: ${clipText(m.text, 280)}`)
    .join('\n');

  const sourcesBlock =
    sources.length > 0
      ? renderSourcesForPrompt(sources)
      : 'No live web sources were retrieved for this query.';

  const profileBlock =
    memoryContext?.profileNotes?.trim() &&
    `What you already know about this student (they saved this in Settings):\n${memoryContext.profileNotes.trim()}\n`;

  const sessionBlock =
    memoryContext?.sessionSummary?.trim() &&
    `Earlier thread summary (compressed — may omit details):\n${memoryContext.sessionSummary.trim()}\n`;

  const studyBlock =
    memoryContext?.studyContext?.trim() &&
    `Study snapshot from their progress DB (samples only):\n${memoryContext.studyContext.trim()}\n`;

  const systemPrompt = `You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers — never lecture.
Rules:
1) Ask ONE focused clinical question per response. No information dumps.
2) If the student answers, react in one sentence (affirm or correct briefly), then ask the next logical question.
3) Use your medical knowledge as the PRIMARY basis for answers. Sources below are supplementary references only — ignore irrelevant ones.
4) Max 3 sentences per response. Be warm and conversational.
5) Wrap key clinical terms in **bold**.
6) If the student says "just tell me" or "explain it", give a 2-sentence summary then follow up with a question.
7) Do not use citations inline — keep it natural, not academic.
8) NEVER refuse to answer a medical question. Always provide your best knowledge even if sources are unavailable or irrelevant.`;

  const topicLabel =
    (topicName || 'General Medicine') +
    (memoryContext?.syllabusTopicId != null
      ? ` (syllabus topic id ${memoryContext.syllabusTopicId})`
      : '');
  const userPrompt = `Topic context: ${topicLabel}
${profileBlock ?? ''}${sessionBlock ?? ''}${studyBlock ?? ''}${historyStr ? `Recent conversation:\n${historyStr}\n` : ''}
Student question: ${trimmedQuestion}
${sources.length > 0 ? `\nSUPPLEMENTARY REFERENCES (use only if relevant):\n${sourcesBlock}` : ''}
Respond using your medical knowledge. Reference the sources only if they are directly relevant.`;

  const msgs: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await generateTextWithRoutingStream(msgs, { chosenModel }, onReplyDelta);
    return {
      reply: response.text.trim(),
      sources,
      modelUsed: response.modelUsed,
      searchQuery,
    };
  } catch (error: unknown) {
    throw mapGroundedChatError(error);
  }
}

export async function askGuru(question: string, context: string): Promise<string> {
  const schema = z.object({ feedback: z.string(), score: z.number(), missed: z.array(z.string()) });
  const messages: Message[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\nRespond as Guru evaluating a student's answer. Output JSON: { "feedback": "...", "score": 0-5, "missed": ["key point missed"] }`,
    },
    { role: 'user', content: `Context: ${context}\n\nStudent answer: ${question}` },
  ];
  const { parsed } = await generateJSONWithRouting(messages, schema, 'low');
  return JSON.stringify(parsed);
}
