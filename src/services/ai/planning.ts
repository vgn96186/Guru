import { z } from 'zod';
import type { Mood, TopicWithProgress } from '../../types';
import { SYSTEM_PROMPT, buildAgendaPrompt, buildAccountabilityPrompt } from '../../constants/prompts';
import type { Message, GuruPresenceMessage, AgendaResponse } from './types';
import { AgendaSchema } from './schemas';
import { generateJSONWithRouting } from './generate';

const FALLBACK_MESSAGES: GuruPresenceMessage[] = [
  { text: "Still here. Working through some Pharmacology while you tackle this.", trigger: 'periodic' },
  { text: "Heads down over here. Keep your pace.", trigger: 'periodic' },
  { text: "Nice. That card is done. One step closer.", trigger: 'card_done' },
  { text: "That's it. Knew you had that one.", trigger: 'quiz_correct' },
  { text: "Tricky question. Don't overthink it — move on.", trigger: 'quiz_wrong' },
  { text: "Good call flagging that. Honest review beats false confidence.", trigger: 'again_rated' },
];

export async function planSessionWithAI(
  candidates: TopicWithProgress[],
  sessionMinutes: number,
  mood: Mood,
  recentTopics: string[],
): Promise<AgendaResponse> {
  const candidateData = candidates.map(t => ({
    id: t.id,
    name: t.name,
    subject: t.subjectName,
    priority: t.inicetPriority,
    status: t.progress.status,
    score: t.score ?? 0,
  }));

  const userPrompt = buildAgendaPrompt(candidateData, sessionMinutes, mood, recentTopics);
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  const { parsed } = await generateJSONWithRouting(messages, AgendaSchema, 'high');
  return parsed;
}

export async function generateAccountabilityMessages(
  stats: {
    displayName: string;
    streak: number;
    weakestTopics: string[];
    nemesisTopics: string[];
    dueTopics: string[];
    lastStudied: string;
    daysToInicet: number;
    daysToNeetPg: number;
    coveragePercent: number;
    masteredCount: number;
    totalTopics: number;
    lastMood: Mood | null;
    guruFrequency: 'rare' | 'normal' | 'frequent' | 'off';
  },
): Promise<Array<{ title: string; body: string; scheduledFor: string }>> {
  const userPrompt = buildAccountabilityPrompt(stats);
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const AccountMsgSchema = z.object({
    messages: z.array(z.object({ title: z.string(), body: z.string(), scheduledFor: z.string() })),
  });
  const { parsed } = await generateJSONWithRouting(messages, AccountMsgSchema, 'high');
  return parsed.messages;
}

export async function generateGuruPresenceMessages(
  topicNames: string[],
  allTopicNames: string[],
): Promise<GuruPresenceMessage[]> {
  const guruTopic = allTopicNames[Math.floor(Math.random() * allTopicNames.length)] ?? 'Biochemistry';
  const systemPrompt = `You are Guru, a study companion working alongside a medical student. You are currently studying ${guruTopic}. Be brief, warm, and grounding.`;
  const userPrompt = `The student is studying: ${topicNames.join(', ')}.
Generate exactly 6 ambient presence messages as a JSON array. Each has "text" (1-2 short sentences) and "trigger" (one of: periodic, card_done, quiz_correct, quiz_wrong, again_rated).
Include 2 "periodic" messages and 1 each of the other 4. Reference their topics or yours naturally.
Return only valid JSON: [{"text":"...","trigger":"..."},...]`;
  try {
    const messages: Message[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
    const GuruMsgSchema = z.array(z.object({ text: z.string(), trigger: z.string() }));

    const { parsed } = await generateJSONWithRouting(messages, GuruMsgSchema, 'high');
    if (parsed.length > 0) return parsed as GuruPresenceMessage[];
    return FALLBACK_MESSAGES;
  } catch {
    return FALLBACK_MESSAGES;
  }
}
