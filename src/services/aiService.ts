import type { AIContent, ContentType, Mood, TopicWithProgress } from '../types';
import { z } from 'zod';
import { SYSTEM_PROMPT, CONTENT_PROMPT_MAP, buildAgendaPrompt, buildAccountabilityPrompt } from '../constants/prompts';
import { getCachedContent, setCachedContent } from '../db/queries/aiCache';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PRIMARY_MODEL = 'gemini-1.5-flash';

// Free OpenRouter models tried in order when Gemini rate-limits
export const OPENROUTER_FREE_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5-8b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
];

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}


const KeyPointsSchema = z.object({
  type: z.literal('keypoints'),
  topicName: z.string(),
  points: z.array(z.string()),
  memoryHook: z.string()
});
const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.number(),
  explanation: z.string()
});
const QuizSchema = z.object({
  type: z.literal('quiz'),
  topicName: z.string(),
  questions: z.array(QuizQuestionSchema)
});
const StorySchema = z.object({
  type: z.literal('story'),
  topicName: z.string(),
  story: z.string(),
  keyConceptHighlights: z.array(z.string())
});
const MnemonicSchema = z.object({
  type: z.literal('mnemonic'),
  topicName: z.string(),
  mnemonic: z.string(),
  expansion: z.array(z.string()),
  tip: z.string()
});
const TeachBackSchema = z.object({
  type: z.literal('teach_back'),
  topicName: z.string(),
  prompt: z.string(),
  keyPointsToMention: z.array(z.string()),
  guruReaction: z.string()
});
const ErrorHuntSchema = z.object({
  type: z.literal('error_hunt'),
  topicName: z.string(),
  paragraph: z.string(),
  errors: z.array(z.object({ wrong: z.string(), correct: z.string(), explanation: z.string() }))
});
const DetectiveSchema = z.object({
  type: z.literal('detective'),
  topicName: z.string(),
  clues: z.array(z.string()),
  answer: z.string(),
  explanation: z.string()
});
const AIContentSchema = z.union([
  KeyPointsSchema, QuizSchema, StorySchema, MnemonicSchema, TeachBackSchema, ErrorHuntSchema, DetectiveSchema
]);
const AgendaSchema = z.object({
  selectedTopicIds: z.array(z.number()),
  focusNote: z.string(),
  guruMessage: z.string()
});

class RateLimitError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RateLimitError'; }
}

export type GuruEventType = 'periodic' | 'card_done' | 'quiz_correct' | 'quiz_wrong' | 'again_rated';
export interface GuruPresenceMessage { text: string; trigger: GuruEventType; }

const FALLBACK_MESSAGES: GuruPresenceMessage[] = [
  { text: "Still here. Working through some Pharmacology while you tackle this.", trigger: 'periodic' },
  { text: "Heads down over here. Keep your pace.", trigger: 'periodic' },
  { text: "Nice. That card is done. One step closer.", trigger: 'card_done' },
  { text: "That's it. Knew you had that one.", trigger: 'quiz_correct' },
  { text: "Tricky question. Don't overthink it — move on.", trigger: 'quiz_wrong' },
  { text: "Good call flagging that. Honest review beats false confidence.", trigger: 'again_rated' },
];

async function callGemini(
  messages: Message[],
  apiKey: string,
  model = PRIMARY_MODEL,
  textMode = false,
): Promise<string> {
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const userMsg = messages.find(m => m.role === 'user')?.content || '';

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
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      systemInstruction: { parts: [{ text: systemMsg }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
        ...(textMode ? {} : { responseMimeType: 'application/json' }),
      },
    }),
  });

  if (res.status === 429) {
    const err = await res.text().catch(() => '');
    throw new RateLimitError(`Gemini rate limit: ${err}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    if (err.includes('RESOURCE_EXHAUSTED') || err.includes('quota')) {
      throw new RateLimitError(`Gemini quota exceeded: ${err}`);
    }
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

async function callOpenRouter(
  messages: Message[],
  orKey: string,
  model: string,
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orKey}`,
      'HTTP-Referer': 'neet-study-app',
      'X-Title': 'Guru Study App',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1200,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`OpenRouter rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`OpenRouter error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response from OpenRouter model ${model}`);
  return text;
}

// Try Gemini first; if rate-limited and orKey provided, walk through free OR models
async function callWithFallbacks(
  messages: Message[],
  geminiKey: string,
  orKey?: string,
  textMode = false,
): Promise<{ text: string; modelUsed: string }> {
  try {
    const text = await callGemini(messages, geminiKey, PRIMARY_MODEL, textMode);
    const model = geminiKey.includes('|') ? geminiKey.split('|')[1] : PRIMARY_MODEL;
    return { text, modelUsed: model };
  } catch (err) {
    if (!(err instanceof RateLimitError) || !orKey) throw err;
    console.log('[AI] Gemini rate-limited, trying OpenRouter free models...');
  }

  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      const text = await callOpenRouter(messages, orKey, model);
      console.log(`[AI] OpenRouter fallback succeeded with ${model}`);
      return { text, modelUsed: model };
    } catch (err) {
      console.warn(`[AI] ${model} failed:`, (err as Error).message);
      // Continue to next model regardless of error type
    }
  }

  throw new Error('All AI models are rate-limited or unavailable. Please try again later.');
}

function parseJsonResponse(raw: string): AIContent {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(clean);
  }
  return AIContentSchema.parse(parsed);
}
export async function fetchContent(
  topic: TopicWithProgress,
  contentType: ContentType,
  apiKey: string,
  orKey?: string,
): Promise<AIContent> {
  const cached = getCachedContent(topic.id, contentType);
  if (cached) return cached;

  const promptFn = CONTENT_PROMPT_MAP[contentType];
  const userPrompt = promptFn(topic.name, topic.subjectName);
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, modelUsed } = await callWithFallbacks(messages, apiKey, orKey);
    try {
      const parsed = parseJsonResponse(text);
      setCachedContent(topic.id, contentType, parsed, modelUsed);
      return parsed;
    } catch (e) {
      lastError = e as Error;
      console.warn(`[AI] Zod validation failed for ${contentType} attempt ${attempt + 1}:`, (e as Error).message);
    }
  }
  throw lastError!;
}

export async function prefetchTopicContent(
  topic: TopicWithProgress,
  contentTypes: ContentType[],
  apiKey: string,
  orKey?: string,
): Promise<void> {
  await Promise.allSettled(
    contentTypes.map(ct => fetchContent(topic, ct, apiKey, orKey)),
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
  orKey?: string,
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
  const { text } = await callWithFallbacks(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    apiKey,
    orKey,
  );

  const raw = JSON.parse(text.replace(/```json|```/g, ''));
  return AgendaSchema.parse(raw);
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
  orKey?: string,
): Promise<Array<{ title: string; body: string; scheduledFor: string }>> {
  const userPrompt = buildAccountabilityPrompt(stats);
  const { text } = await callWithFallbacks(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    apiKey,
    orKey,
  );
  const parsed = JSON.parse(text.replace(/```json|```/g, '')) as { messages: Array<{ title: string; body: string; scheduledFor: string }> };
  return parsed.messages;
}

export async function generateGuruPresenceMessages(
  topicNames: string[],
  allTopicNames: string[],
  apiKey: string,
  orKey?: string,
): Promise<GuruPresenceMessage[]> {
  const guruTopic = allTopicNames[Math.floor(Math.random() * allTopicNames.length)] ?? 'Biochemistry';
  const systemPrompt = `You are Guru, a study companion working alongside a medical student. You are currently studying ${guruTopic}. Be brief, warm, and grounding.`;
  const userPrompt = `The student is studying: ${topicNames.join(', ')}.
Generate exactly 6 ambient presence messages as a JSON array. Each has "text" (1-2 short sentences) and "trigger" (one of: periodic, card_done, quiz_correct, quiz_wrong, again_rated).
Include 2 "periodic" messages and 1 each of the other 4. Reference their topics or yours naturally.
Return only valid JSON: [{"text":"...","trigger":"..."},...]`;
  try {
    const { text } = await callWithFallbacks(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      apiKey, orKey,
    );
    const parsed = JSON.parse(text.replace(/```json|```/g, ''));
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as GuruPresenceMessage[];
    return FALLBACK_MESSAGES;
  } catch {
    return FALLBACK_MESSAGES;
  }
}

export async function chatWithGuru(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  apiKey: string,
  orKey?: string,
): Promise<{ reply: string }> {
  const historyStr = history.slice(-4).map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.text}`).join('\n');
  const systemPrompt = `You are Guru, a conversational medical tutor. Respond in 2-4 sentences. Use clinical anchors and mnemonics where helpful. Be direct and warm. Never output JSON.`;
  const userPrompt = `Topic: ${topicName}${historyStr ? `\n\nConversation so far:\n${historyStr}` : ''}\n\nStudent asks: ${question}`;
  const { text } = await callWithFallbacks(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    apiKey, orKey, true,
  );
  return { reply: text.trim() };
}

// Quick one-off question — for teach_back response evaluation
export async function askGuru(
  question: string,
  context: string,
  apiKey: string,
  orKey?: string,
): Promise<string> {
  const { text } = await callWithFallbacks(
    [
      { role: 'system', content: `${SYSTEM_PROMPT}\nRespond as Guru evaluating a student's answer. Output JSON: { "feedback": "...", "score": 0-5, "missed": ["key point missed"] }` },
      { role: 'user', content: `Context: ${context}\n\nStudent answer: ${question}` },
    ],
    apiKey,
    orKey,
  );
  return text.replace(/```json|```/g, '');
}


export async function transcribeAndSummarizeAudio(
  base64Audio: string,
  apiKey: string
): Promise<string> {
  const url = `${GEMINI_BASE}/${PRIMARY_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: "You are a medical lecture assistant. Transcribe and extract the absolute highest-yield medical facts and clinical pearls from this lecture snippet. Return ONLY a concise, bulleted list of 1-3 key points. If no clear medical concepts are spoken, return 'NO_CONTENT'." },
            { inlineData: { mimeType: 'audio/m4a', data: base64Audio } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
      }
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Gemini Audio API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty audio response from Gemini');
  return text.trim();
}
