import { AppState } from 'react-native';
import { initLlama, LlamaContext } from 'llama.rn';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import { OPENROUTER_FREE_MODELS, GROQ_MODELS, GEMINI_MODELS, CLOUDFLARE_MODELS, DEEPSEEK_MODELS, MULEROUTER_MODELS } from './config';
import { RateLimitError } from './schemas';
import { readOpenAiCompatibleSse } from './openaiSseStream';
import { geminiGenerateContentSdk, geminiGenerateContentStreamSdk } from './google/geminiChat';

let llamaContext: LlamaContext | null = null;
let currentLlamaPath: string | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
type AppStateSubscription = { remove?: () => void };
const APPSTATE_SUB_KEY = '__guru_llmRouting_appState_sub_v1';

// Promise-based mutex: prevents concurrent LLM generation which corrupts native context.
// Unlike a boolean flag, this properly queues callers and can't deadlock on thrown errors.
let _contextLockPromise: Promise<void> = Promise.resolve();
let _contextLockCount = 0;

function acquireContextLock(): Promise<() => void> {
  let release!: () => void;
  const prev = _contextLockPromise;
  _contextLockPromise = new Promise<void>((resolve) => {
    release = () => {
      _contextLockCount--;
      resolve();
    };
  });
  _contextLockCount++;
  return prev.then(() => release);
}

function isContextInUse(): boolean {
  return _contextLockCount > 0;
}

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
    // Performance defaults tuned for quantized GGUF on mid-range Android.
    const ctx = await initLlama({
      model: modelPath,
      n_context: 2048,
      n_batch: 384,
      k_type: 2,
      v_type: 2,
      use_mlock: false,
    } as any);
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
  if (isContextInUse() || llamaContextPromise) return; // don't interrupt in-flight generation or init
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
// Store the subscription on `globalThis` so hot reload can't stack listeners.
const prevSub = (globalThis as any)[APPSTATE_SUB_KEY] as AppStateSubscription | undefined;
if (prevSub?.remove) prevSub.remove();
(globalThis as any)[APPSTATE_SUB_KEY] = AppState.addEventListener('change', async (state) => {
  if (state === 'background' || state === 'inactive') {
    await releaseLlamaContext();
  }
}) as AppStateSubscription;

async function callLocalLLM(
  messages: Message[],
  modelPath: string,
  textMode = false,
): Promise<string> {
  const ctx = await getLlamaContext(modelPath);
  const release = await acquireContextLock();
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

    const n_predict = textMode ? 2000 : 1024;
    const result = await ctx.completion({
      prompt,
      n_predict,
      temperature: 0.7,
      top_p: 0.9,
    });

    let text = result.text;
    if (!textMode) {
      text = `{${text}`;
    }
    return text;
  } finally {
    release();
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

/** Cloudflare Workers AI — OpenAI-compatible endpoint. */
async function callCloudflare(
  messages: Message[],
  accountId: string,
  apiToken: string,
  model: string,
): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1200,
      }),
    },
  );

  if (res.status === 429) {
    throw new RateLimitError(`Cloudflare rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Cloudflare error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from Cloudflare model ${model}`);
  return text;
}

/** Cloudflare Workers AI chat with SSE streaming. */
async function streamCloudflareChat(
  messages: Message[],
  accountId: string,
  apiToken: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1200,
        stream: true,
      }),
    },
  );

  if (res.status === 429) {
    throw new RateLimitError(`Cloudflare rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Cloudflare error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    const text = await callCloudflare(messages, accountId, apiToken, model);
    onDelta(text);
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  if (!text.trim()) throw new Error(`Empty response from Cloudflare model ${model}`);
  return text;
}

async function callGroq(
  messages: Message[],
  groqKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = [...messages];
  if (jsonMode) {
    // Groq requires the word "json" to be present in the prompt when using json_object format.
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: jsonMode ? clonedMessages : messages,
    temperature: 0.7,
    max_tokens: 2000,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify(body),
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

/** Groq chat with SSE; falls back to non-streaming JSON if the runtime has no response body stream. */
async function streamGroqChat(
  messages: Message[],
  groqKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
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
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`Groq rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    const text = await callGroq(messages, groqKey, model, false);
    onDelta(text);
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  if (!text.trim()) throw new Error(`Empty response from Groq model ${model}`);
  return text;
}

/** OpenRouter chat with SSE; falls back to non-streaming if no body stream. */
async function streamOpenRouterChat(
  messages: Message[],
  orKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
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
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`OpenRouter rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`OpenRouter error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    const text = await callOpenRouter(messages, orKey, model);
    onDelta(text);
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  if (!text.trim()) throw new Error(`Empty response from OpenRouter model ${model}`);
  return text;
}

async function callDeepSeek(
  messages: Message[],
  deepseekKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = [...messages];
  if (jsonMode) {
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 2000,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw new RateLimitError(`DeepSeek rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`DeepSeek error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from DeepSeek model ${model}`);
  return text;
}

async function streamDeepSeekChat(
  messages: Message[],
  deepseekKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`DeepSeek rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`DeepSeek error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    const text = await callDeepSeek(messages, deepseekKey, model, false);
    onDelta(text);
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  if (!text.trim()) throw new Error(`Empty response from DeepSeek model ${model}`);
  return text;
}

async function callMuleRouter(
  messages: Message[],
  mulerouterKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = [...messages];
  if (jsonMode) {
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 2000,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.mulerouter.ai/vendors/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mulerouterKey}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw new RateLimitError(`MuleRouter rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`MuleRouter error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from MuleRouter model ${model}`);
  return text;
}

async function streamMuleRouterChat(
  messages: Message[],
  mulerouterKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch('https://api.mulerouter.ai/vendors/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mulerouterKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`MuleRouter rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`MuleRouter error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    const text = await callMuleRouter(messages, mulerouterKey, model, false);
    onDelta(text);
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  if (!text.trim()) throw new Error(`Empty response from MuleRouter model ${model}`);
  return text;
}

/**
 * Same routing policy as attemptCloudLLM, but streams assistant tokens via onDelta.
 * (JSON / structured output is not streamed — use {@link attemptCloudLLM} instead.)
 */
export async function attemptCloudLLMStream(
  messages: Message[],
  orKey: string | undefined,
  groqKey: string | undefined,
  chosenModel: string | undefined,
  onDelta: (delta: string) => void,
  geminiKey?: string | undefined,
  geminiFallbackKey?: string | undefined,
  cfAccountId?: string | undefined,
  cfApiToken?: string | undefined,
  deepseekKey?: string | undefined,
  mulerouterKey?: string | undefined,
): Promise<{ text: string; modelUsed: string }> {
  const preferredGroqModel = chosenModel?.startsWith('groq/') ? chosenModel.replace('groq/', '') : undefined;
  const preferredGeminiModel = chosenModel?.startsWith('gemini/') ? chosenModel.replace('gemini/', '') : undefined;
  const preferredCfModel = chosenModel?.startsWith('cf/') ? chosenModel.replace('cf/', '') : undefined;
  const preferredDeepseekModel = chosenModel?.startsWith('deepseek/') ? chosenModel.replace('deepseek/', '') : undefined;
  const preferredMulerouterModel = chosenModel?.startsWith('mulerouter/') ? chosenModel.replace('mulerouter/', '') : undefined;
  const preferredOpenRouterModel =
    chosenModel && !preferredGroqModel && !preferredGeminiModel && !preferredCfModel && !preferredDeepseekModel && !preferredMulerouterModel && chosenModel !== 'local' && chosenModel !== 'auto'
      ? chosenModel
      : undefined;

  let lastCloudError: Error | null = null;

  // 1. Explicit UI Selections
  if (preferredOpenRouterModel && orKey) {
    try {
      const text = await streamOpenRouterChat(messages, orKey, preferredOpenRouterModel, onDelta);
      return { text, modelUsed: preferredOpenRouterModel };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGroqModel && groqKey) {
    try {
      const text = await streamGroqChat(messages, groqKey, preferredGroqModel, onDelta);
      return { text, modelUsed: `groq/${preferredGroqModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGeminiModel && geminiKey) {
    try {
      const text = await geminiGenerateContentStreamSdk(messages, geminiKey, preferredGeminiModel, onDelta);
      return { text, modelUsed: `gemini/${preferredGeminiModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredCfModel && cfAccountId && cfApiToken) {
    try {
      const text = await streamCloudflareChat(messages, cfAccountId, cfApiToken, preferredCfModel, onDelta);
      return { text, modelUsed: `cf/${preferredCfModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredMulerouterModel && mulerouterKey) {
    try {
      const text = await streamMuleRouterChat(messages, mulerouterKey, preferredMulerouterModel, onDelta);
      return { text, modelUsed: `mulerouter/${preferredMulerouterModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  // 2. Default Routing
  if (mulerouterKey) {
    for (const model of MULEROUTER_MODELS) {
      if (preferredMulerouterModel && model === preferredMulerouterModel) continue;
      try {
        const text = await streamMuleRouterChat(messages, mulerouterKey, model, onDelta);
        return { text, modelUsed: `mulerouter/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (deepseekKey) {
    for (const model of DEEPSEEK_MODELS) {
      if (preferredDeepseekModel && model === preferredDeepseekModel) continue;
      try {
        const text = await streamDeepSeekChat(messages, deepseekKey, model, onDelta);
        return { text, modelUsed: `deepseek/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (groqKey) {
    for (const model of GROQ_MODELS) {
      if (preferredGroqModel && model === preferredGroqModel) continue;
      try {
        const text = await streamGroqChat(messages, groqKey, model, onDelta);
        return { text, modelUsed: `groq/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (geminiKey) {
    for (const model of GEMINI_MODELS) {
      if (preferredGeminiModel && model === preferredGeminiModel) continue;
      try {
        const text = await geminiGenerateContentStreamSdk(messages, geminiKey, model, onDelta);
        return { text, modelUsed: `gemini/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (geminiFallbackKey) {
    for (const model of GEMINI_MODELS) {
      if (preferredGeminiModel && model === preferredGeminiModel) continue;
      try {
        const text = await geminiGenerateContentStreamSdk(messages, geminiFallbackKey, model, onDelta);
        return { text, modelUsed: `gemini/${model} (fallback_key)` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (groqKey) {
    for (const model of GROQ_MODELS) {
      if (preferredGroqModel && model === preferredGroqModel) continue;
      try {
        const text = await streamGroqChat(messages, groqKey, model, onDelta);
        return { text, modelUsed: `groq/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (orKey) {
    for (const model of OPENROUTER_FREE_MODELS) {
      if (preferredOpenRouterModel && model === preferredOpenRouterModel) continue;
      try {
        const text = await streamOpenRouterChat(messages, orKey, model, onDelta);
        return { text, modelUsed: model };
      } catch (err) {
        lastCloudError = err as Error;
        continue;
      }
    }
  }

  if (cfAccountId && cfApiToken) {
    for (const model of CLOUDFLARE_MODELS) {
      if (preferredCfModel && model === preferredCfModel) continue;
      try {
        const text = await streamCloudflareChat(messages, cfAccountId, cfApiToken, model, onDelta);
        return { text, modelUsed: `cf/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (lastCloudError) {
    throw lastCloudError;
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
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
      // Important: free native memory on load failures to prevent leaks.
      if (!isContextInUse() && llamaContext) {
        try {
          await llamaContext.release();
        } catch (releaseErr) {
          console.warn('[LLM] Failed to release native context after load error:', releaseErr);
        }
      }
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
  geminiKey?: string | undefined,
  geminiFallbackKey?: string | undefined,
  cfAccountId?: string | undefined,
  cfApiToken?: string | undefined,
  deepseekKey?: string | undefined,
  mulerouterKey?: string | undefined,
): Promise<{ text: string; modelUsed: string }> {
  const preferredGroqModel = chosenModel?.startsWith('groq/') ? chosenModel.replace('groq/', '') : undefined;
  const preferredGeminiModel = chosenModel?.startsWith('gemini/') ? chosenModel.replace('gemini/', '') : undefined;
  const preferredCfModel = chosenModel?.startsWith('cf/') ? chosenModel.replace('cf/', '') : undefined;
  const preferredDeepseekModel = chosenModel?.startsWith('deepseek/') ? chosenModel.replace('deepseek/', '') : undefined;
  const preferredMulerouterModel = chosenModel?.startsWith('mulerouter/') ? chosenModel.replace('mulerouter/', '') : undefined;
  const preferredOpenRouterModel =
    chosenModel && !preferredGroqModel && !preferredGeminiModel && !preferredCfModel && !preferredDeepseekModel && !preferredMulerouterModel && chosenModel !== 'local' && chosenModel !== 'auto'
      ? chosenModel
      : undefined;

  let lastCloudError: Error | null = null;

  // 1. Explicit UI Selections
  if (preferredOpenRouterModel && orKey) {
    try {
      const text = await callOpenRouter(messages, orKey, preferredOpenRouterModel);
      return { text, modelUsed: preferredOpenRouterModel };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGroqModel && groqKey) {
    try {
      const text = textMode
        ? await callGroq(messages, groqKey, preferredGroqModel, false)
        : await callGroq(messages, groqKey, preferredGroqModel);
      return { text, modelUsed: `groq/${preferredGroqModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGeminiModel && geminiKey) {
    try {
      const text = await geminiGenerateContentSdk(messages, geminiKey, preferredGeminiModel);
      return { text, modelUsed: `gemini/${preferredGeminiModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredCfModel && cfAccountId && cfApiToken) {
    try {
      const text = await callCloudflare(messages, cfAccountId, cfApiToken, preferredCfModel);
      return { text, modelUsed: `cf/${preferredCfModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredMulerouterModel && mulerouterKey) {
    try {
      const text = textMode
        ? await callMuleRouter(messages, mulerouterKey, preferredMulerouterModel, false)
        : await callMuleRouter(messages, mulerouterKey, preferredMulerouterModel);
      return { text, modelUsed: `mulerouter/${preferredMulerouterModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  // 2. Default Routing
  if (mulerouterKey) {
    for (const model of MULEROUTER_MODELS) {
      if (preferredMulerouterModel && model === preferredMulerouterModel) continue;
      try {
        const text = textMode
          ? await callMuleRouter(messages, mulerouterKey, model, false)
          : await callMuleRouter(messages, mulerouterKey, model);
        return { text, modelUsed: `mulerouter/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (deepseekKey) {
    for (const model of DEEPSEEK_MODELS) {
      if (preferredDeepseekModel && model === preferredDeepseekModel) continue;
      try {
        const text = textMode
          ? await callDeepSeek(messages, deepseekKey, model, false)
          : await callDeepSeek(messages, deepseekKey, model);
        return { text, modelUsed: `deepseek/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (groqKey) {
    for (const model of GROQ_MODELS) {
      if (preferredGroqModel && model === preferredGroqModel) continue;
      try {
        const text = textMode
          ? await callGroq(messages, groqKey, model, false)
          : await callGroq(messages, groqKey, model);
        return { text, modelUsed: `groq/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (geminiKey) {
    for (const model of GEMINI_MODELS) {
      if (preferredGeminiModel && model === preferredGeminiModel) continue;
      try {
        const text = await geminiGenerateContentSdk(messages, geminiKey, model);
        return { text, modelUsed: `gemini/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (geminiFallbackKey) {
    for (const model of GEMINI_MODELS) {
      if (preferredGeminiModel && model === preferredGeminiModel) continue;
      try {
        const text = await geminiGenerateContentSdk(messages, geminiFallbackKey, model);
        return { text, modelUsed: `gemini/${model} (fallback_key)` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (orKey) {
    for (const model of OPENROUTER_FREE_MODELS) {
      if (preferredOpenRouterModel && model === preferredOpenRouterModel) continue;
      try {
        const text = await callOpenRouter(messages, orKey, model);
        return { text, modelUsed: model };
      } catch (err) {
        lastCloudError = err as Error;
        continue;
      }
    }
  }

  if (cfAccountId && cfApiToken) {
    for (const model of CLOUDFLARE_MODELS) {
      if (preferredCfModel && model === preferredCfModel) continue;
      try {
        const text = await callCloudflare(messages, cfAccountId, cfApiToken, model);
        return { text, modelUsed: `cf/${model}` };
      } catch (err) {
        lastCloudError = err as Error;
        if (err instanceof RateLimitError) continue;
        continue;
      }
    }
  }

  if (lastCloudError) {
    throw lastCloudError;
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
}
