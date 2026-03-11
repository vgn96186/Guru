import type { AIContent, ContentType, Mood, TopicWithProgress } from '../types';
import { z } from 'zod';
import { AppState, AppStateStatus } from 'react-native';
import { SYSTEM_PROMPT, CONTENT_PROMPT_MAP, buildAgendaPrompt, buildAccountabilityPrompt } from '../constants/prompts';
import { getCachedContent, setCachedContent } from '../db/queries/aiCache';
import { getUserProfile } from '../db/queries/progress';
import { initLlama, LlamaContext } from 'llama.rn';
import { initWhisper } from 'whisper.rn';

// Free OpenRouter models tried in order
export const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
];

// Optional bundled Groq key from env, used as cloud fallback when provided
const BUNDLED_GROQ_KEY = (process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '').trim();

/** Read API keys from the user profile. Keys are optional. */
export function getApiKeys(): { orKey: string | undefined; groqKey: string | undefined } {
  const profile = getUserProfile();
  return {
    orKey: profile.openrouterKey?.trim() || undefined,
    groqKey: profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY || undefined,
  };
}

export interface Message {
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

let llamaContext: LlamaContext | null = null;
let currentLlamaPath: string | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
let contextInUse = false; // semaphore: true while a generation is in flight

async function getLlamaContext(modelPath: string): Promise<LlamaContext> {
  if (llamaContext && currentLlamaPath === modelPath) {
    return llamaContext;
  }
  // Mutex: if another caller is already initializing, await the same promise
  if (llamaContextPromise) {
    await llamaContextPromise;
    if (llamaContext && currentLlamaPath === modelPath) return llamaContext;
  }
  llamaContextPromise = (async () => {
    if (llamaContext) {
      await llamaContext.release();
      llamaContext = null;
    }
    const ctx = await initLlama({ model: modelPath, n_context: 2048, use_mlock: false } as any);
    llamaContext = ctx;
    currentLlamaPath = modelPath;
    return ctx;
  })();
  try {
    return await llamaContextPromise;
  } finally {
    llamaContextPromise = null;
  }
}

/** Release the native LLM context to free memory. Safe to call at any time. */
export async function releaseLlamaContext(): Promise<void> {
  if (contextInUse) return; // don't interrupt in-flight generation
  if (llamaContext) {
    try { await llamaContext.release(); } catch {}
    llamaContext = null;
    currentLlamaPath = null;
  }
}

// Release the 200 MB+ LLM context when app goes to background to prevent OOM kills.
(function setupAppStateListener() {
  AppState.addEventListener('change', async (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      await releaseLlamaContext();
    }
  });
})();

async function callLocalLLM(messages: Message[], modelPath: string, textMode = false): Promise<string> {
  const ctx = await getLlamaContext(modelPath);
  contextInUse = true;
  try {
  let prompt = '';
  const isQwen = modelPath.toLowerCase().includes('qwen');

  if (isQwen) {
    // ChatML format for Qwen
    for (const m of messages) {
      prompt += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
    }
    prompt += `<|im_start|>assistant\n`;
  } else {
    // Format as Llama-3 instruction format
    for (const m of messages) {
      prompt += `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>\n`;
    }
    prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
  }

  if (!textMode) {
    // Force start of JSON object
    prompt += `{`;
  }

  const result = await ctx.completion({
    prompt,
    n_predict: 1500,
    temperature: 0.7,
    top_p: 0.9,
  });

  let text = result.text;
  if (!textMode) {
    text = `{${text}`;
  }
  return text;
  } finally {
    contextInUse = false;
  }
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

// Groq cloud models — fast inference, generous free tier
// Order: best quality first, then fastest fallback
export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',    // Best quality, 131K context, ~280 tok/s
  'llama-3.1-8b-instant',       // Fast fallback, 131K context
];

async function callGroq(
  messages: Message[],
  groqKey: string,
  model: string,
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`Groq rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response from Groq model ${model}`);
  return text;
}

async function callGroqText(
  messages: Message[],
  groqKey: string,
  model: string,
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`Groq rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response from Groq model ${model}`);
  return text;
}

async function attemptLocalLLM(
  messages: Message[],
  localModelPath: string,
  textMode: boolean,
): Promise<{ text: string; modelUsed: string }> {
  const isQwen = localModelPath.toLowerCase().includes('qwen');
  const modelUsed = isQwen ? 'local-qwen-2.5-3b' : 'local-llama-3.2-1b';
  const text = await callLocalLLM(messages, localModelPath, textMode);
  return { text, modelUsed };
}

async function attemptCloudLLM(
  messages: Message[],
  orKey: string | undefined,
  textMode: boolean,
  groqKey?: string | undefined,
  chosenModel?: string,
): Promise<{ text: string; modelUsed: string }> {
  // If a specific model is requested
  if (chosenModel) {
    if (chosenModel.startsWith('groq/') && groqKey) {
      const modelName = chosenModel.replace('groq/', '');
      const text = textMode
        ? await callGroqText(messages, groqKey, modelName)
        : await callGroq(messages, groqKey, modelName);
      return { text, modelUsed: chosenModel };
    }
    if (orKey) {
      const text = await callOpenRouter(messages, orKey, chosenModel);
      return { text, modelUsed: chosenModel };
    }
  }

  // 1. Try Groq first — fastest inference, generous free tier
  if (groqKey) {
    for (const model of GROQ_MODELS) {
      try {
        const text = textMode
          ? await callGroqText(messages, groqKey, model)
          : await callGroq(messages, groqKey, model);
        return { text, modelUsed: `groq/${model}` };
      } catch (err) {
        if (err instanceof RateLimitError) continue;
        // Non-rate-limit error on first model — try next Groq model
        if (__DEV__) console.warn(`[AI] Groq ${model} failed:`, (err as Error).message);
        continue;
      }
    }
  }

  // 2. Try OpenRouter free models
  if (orKey) {
    for (const model of OPENROUTER_FREE_MODELS) {
      try {
        const text = await callOpenRouter(messages, orKey, model);
        return { text, modelUsed: model };
      } catch {
        continue;
      }
    }
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
}

function stripJsonCodeFences(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractBalancedJson(raw: string): string {
  const objectStart = raw.indexOf('{');
  const arrayStart = raw.indexOf('[');
  const start = objectStart === -1
    ? arrayStart
    : arrayStart === -1
      ? objectStart
      : Math.min(objectStart, arrayStart);

  if (start === -1) return raw.trim();

  const stack: string[] = [];
  let inString = false;
  let quoteChar = '';
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quoteChar) {
        inString = false;
        quoteChar = '';
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if ((char === '}' || char === ']') && stack.length > 0) {
      const expected = stack.pop();
      if (char !== expected) return raw.slice(start).trim();
      if (stack.length === 0) {
        return raw.slice(start, i + 1).trim();
      }
    }
  }

  return raw.slice(start).trim();
}

function toDoubleQuotedString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * String-safe JSON repair. Uses a placeholder approach:
 * 1. Extract all existing double-quoted strings -> placeholders
 * 2. Fix structural issues (unquoted keys, single-quoted keys/values, comments,
 *    missing commas, trailing commas) - safe since real strings are placeholders
 * 3. Restore original strings from placeholders
 */
function repairCommonJsonIssues(raw: string): string {
  let s = raw
    .replace(/[\u201C\u201D]/g, '"')   // Smart double quotes -> regular
    .replace(/[\u2018\u2019]/g, "'")   // Smart single quotes -> regular
    .replace(/^json\s*/i, '');          // Strip leading "json" prefix

  // Phase 1: Protect existing double-quoted strings with placeholders
  const strings: string[] = [];
  s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
    strings.push(match);
    return `\x00S${strings.length - 1}\x00`;
  });

  // Phase 2: Structural repairs (no double-quoted strings present, safe to regex)

  // Strip // line comments
  s = s.replace(/\/\/[^\n]*/g, '');

  // Fix single-quoted keys: { 'key': value }
  s = s.replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(\s*:)/g,
    (_m: string, pre: string, key: string, suf: string) =>
      `${pre}"${key.replace(/"/g, '\\"')}"${suf}`);

  // Fix single-quoted values: : 'value'
  s = s.replace(/(:\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[,}\]\x00])/g,
    (_m: string, pre: string, val: string) =>
      `${pre}"${val.replace(/"/g, '\\"')}"`);

  // Fix unquoted keys (now safe - real strings are placeholders so won't be corrupted)
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');

  // Insert missing commas between properties:
  //   placeholder or } or ] or digit at end, then newline, then placeholder or "key"
  s = s.replace(/(\x00)(\s*\n\s*)(\x00|")/g, '$1,$2$3');
  s = s.replace(/([\]}\d])(\s*\n\s*)(\x00|")/g, '$1,$2$3');
  s = s.replace(/(true|false|null)(\s*\n\s*)(\x00|")/g, '$1,$2$3');

  // Fix trailing commas
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Phase 3: Restore original strings
  s = s.replace(/\x00S(\d+)\x00/g, (_: string, idx: string) => strings[parseInt(idx, 10)]);

  return s.trim();
}

/**
 * Attempt to close truncated JSON (when local model hits token limit mid-output).
 * Counts unclosed braces/brackets and appends the needed closers.
 */
function repairTruncatedJson(raw: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }

  if (stack.length === 0) return raw;

  // If we were inside an unclosed string, close it first
  let suffix = inString ? '"' : '';
  // Close all open braces/brackets in reverse order
  while (stack.length > 0) suffix += stack.pop();
  return raw + suffix;
}

export function parseStructuredJson<T>(raw: string, schema: z.ZodType<T>): T {
  if (__DEV__) console.log('[AI] Raw text for JSON parsing (first 600 chars):', raw.slice(0, 600));

  const cleaned = stripJsonCodeFences(raw);
  const extracted = extractBalancedJson(cleaned);

  const candidates = Array.from(new Set([
    cleaned,
    extracted,
    repairCommonJsonIssues(cleaned),
    repairCommonJsonIssues(extracted),
    // Also try repairing truncated JSON (local model can hit token limit)
    repairCommonJsonIssues(repairTruncatedJson(cleaned)),
    repairCommonJsonIssues(repairTruncatedJson(extracted)),
  ].filter(Boolean)));

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return schema.parse(JSON.parse(candidate));
    } catch (err) {
      lastError = err as Error;
    }
  }

  if (__DEV__) {
    console.warn('[AI] All JSON parse candidates failed. Candidates tried:', candidates.map(c => c.slice(0, 200)));
  }

  throw lastError || new Error('Failed to parse structured JSON response');
}

export async function generateJSONWithRouting<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  taskComplexity: 'low' | 'high' = 'low'
): Promise<{ parsed: T; modelUsed: string }> {
  const profile = getUserProfile();
  const { orKey, groqKey } = getApiKeys();
  const hasLocal = profile.useLocalModel && !!profile.localModelPath;
  const isQwen = hasLocal && profile.localModelPath!.toLowerCase().includes('qwen');
  const hasCloud = !!orKey || !!groqKey;

  // High complexity tasks on 1B Llama model usually output invalid JSON. We prefer cloud for them.
  const preferCloud = taskComplexity === 'high' && hasLocal && !isQwen && hasCloud;

  // Define the order of backends to try — cloud first for reliability
  const attempts: ('local' | 'cloud')[] = [];
  if (hasCloud) attempts.push('cloud');
  if (hasLocal) attempts.push('local');

  if (attempts.length === 0) throw new Error('No AI backend available. Download a local model or add an API key in Settings.');

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      const { text, modelUsed } = backend === 'local'
        ? await attemptLocalLLM(messages, profile.localModelPath!, false)
        : await attemptCloudLLM(messages, orKey, false, groqKey);
      const parsed = parseStructuredJson(text, schema);
      return { parsed, modelUsed };
    } catch (err) {
      if (__DEV__) console.warn(`[AI] ${backend} inference/parsing failed:`, (err as Error).message);
      lastError = err as Error;
      continue;
    }
  }

  throw lastError || new Error('All AI attempts failed');
}

export async function generateTextWithRouting(
  messages: Message[],
  options?: { preferCloud?: boolean; chosenModel?: string },
): Promise<{ text: string; modelUsed: string }> {
  const profile = getUserProfile();
  const { orKey, groqKey } = getApiKeys();
  const hasLocal = profile.useLocalModel && !!profile.localModelPath;
  const hasCloud = !!orKey || !!groqKey;

  // If a specific model is chosen and it's local (e.g., matching the local model path name or 'local')
  if (options?.chosenModel === 'local' && hasLocal) {
    return await attemptLocalLLM(messages, profile.localModelPath!, true);
  }

  const attempts: ('local' | 'cloud')[] = [];
  if (options?.chosenModel) {
    attempts.push('cloud');
  } else if (options?.preferCloud) {
    if (hasCloud) attempts.push('cloud');
    if (hasLocal) attempts.push('local');
  } else {
    if (hasCloud) attempts.push('cloud');
    if (hasLocal) attempts.push('local');
  }

  if (attempts.length === 0) throw new Error('No AI backend available. Download a local model or add an API key in Settings.');

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      const { text, modelUsed } = backend === 'local'
        ? await attemptLocalLLM(messages, profile.localModelPath!, true)
        : await attemptCloudLLM(messages, orKey, true, groqKey, options?.chosenModel);
      return { text, modelUsed };
    } catch (err) {
      if (__DEV__) console.warn(`[AI] ${backend} inference failed:`, (err as Error).message);
      lastError = err as Error;
      continue;
    }
  }

  throw lastError || new Error('All AI attempts failed');
}


export async function fetchContent(
  topic: TopicWithProgress,
  contentType: ContentType,
): Promise<AIContent> {
  const cached = getCachedContent(topic.id, contentType);
  if (cached) return cached;

  const promptFn = CONTENT_PROMPT_MAP[contentType];
  const userPrompt = promptFn(topic.name, topic.subjectName);
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const { parsed, modelUsed } = await generateJSONWithRouting(messages, AIContentSchema, 'low');
  setCachedContent(topic.id, contentType, parsed as any, modelUsed);
  return parsed as any;
}

export async function prefetchTopicContent(
  topic: TopicWithProgress,
  contentTypes: ContentType[],
): Promise<void> {
  await Promise.allSettled(
    contentTypes.map(ct => fetchContent(topic, ct)),
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

export async function chatWithGuru(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
): Promise<{ reply: string }> {
  const historyStr = history.slice(-4).map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.text}`).join('\n');
  const systemPrompt = `You are Guru, a conversational medical tutor. Respond in 2-4 sentences. Use clinical anchors and mnemonics where helpful. Be direct and warm. Never output JSON.`;
  const userPrompt = `Topic: ${topicName}${historyStr ? `\n\nConversation so far:\n${historyStr}` : ''}\n\nStudent asks: ${question}`;
  const { text } = await generateTextWithRouting(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    { chosenModel }
  );
  return { reply: text.trim() };
}

export interface MedicalGroundingSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  journal?: string;
  publishedAt?: string;
  source: 'EuropePMC' | 'PubMed';
}

export async function generateWakeUpMessage(): Promise<{ title: string; body: string }> {
  const systemPrompt = `You are Guru, an elite medical tutor. A student is waking up for another day of NEET-PG/INI-CET prep.
Generate a short, sharp, and motivating wake-up call. Reference "Doctor" and the morning ahead.
Return JSON: { "title": "...", "body": "..." }`;
  try {
    const { parsed } = await generateJSONWithRouting(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Wake up call.' }],
      z.object({ title: z.string(), body: z.string() }),
      'low'
    );
    return parsed;
  } catch {
    return { title: "Good Morning, Doctor. 🌅", body: "Time to rise and build some momentum. Tap here to wake up." };
  }
}

export async function generateBreakEndMessages(): Promise<string[]> {
  const systemPrompt = `You are Guru, an aggressive medical tutor. A student is on a 5-minute break and likely scrolling Instagram/reels instead of returning to study.
Generate exactly 8 increasingly aggressive, sharp, and sarcastic one-line reminders to get them back to their tablet. 
Mention INI-CET/NEET-PG pressure. Be blunt. No JSON, just one message per line.`;
  const userPrompt = `The break is over. They are still on their phone. Give me 8 lines.`;
  try {
    const { text } = await generateTextWithRouting(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { preferCloud: true }
    );
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5 && !l.startsWith('[') && !l.startsWith('{'));
    if (lines.length >= 5) return lines.slice(0, 9);
    return FALLBACK_BREAK_MESSAGES;
  } catch {
    return FALLBACK_BREAK_MESSAGES;
  }
}

const FALLBACK_BREAK_MESSAGES = [
  "🚨 BREAK IS OVER. Return to the tablet now.",
  "Are you ignoring me? Close Instagram immediately.",
  "Every second you waste is a lower INICET score.",
  "I told you this would happen. Go back to studying.",
  "Your 5 minutes are up. Stop scrolling.",
  "Get up. Walk to the tablet. Press play.",
  "This is pathetic. Drop the phone.",
  "I will not stop buzzing. Resume the lecture.",
  "Resume the lecture on the tablet to silence me."
];

interface GroundedGuruResponse {
  reply: string;
  sources: MedicalGroundingSource[];
  modelUsed: string;
  searchQuery: string;
}

function compactWhitespace(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function clipText(raw: string, maxChars: number): string {
  const text = compactWhitespace(raw);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildMedicalSearchQuery(question: string, topicName?: string): string {
  const base = compactWhitespace(`${topicName ?? ''} ${question}`.trim());
  const cleaned = base.replace(/[^\w\s\-(),./]/g, ' ');
  return clipText(`${cleaned} clinical evidence`, 180);
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function dedupeGroundingSources(sources: MedicalGroundingSource[]): MedicalGroundingSource[] {
  const seen = new Set<string>();
  const deduped: MedicalGroundingSource[] = [];
  for (const src of sources) {
    const key = `${src.title.toLowerCase()}|${src.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(src);
  }
  return deduped;
}

async function searchEuropePMC(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const europeQuery = `(${query}) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(europeQuery)}&format=json&pageSize=${maxResults}&sort_date:y`;
  const data = await fetchJsonWithTimeout<any>(url, 14000);
  const rows = Array.isArray(data?.resultList?.result) ? data.resultList.result : [];

  return rows
    .filter((row: any) => row?.title)
    .slice(0, maxResults)
    .map((row: any, idx: number): MedicalGroundingSource => {
      const title = clipText(String(row.title), 220);
      const doi = String(row.doi ?? '').trim();
      const pmid = String(row.pmid ?? '').trim();
      const sourceId = String(row.id ?? pmid ?? idx + 1);
      const urlFromId = pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : `https://europepmc.org/article/${row.source ?? 'MED'}/${sourceId}`;
      const snippetRaw = String(row.abstractText ?? row.authorString ?? 'No abstract snippet available.');

      return {
        id: `epmc-${sourceId}`,
        title,
        url: doi ? `https://doi.org/${doi}` : urlFromId,
        snippet: clipText(snippetRaw, 420),
        journal: String(row.journalTitle ?? '').trim() || undefined,
        publishedAt: String(row.firstPublicationDate ?? row.pubYear ?? '').trim() || undefined,
        source: 'EuropePMC',
      };
    });
}

async function searchPubMedFallback(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const term = `${query} AND (english[Language])`;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${maxResults}&term=${encodeURIComponent(term)}`;
  const searchData = await fetchJsonWithTimeout<any>(searchUrl);
  const ids: string[] = Array.isArray(searchData?.esearchresult?.idlist) ? searchData.esearchresult.idlist : [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
  const summaryData = await fetchJsonWithTimeout<any>(summaryUrl);
  const uidList: string[] = Array.isArray(summaryData?.result?.uids) ? summaryData.result.uids : ids;

  return uidList
    .map((uid): MedicalGroundingSource | null => {
      const row = summaryData?.result?.[uid];
      if (!row?.title) return null;
      const publishedAt = String(row.pubdate ?? '').trim() || undefined;
      const journal = String(row.fulljournalname ?? row.source ?? '').trim() || undefined;
      return {
        id: `pmid-${uid}`,
        title: clipText(String(row.title), 220),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        snippet: clipText(
          `Indexed on PubMed${journal ? ` in ${journal}` : ''}${publishedAt ? ` (${publishedAt})` : ''}. Open source link for abstract and full metadata.`,
          420,
        ),
        journal,
        publishedAt,
        source: 'PubMed',
      };
    })
    .filter((row): row is MedicalGroundingSource => !!row);
}

export async function searchLatestMedicalSources(query: string, maxResults = 6): Promise<MedicalGroundingSource[]> {
  const collected: MedicalGroundingSource[] = [];

  try {
    const europe = await searchEuropePMC(query, maxResults);
    collected.push(...europe);
  } catch (err) {
    if (__DEV__) console.warn('[GuruGrounded] EuropePMC failed:', (err as Error).message);
  }

  if (collected.length < Math.min(3, maxResults)) {
    try {
      const pubmed = await searchPubMedFallback(query, maxResults);
      collected.push(...pubmed);
    } catch (err) {
      if (__DEV__) console.warn('[GuruGrounded] PubMed fallback failed:', (err as Error).message);
    }
  }

  return dedupeGroundingSources(collected).slice(0, maxResults);
}

function renderSourcesForPrompt(sources: MedicalGroundingSource[]): string {
  return sources
    .map((src, idx) => {
      const published = src.publishedAt ? `Published: ${src.publishedAt}` : 'Published: unknown date';
      const journal = src.journal ? `Journal: ${src.journal}` : 'Journal: not listed';
      return `[S${idx + 1}]
Title: ${src.title}
Source: ${src.source}
${published}
${journal}
URL: ${src.url}
Snippet: ${src.snippet}`;
    })
    .join('\n\n');
}

export async function chatWithGuruGrounded(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
): Promise<GroundedGuruResponse> {
  const trimmedQuestion = compactWhitespace(question);
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, topicName);
  const sources = await searchLatestMedicalSources(searchQuery, 6);

  const historyStr = history
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${clipText(m.text, 280)}`)
    .join('\n');

  const sourcesBlock = sources.length > 0
    ? renderSourcesForPrompt(sources)
    : 'No live web sources were retrieved for this query.';

  const systemPrompt = `You are Guru, an evidence-grounded medical tutor.
Rules:
1) Base claims only on provided SOURCES.
2) Add citations as [S1], [S2] inline where relevant.
3) If evidence is limited, explicitly say so.
4) Do not fabricate citations or studies.
5) Do not provide personal diagnosis. Keep it educational and safety-aware.
6) Keep answer concise (about 120-220 words), structured, and practical.`;

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
  } catch (error: any) {
    if (__DEV__) console.warn('[GuruGrounded] Generation failed:', error.message);
    throw new Error('Guru was unable to generate a response. Please check your API keys in Settings.');
  }
}

// Quick one-off question — for teach_back response evaluation
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

async function transcribeWithGroqCloud(
  fileUri: string,
  groqKey: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'audio.m4a',
    type: 'audio/mp4',
  } as any);
  formData.append('model', 'whisper-large-v3-turbo');
  // Don't hardcode language — let Whisper auto-detect for Hinglish lectures
  formData.append('temperature', '0');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq audio transcription error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return String(data?.text ?? '').trim();
}

export async function transcribeAndSummarizeAudio(
  audioFilePath: string,
): Promise<string> {
  const profile = getUserProfile();
  const { groqKey } = getApiKeys();
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;

  if (profile.useLocalWhisper && profile.localWhisperPath) {
    // 1. Local Transcription using whisper.rn
    const whisperContext = await initWhisper({ filePath: profile.localWhisperPath });
    try {
      const { result } = await whisperContext.transcribe(fileUri, { language: 'en' });
      const rawTranscript = result.trim();
      if (!rawTranscript) return 'NO_CONTENT';

      // 2. Summarize using text routing (local first, then cloud)
      const summarizeMessages: Message[] = [
        { role: 'system', content: "You are a medical lecture assistant." },
        { role: 'user', content: `Extract the absolute highest-yield medical facts from this lecture snippet. Return ONLY a concise, bulleted list of 1-3 key points. Transcript:\n\n${rawTranscript}` }
      ];
      const { text } = await generateTextWithRouting(summarizeMessages);
      return text.trim();
    } finally {
      await whisperContext.release();
    }
  }

  // Fallback to cloud Whisper transcription via Groq
  if (!groqKey) {
    throw new Error('Cloud audio transcription requires a Groq API key. Or download the local Whisper model.');
  }

  const rawTranscript = await transcribeWithGroqCloud(fileUri, groqKey);
  if (!rawTranscript) return 'NO_CONTENT';

  const summarizeMessages: Message[] = [
    { role: 'system', content: 'You are a medical lecture assistant.' },
    { role: 'user', content: `Extract the absolute highest-yield medical facts from this lecture snippet. Return ONLY a concise, bulleted list of 1-3 key points. Transcript:\n\n${rawTranscript}` },
  ];
  const { text } = await generateTextWithRouting(summarizeMessages);
  return text.trim();
}

const CatalystSchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  summary: z.string(),
  keyConcepts: z.array(z.string()),
  quiz: z.object({
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number(),
      explanation: z.string()
    }))
  })
});

export async function catalyzeTranscript(
  transcript: string,
): Promise<z.infer<typeof CatalystSchema>> {
  const userPrompt = `
You are a medical lecture analyst. Below is a raw transcript or summary of a lecture.
Your task is to:
1. Identify the primary medical subject.
2. Extract specific topic names mentioned.
3. Provide a 2-line high-level summary.
4. Extract 5 high-yield key concepts.
5. Generate a 3-question MCQ quiz based on the content.

TRANSCRIPT:
${transcript}

Return ONLY a JSON object matching this structure:
{
  "subject": "string",
  "topics": ["string", "string"],
  "summary": "string",
  "keyConcepts": ["string", "string"],
  "quiz": {
    "questions": [
      { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..." }
    ]
  }
}
`;

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const { parsed } = await generateJSONWithRouting(messages, CatalystSchema, 'high');
  return parsed;
}
