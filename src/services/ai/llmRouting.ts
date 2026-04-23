/**
 * Local LLM infrastructure — warmup, context management, and on-device inference.
 *
 * Cloud AI routing has been fully migrated to the v2 framework:
 *   createGuruFallbackModel() → createFallbackModel() in v2/providers/guruFallback.ts
 *   with centralized logging via createLoggingMiddleware() in v2/middleware.ts
 *
 * This module retains only local-LLM concerns:
 *   - Native context lifecycle (load, release, warmup, mutex)
 *   - Gemini Nano (AICore) helpers
 *   - chatWithLocalNative (used by v2/providers/localLlm.ts)
 *   - Legacy attemptLocalLLM / attemptLocalLLMStream (still called from some services)
 *   - clampMessagesForStructuredJsonRouting
 */

import { AppState } from 'react-native';
import * as LocalLlm from '../../../modules/local-llm';
import { WARMUP_DEBOUNCE_MS } from './constants';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import { clampMessagesToCharBudget } from './providers/utils';

let localLlmLoaded = false;
let currentLlamaPath: string | null = null;
let llamaContextPromise: Promise<void> | null = null;
type AppStateSubscription = { remove?: () => void };
const APPSTATE_SUB_KEY = '__guru_llmRouting_appState_sub_v1';

// Track last model path for warmup on foreground (survives context release)
let lastModelPathForWarmup: string | null = null;
let lastWarmupTimestamp = 0;

/**
 * Clear warmup state when model path changes.
 * Call this when user changes local model in Settings.
 */
export function clearWarmupState(): void {
  lastModelPathForWarmup = null;
  lastWarmupTimestamp = 0;
}

// Track warmup completion for bootstrap integration
export function isLocalLlmWarmedUp(): boolean {
  return lastWarmupTimestamp > 0 && Date.now() - lastWarmupTimestamp < WARMUP_DEBOUNCE_MS;
}

/** Trigger warmup if local model is configured. Call after bootstrap completes. */
export async function warmupLocalModelOnBootstrap(modelPath: string | null): Promise<void> {
  if (!modelPath) return;
  try {
    const cleanPath = modelPath.replace(/^file:\/\//, '');
    await LocalLlm.warmup(cleanPath);
    lastModelPathForWarmup = cleanPath;
    lastWarmupTimestamp = Date.now();
    console.log('[LLM] Model warmed up on bootstrap');
  } catch (e) {
    console.warn('[LLM] Bootstrap warmup failed:', e);
  }
}

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

async function ensureLocalLlmLoaded(modelPath: string): Promise<void> {
  if (!modelPath?.trim()) {
    throw new Error('[LLM] ensureLocalLlmLoaded called with empty modelPath — skipping');
  }
  const cleanPath = modelPath.replace(/^file:\/\//, '');
  if (localLlmLoaded && currentLlamaPath === cleanPath) return;
  // Mutex: if another caller is already initializing, await the same promise
  if (llamaContextPromise) {
    await llamaContextPromise;
    if (localLlmLoaded && currentLlamaPath === cleanPath) return;
  }
  llamaContextPromise = (async () => {
    if (localLlmLoaded) {
      await LocalLlm.release();
      localLlmLoaded = false;
    }
    await LocalLlm.initialize({ 
      modelPath: cleanPath, 
      maxNumTokens: 4096,
      preferredBackend: 'gpu',
    });
    localLlmLoaded = true;
    currentLlamaPath = cleanPath;
    lastModelPathForWarmup = cleanPath;
  })();
  try {
    await llamaContextPromise;
  } finally {
    llamaContextPromise = null;
  }
}

/** Release the native LLM context to free memory. Safe to call at any time. */
export async function releaseLlamaContext(): Promise<void> {
  if (isContextInUse() || llamaContextPromise) return; // don't interrupt in-flight generation or init
  if (localLlmLoaded) {
    try {
      await LocalLlm.release();
    } catch (err) {
      console.warn('[LLM] Failed to release native context:', err);
    }
    localLlmLoaded = false;
    // Keep lastModelPathForWarmup - needed for warmup on foreground
    currentLlamaPath = null;
  }
}

// Release the 200 MB+ LLM context when app goes to background to prevent OOM kills.
// Store the subscription on `globalThis` so hot reload can't stack listeners.
const prevSub = (globalThis as Record<string, unknown>)[APPSTATE_SUB_KEY] as
  | AppStateSubscription
  | undefined;
if (prevSub?.remove) prevSub.remove();
(globalThis as Record<string, unknown>)[APPSTATE_SUB_KEY] = AppState.addEventListener(
  'change',
  async (state) => {
    if (state === 'background' || state === 'inactive') {
      await releaseLlamaContext();
    } else if (state === 'active' && lastModelPathForWarmup) {
      // Warm up model on foreground return for faster first inference
      // Debounce: don't warm up more than once every 30 seconds
      const now = Date.now();
      if (now - lastWarmupTimestamp < WARMUP_DEBOUNCE_MS) {
        return;
      }
      lastWarmupTimestamp = now;
      try {
        const cleanPath = lastModelPathForWarmup.replace(/^file:\/\//, '');
        await LocalLlm.warmup(cleanPath);
        console.log('[LLM] Model warmed up on foreground');
      } catch (e) {
        console.warn('[LLM] Warmup on foreground failed:', e);
      }
    }
  },
) as AppStateSubscription;

async function callLocalLLM(
  messages: Message[],
  modelPath: string,
  _textMode = false,
): Promise<string> {
  await ensureLocalLlmLoaded(modelPath);
  const release = await acquireContextLock();
  try {
    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMessages: LocalLlm.ChatMessage[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));
    const result = await LocalLlm.chat(chatMessages, {
      modelPath,
      systemInstruction: systemMsg?.content,
      temperature: 0.7,
      topP: 0.9,
    });
    return result.text;
  } finally {
    release();
  }
}

/**
 * LiteRT on-device chat with optional OpenAPI tools (wired to native
 * `ConversationConfig.tools` + `automaticToolCalling = false`).
 * Uses the same mutex as {@link callLocalLLM}.
 */
export async function chatWithLocalNative(options: {
  chatMessages: LocalLlm.ChatMessage[];
  modelPath: string;
  systemInstruction?: string;
  toolsJson?: string;
}): Promise<{
  text: string;
  toolCallsJson: string | null;
  finishReason: string;
  backend: LocalLlm.LocalLlmBackend;
}> {
  const cleanPath = options.modelPath.replace(/^file:\/\//, '');
  await ensureLocalLlmLoaded(cleanPath);
  const release = await acquireContextLock();
  try {
    const result = await LocalLlm.chat(options.chatMessages, {
      modelPath: cleanPath,
      systemInstruction: options.systemInstruction,
      temperature: 0.7,
      topP: 0.9,
      toolsJson: options.toolsJson,
    });
    return {
      text: result.text ?? '',
      toolCallsJson: result.toolCallsJson ?? null,
      finishReason: result.finishReason ?? 'stop',
      backend: result.backend,
    };
  } finally {
    release();
  }
}

/**
 * Single ceiling for {@link generateJSONWithRouting} before any cloud/local structured call.
 * Avoids ~hundreds-of-kB prompts that exhaust Groq, Copilot (even after per-provider clamps), and GitLab.
 */
const STRUCTURED_JSON_ROUTING_CHAR_BUDGET = 56_000;

export function clampMessagesForStructuredJsonRouting(messages: Message[]): Message[] {
  return clampMessagesToCharBudget(
    messages,
    STRUCTURED_JSON_ROUTING_CHAR_BUDGET,
    'Structured JSON routing',
  );
}

/** Check whether Gemini Nano (AICore) is available on this device. */
export async function isNanoAvailable(): Promise<boolean> {
  try {
    const { status } = await LocalLlm.nanoCheckStatus();
    return status === 'AVAILABLE';
  } catch {
    return false;
  }
}

/** Download Gemini Nano if needed, then warm it up. Returns final status. */
export async function ensureNanoReady(): Promise<LocalLlm.NanoStatusResult> {
  try {
    const downloadResult = await LocalLlm.nanoDownloadIfNeeded();
    if (downloadResult.status === 'AVAILABLE') {
      await LocalLlm.nanoWarmup();
    }
    return downloadResult;
  } catch (err) {
    return { status: 'ERROR', errorMessage: (err as Error)?.message };
  }
}

/**
 * Attempt generation via Gemini Nano (AICore).
 * No model file or API key needed — runs on-device via system service.
 * Best for short tasks: quiz grading, confidence checks, quick summaries.
 * Max output ~256 tokens, max input ~4000 tokens.
 */
export async function attemptNanoLLM(
  messages: Message[],
  options?: { temperature?: number; maxOutputTokens?: number },
): Promise<{ text: string; modelUsed: string }> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const userMsgs = messages.filter((m) => m.role !== 'system');
  const prompt = userMsgs.map((m) => m.content).join('\n');

  const result = await LocalLlm.nanoGenerate({
    prompt,
    systemInstruction: systemMsg?.content,
    temperature: options?.temperature ?? 0.3,
    topK: 40,
    maxOutputTokens: options?.maxOutputTokens ?? 256,
  });

  if (!result.text?.trim()) {
    throw new Error('Gemini Nano returned empty response');
  }
  return { text: result.text, modelUsed: 'nano/gemini-nano' };
}

/** Quick MCQ/short-answer grading via Gemini Nano. */
export async function attemptNanoGrade(
  question: string,
  userAnswer: string,
  correctAnswer?: string,
): Promise<{ text: string; modelUsed: string }> {
  const result = await LocalLlm.nanoGradeAnswer({ question, userAnswer, correctAnswer });
  if (!result.text?.trim()) {
    throw new Error('Gemini Nano grading returned empty response');
  }
  return { text: result.text, modelUsed: 'nano/gemini-nano' };
}

export async function attemptLocalLLM(
  messages: Message[],
  localModelPath: string,
  textMode: boolean,
): Promise<{ text: string; modelUsed: string }> {
  const isQwen = localModelPath.toLowerCase().includes('qwen');
  const isMedGemma = localModelPath.toLowerCase().includes('medgemma');
  const isE2b = localModelPath.toLowerCase().includes('e2b');
  const isE4b = localModelPath.toLowerCase().includes('e4b');
  const isGemma = localModelPath.toLowerCase().includes('gemma');
  const cleanPath = localModelPath.replace(/^file:\/\//, '');
  const modelUsed = isMedGemma
    ? 'local-medgemma-4b'
    : isQwen
      ? 'local-qwen-2.5-3b'
      : isE2b
        ? 'local-gemma-4-e2b'
        : isE4b
          ? 'local-gemma-4-e4b'
          : isGemma
            ? 'local-gemma'
            : 'local-llama-3.2-1b';
  try {
    const text = await callLocalLLM(messages, cleanPath, textMode);
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
      if (!isContextInUse() && localLlmLoaded) {
        try {
          await LocalLlm.release();
        } catch (releaseErr) {
          console.warn('[LLM] Failed to release native context after load error:', releaseErr);
        }
      }
      localLlmLoaded = false;
      currentLlamaPath = null;
      clearWarmupState(); // Clear warmup state when model is invalid
      llamaContextPromise = null;
      profileRepository
        .updateProfile({ localModelPath: null, useLocalModel: false })
        .catch(() => {});
      throw new Error(
        'Local model file is missing or corrupt — it will re-download on next startup.',
        { cause: err },
      );
    }
    throw err;
  }
}

export async function attemptLocalLLMStream(
  messages: Message[],
  localModelPath: string,
  _textMode: boolean,
  onDelta: (delta: string) => void,
): Promise<void> {
  const cleanPath = localModelPath.replace(/^file:\/\//, '');
  await ensureLocalLlmLoaded(cleanPath);
  const release = await acquireContextLock();
  return new Promise<void>((resolve, reject) => {
    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMessages: LocalLlm.ChatMessage[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const tokenSub = LocalLlm.addLlmTokenListener(({ token }) => {
      onDelta(token);
    });
    const completeSub = LocalLlm.addLlmCompleteListener(() => {
      tokenSub.remove();
      completeSub.remove();
      errorSub.remove();
      release();
      resolve();
    });
    const errorSub = LocalLlm.addLlmErrorListener(({ error }) => {
      tokenSub.remove();
      completeSub.remove();
      errorSub.remove();
      release();
      reject(new Error(error));
    });

    LocalLlm.chatStream(chatMessages, {
      modelPath: cleanPath,
      systemInstruction: systemMsg?.content,
      temperature: 0.7,
      topP: 0.9,
      toolsJson: undefined,
    }).catch((err: unknown) => {
      tokenSub.remove();
      completeSub.remove();
      errorSub.remove();
      release();
      reject(err);
    });
  });
}
