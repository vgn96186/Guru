import type { AIContent, ContentType, Mood, TopicWithProgress } from '../types';
import { SYSTEM_PROMPT, CONTENT_PROMPT_MAP, buildAgendaPrompt, buildAccountabilityPrompt } from '../constants/prompts';
import { getCachedContent, setCachedContent } from '../db/queries/aiCache';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PRIMARY_MODEL = 'gemini-3.0-flash-preview';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callGemini(
  messages: Message[],
  apiKey: string,
  model = PRIMARY_MODEL,
): Promise<string> {
  // Allow model override if it's stored in user profile (passed via apiKey string hack or distinct param)
  // For now, we assume the caller handles the model name selection if needed.

  // Convert OpenAI-style messages to Gemini `contents` format
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const userMsg = messages.find(m => m.role === 'user')?.content || '';
  const contents = [{ role: 'user', parts: [{ text: userMsg }] }];

  // Check if model name is embedded in API key string (Format: "KEY|MODEL")
  let activeModel = model;
  let activeKey = apiKey;

  if (apiKey.includes('|')) {
    const parts = apiKey.split('|');
    activeKey = parts[0];
    activeModel = parts[1];
  }

  const url = `${GEMINI_BASE}/${activeModel}:generateContent?key=${activeKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemMsg }] }, // Gemini 1.5+ system instruction
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json', // Force JSON mode
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

export async function fetchContent(
  topic: TopicWithProgress,
  contentType: ContentType,
  apiKey: string,
): Promise<AIContent> {
  // Cache-first
  const cached = getCachedContent(topic.id, contentType);
  if (cached) return cached;

  const promptFn = CONTENT_PROMPT_MAP[contentType];
  const userPrompt = promptFn(topic.name, topic.subjectName);

  const raw = await callGemini(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    apiKey,
  );

  let parsed: AIContent;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Sometimes Gemini wraps JSON in markdown blocks
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(clean);
  }

  const modelUsed = apiKey.includes('|') ? apiKey.split('|')[1] : PRIMARY_MODEL;
  setCachedContent(topic.id, contentType, parsed, modelUsed);
  return parsed;
}

export async function prefetchTopicContent(
  topic: TopicWithProgress,
  contentTypes: ContentType[],
  apiKey: string,
): Promise<void> {
  await Promise.allSettled(
    contentTypes.map(ct => fetchContent(topic, ct, apiKey)),
  );
}

export interface AgendaResponse {
  selectedTopicIds: number[];
  focusNote: string;
  guruMessage: string;
}

export async function planSessionWithAI(
  candidates: TopicWithProgress[],
  sessionMinutes: number,
  mood: Mood,
  recentTopics: string[],
  apiKey: string,
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

  const raw = await callGemini(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    apiKey,
  );

  return JSON.parse(raw.replace(/```json|```/g, '')) as AgendaResponse;
}

export async function generateAccountabilityMessages(
  stats: {
    streak: number;
    weakestTopics: string[];
    lastStudied: string;
    daysToInicet: number;
    coveragePercent: number;
    lastMood: Mood | null;
  },
  apiKey: string,
): Promise<Array<{ title: string; body: string; scheduledFor: string }>> {
  const userPrompt = buildAccountabilityPrompt(stats);
  const raw = await callGemini(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    apiKey,
  );
  const parsed = JSON.parse(raw.replace(/```json|```/g, '')) as { messages: Array<{ title: string; body: string; scheduledFor: string }> };
  return parsed.messages;
}

// Quick one-off question — for teach_back response evaluation
export async function askGuru(
  question: string,
  context: string,
  apiKey: string,
): Promise<string> {
  const raw = await callGemini(
    [
      { role: 'system', content: `${SYSTEM_PROMPT}\nRespond as Guru evaluating a student's answer. Output JSON: { "feedback": "...", "score": 0-5, "missed": ["key point missed"] }` },
      { role: 'user', content: `Context: ${context}\n\nStudent answer: ${question}` },
    ],
    apiKey,
  );
  return raw.replace(/```json|```/g, '');
}

export interface CatalystResponse {
  topicName: string;
  keypoints: any;
  mnemonic: any;
  quiz: any;
}

export async function catalyzeTranscript(
  transcript: string,
  apiKey: string,
): Promise<CatalystResponse> {
  // Use buildCatalystPrompt from prompts map
  const { buildCatalystPrompt } = await import('../constants/prompts');
  const userPrompt = buildCatalystPrompt(transcript);

  const raw = await callGemini(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    apiKey,
  );

  return JSON.parse(raw.replace(/```json|```/g, '')) as CatalystResponse;
}
