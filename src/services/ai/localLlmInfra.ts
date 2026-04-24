/**
 * Local LLM infrastructure — warmup, context management, and on-device inference.
 *
 * Cloud AI routing lives exclusively in the v2 framework:
 *   createGuruFallbackModel() → createFallbackModel() in v2/providers/guruFallback.ts
 *   with centralized logging via createLoggingMiddleware() in v2/middleware.ts
 *
 * This module provides only local-LLM concerns:
 *   - Native context lifecycle (load, release, warmup, mutex)
 *   - Gemini Nano (AICore) status & download helpers
 *   - chatWithLocalNative (used by v2/providers/localLlm.ts)
 */

import { AppState } from 'react-native';
import * as LocalLlm from '../../../modules/local-llm';
import { WARMUP_DEBOUNCE_MS } from './constants';

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

// LiteRT-LM Conversation state corrupts after one generation on some devices
// (SIGSEGV in nativeSendMessage, "Failed to invoke the compiled model").
// Edge Gallery pattern: reset Conversation between one-shot calls, keep Engine warm.
async function releaseAfterGeneration(): Promise<void> {
  if (!localLlmLoaded) return;
  try {
    await LocalLlm.resetSession();
  } catch (err) {
    console.warn('[LLM] resetSession after generation failed:', err);
  }
}

/**
 * LiteRT on-device chat with optional OpenAPI tools (wired to native
 * `ConversationConfig.tools` + `automaticToolCalling = false`).
 * This is the primary interface used by v2/providers/localLlm.ts.
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
    await releaseAfterGeneration();
    release();
  }
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
