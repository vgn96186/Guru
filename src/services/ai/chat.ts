import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../constants/prompts';
import type { Message } from './types';
import { generateJSONWithRouting, generateTextWithRouting } from './generate';
import { searchLatestMedicalSources, renderSourcesForPrompt, clipText, buildMedicalSearchQuery } from './medicalSearch';

export async function chatWithGuru(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
): Promise<{ reply: string }> {
  const historyStr = history.slice(-4).map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.text}`).join('\n');
  const systemPrompt = `You are Guru, a conversational medical tutor. Respond in 2-4 sentences. Use clinical anchors and mnemonics where helpful. Wrap key clinical terms in **bold** to trigger UI highlights. Be direct and warm. Never output JSON.`;
  const userPrompt = `Topic: ${topicName}${historyStr ? `\n\nConversation so far:\n${historyStr}` : ''}\n\nStudent asks: ${question}`;
  const { text } = await generateTextWithRouting(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    { chosenModel }
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
    .map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${clipText(m.text, 280)}`)
    .join('\n');

  const sourcesBlock = sources.length > 0
    ? renderSourcesForPrompt(sources)
    : 'No live web sources were retrieved for this query.';

  const systemPrompt = `You are Guru, an evidence-grounded medical tutor for NEET-PG and INI-CET students.
Rules:
1) Base claims only on provided SOURCES, strongly prioritizing Indian guidelines (ICMR, MoHFW, NMC) or WHO standards when applicable.
2) Add citations as [S1], [S2] inline where relevant.
3) If evidence is limited, explicitly say so.
4) Do not fabricate citations or studies.
5) Do not provide personal diagnosis. Keep it educational and safety-aware.
6) Keep answer concise (about 120-220 words), structured, and practical.
7) Wrap strictly the most critical clinical keywords in **bold** to automatically trigger UI highlights.`;

  const userPrompt = `Topic context: ${topicName || 'General Medicine'}
${historyStr ? `Recent conversation:\n${historyStr}\n` : ''}
Student question: ${trimmedQuestion}

SOURCES:
${sourcesBlock}

Respond with medical teaching guidance grounded in the sources above.`;

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
    const msg = error instanceof Error ? error.message : String(error);
    if (__DEV__) console.warn('[GuruGrounded] Generation failed:', msg);
    if (typeof msg === 'string' && msg.toLowerCase().includes('invalid') && msg.toLowerCase().includes('key')) {
      throw new Error('Invalid API key. Check Settings or .env (EXPO_PUBLIC_BUNDLED_GROQ_KEY). Restart with: npx expo start --clear');
    }
    if (typeof msg === 'string' && (msg.includes('429') || msg.toLowerCase().includes('rate limit'))) {
      throw new Error('Rate limit hit. Wait a minute or try again.');
    }
    throw new Error(`Guru couldn't respond: ${String(msg).slice(0, 120)}`);
  }
}

export async function askGuru(
  question: string,
  context: string,
): Promise<string> {
  const schema = z.object({ feedback: z.string(), score: z.number(), missed: z.array(z.string()) });
  const messages: Message[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\nRespond as Guru evaluating a student's answer. Output JSON: { "feedback": "...", "score": 0-5, "missed": ["key point missed"] }` },
    { role: 'user', content: `Context: ${context}\n\nStudent answer: ${question}` },
  ];
  const { parsed } = await generateJSONWithRouting(messages, schema, 'low');
  return JSON.stringify(parsed);
}
