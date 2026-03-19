import { AppState, AppStateStatus } from 'react-native';
import { initLlama, LlamaContext } from 'llama.rn';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import { OPENROUTER_FREE_MODELS, GROQ_MODELS } from './config';
import { RateLimitError } from './schemas';

let llamaContext: LlamaContext | null = null;
let currentLlamaPath: string | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
let contextInUse = false; // semaphore: true while a generation is in flight
let appStateListenerRegistered = false;

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
  if (contextInUse || llamaContextPromise) return; // don't interrupt in-flight generation or init
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (err) {
      console.warn('[LLM] Failed to release native context:', err);
    }
    llamaContext = null;
    currentLlamaPath = null;
  }
}

// Release the 200 MB+ LLM context when app goes to background to prevent OOM kills.
// Guard prevents duplicate listeners on hot reloads in dev.
if (!appStateListenerRegistered) {
  appStateListenerRegistered = true;
  AppState.addEventListener('change', async (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      await releaseLlamaContext();
    }
  });
}

async function callLocalLLM(
  messages: Message[],
  modelPath: string,
  textMode = false,
): Promise<string> {
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

async function callOpenRouter(messages: Message[], orKey: string, model: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orKey}`,
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
  if (!text || !text.trim()) throw new Error(`Empty response from OpenRouter model ${model}`);
  return text;
}

async function callGroq(messages: Message[], groqKey: string, model: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
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
  if (!text || !text.trim()) throw new Error(`Empty response from Groq model ${model}`);
  return text;
}

async function callGroqText(messages: Message[], groqKey: string, model: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
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
  if (!text || !text.trim()) throw new Error(`Empty response from Groq model ${model}`);
  return text;
}

export async function attemptLocalLLM(
  messages: Message[],
  localModelPath: string,
  textMode: boolean,
): Promise<{ text: string; modelUsed: string }> {
  const isQwen = localModelPath.toLowerCase().includes('qwen');
  const isMedGemma = localModelPath.toLowerCase().includes('medgemma');
  const modelUsed = isMedGemma
    ? 'local-medgemma-4b'
    : isQwen
      ? 'local-qwen-2.5-3b'
      : 'local-llama-3.2-1b';
  try {
    const text = await callLocalLLM(messages, localModelPath, textMode);
    if (!text || !text.trim()) {
      throw new Error('Local model returned an empty response');
    }
    return { text, modelUsed };
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    // If the model file failed to load (corrupt/missing), clear the stored path
    // so the bootstrap will re-download it on next startup.
    if (
      msg.toLowerCase().includes('failed to load') ||
      msg.toLowerCase().includes('no such file') ||
      msg.toLowerCase().includes('invalid model')
    ) {
      llamaContext = null;
      currentLlamaPath = null;
      llamaContextPromise = null;
      profileRepository
        .updateProfile({ localModelPath: null, useLocalModel: false })
        .catch(() => {});
      throw new Error(
        'Local model file is missing or corrupt — it will re-download on next startup.',
      );
    }
    throw err;
  }
}

export async function attemptCloudLLM(
  messages: Message[],
  orKey: string | undefined,
  textMode: boolean,
  groqKey?: string | undefined,
  chosenModel?: string,
): Promise<{ text: string; modelUsed: string }> {
  const preferredGroqModel = chosenModel?.startsWith('groq/')
    ? chosenModel.replace('groq/', '')
    : undefined;
  const preferredOpenRouterModel =
    chosenModel && !chosenModel.startsWith('groq/') && chosenModel !== 'local'
      ? chosenModel
      : undefined;

  let lastCloudError: Error | null = null;

  // If a specific Groq model is requested, try it first while preserving Groq-first policy.
  if (preferredGroqModel && groqKey) {
    try {
      const text = textMode
        ? await callGroqText(messages, groqKey, preferredGroqModel)
        : await callGroq(messages, groqKey, preferredGroqModel);
      return { text, modelUsed: `groq/${preferredGroqModel}` };
    } catch (err) {
      lastCloudError = err as Error;
      if (__DEV__)
        console.warn(
          `[AI] Groq preferred model ${preferredGroqModel} failed:`,
          lastCloudError.message,
        );
    }
  }

  // 1. Try Groq first — fastest inference, generous free tier
  if (groqKey) {
    for (const model of GROQ_MODELS) {
      if (preferredGroqModel && model === preferredGroqModel) continue;
      try {
        const text = textMode
          ? await callGroqText(messages, groqKey, model)
          : await callGroq(messages, groqKey, model);
        return { text, modelUsed: `groq/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        // Non-rate-limit error on first model — try next Groq model
        if (__DEV__) console.warn(`[AI] Groq ${model} failed:`, (err as Error).message);
        continue;
      }
    }
  }

  // 2. Try OpenRouter free models
  if (orKey) {
    const openRouterCandidates = Array.from(
      new Set([
        ...(preferredOpenRouterModel ? [preferredOpenRouterModel] : []),
        ...OPENROUTER_FREE_MODELS,
      ]),
    );
    for (const model of openRouterCandidates) {
      try {
        const text = await callOpenRouter(messages, orKey, model);
        return { text, modelUsed: model };
      } catch (err) {
        lastCloudError = err as Error;
        continue;
      }
    }
  }

  if (lastCloudError) {
    throw lastCloudError;
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
}
