import {
  requireNativeModule,
  NativeModule,
  EventEmitter,
  EventSubscription,
} from 'expo-modules-core';

/**
 * Backend used for the last successful load. "unknown" before any load.
 */
export type LocalLlmBackend = 'gpu' | 'cpu' | 'nano' | 'unknown';

export interface InitializeOptions {
  /** Absolute path to a `.litertlm` model file (Gemma 4 E2B / E4B). */
  modelPath: string;
  /** Max tokens the engine can generate per prompt. Default: 2048. */
  maxNumTokens?: number;
  /** Force a specific backend. Defaults to "auto" (GPU, fall back to CPU). */
  preferredBackend?: 'auto' | 'gpu' | 'cpu';
}

export interface GenerateOptions {
  modelPath?: string;
  systemInstruction?: string;
  temperature?: number;
  topK?: number;
  topP?: number;
  /** JSON array of `{ name, description, parameters }` for LiteRT OpenAPI tools. */
  toolsJson?: string;
}

export interface GenerateResult {
  text: string;
  backend: LocalLlmBackend;
  /** Present when LiteRT returned structured tool calls (JSON array). */
  toolCallsJson?: string | null;
  /** `"stop"` or `"tool_calls"` — mirrors agentic loop finish. */
  finishReason?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

// ── Gemini Nano (AICore) ────────────────────────────────────────────────

/** Status of Gemini Nano on this device. */
export type NanoStatus = 'AVAILABLE' | 'DOWNLOADABLE' | 'DOWNLOADING' | 'UNAVAILABLE' | 'ERROR';

export interface NanoStatusResult {
  status: NanoStatus;
  errorMessage?: string;
}

export interface NanoGenerateOptions {
  /** The text prompt to send to Gemini Nano. */
  prompt: string;
  /** Optional system instruction prepended to the prompt. */
  systemInstruction?: string;
  /** Sampling temperature (0.0–1.0). Default: 0.3. */
  temperature?: number;
  /** Top-K sampling. Default: 40. */
  topK?: number;
  /** Max output tokens (capped at 256 by AICore). Default: 256. */
  maxOutputTokens?: number;
}

export interface NanoGradeOptions {
  /** The question text. */
  question: string;
  /** The student's answer. */
  userAnswer: string;
  /** Optional correct answer for reference. */
  correctAnswer?: string;
}

interface LocalLlmNativeModule extends NativeModule {
  initialize(options: InitializeOptions): Promise<{ backend: LocalLlmBackend }>;
  isInitialized(): Promise<boolean>;
  getBackend(): Promise<LocalLlmBackend>;
  chat(messages: ChatMessage[], options: GenerateOptions): Promise<GenerateResult>;
  chatStream(messages: ChatMessage[], options: GenerateOptions): Promise<{ status: string }>;
  cancel(): Promise<void>;
  release(): Promise<void>;
  warmup(modelPath: string): Promise<{ backend: LocalLlmBackend; warmedUp: boolean }>;
  // Gemini Nano
  nanoCheckStatus(): Promise<NanoStatusResult>;
  nanoDownloadIfNeeded(): Promise<NanoStatusResult>;
  nanoWarmup(): Promise<boolean>;
  nanoGenerate(options: NanoGenerateOptions): Promise<GenerateResult>;
  nanoGradeAnswer(options: NanoGradeOptions): Promise<GenerateResult>;
}

const native = requireNativeModule<LocalLlmNativeModule>('LocalLlm');
const emitter = new EventEmitter<Record<string, any>>(native as any);

export function initialize(options: InitializeOptions) {
  return native.initialize(options);
}

export function isInitialized() {
  return native.isInitialized();
}

export function getBackend() {
  return native.getBackend();
}

export function chat(messages: ChatMessage[], options: GenerateOptions = {}) {
  return native.chat(messages, options);
}

export function chatStream(messages: ChatMessage[], options: GenerateOptions = {}) {
  return native.chatStream(messages, options);
}

export function addLlmTokenListener(
  listener: (event: { token: string }) => void,
): EventSubscription {
  return emitter.addListener('onLlmToken', listener);
}

export function addLlmCompleteListener(
  listener: (event: {
    text: string;
    backend: LocalLlmBackend;
    toolCallsJson?: string | null;
    finishReason?: string;
  }) => void,
): EventSubscription {
  return emitter.addListener('onLlmComplete', listener);
}

export function addLlmErrorListener(
  listener: (event: { error: string }) => void,
): EventSubscription {
  return emitter.addListener('onLlmError', listener);
}

export function cancel() {
  return native.cancel();
}

export function release() {
  return native.release();
}

// ── Gemini Nano (AICore) ────────────────────────────────────────────────

/** Check whether Gemini Nano is available on this device. */
export function nanoCheckStatus(): Promise<NanoStatusResult> {
  return native.nanoCheckStatus();
}

/** Download Gemini Nano if downloadable. Suspends until done. */
export function nanoDownloadIfNeeded(): Promise<NanoStatusResult> {
  return native.nanoDownloadIfNeeded();
}

/** Warm up Nano model for lower first-inference latency. */
export function nanoWarmup(): Promise<boolean> {
  return native.nanoWarmup();
}

/**
 * Warm up Gemma LiteRT model for lower first-inference latency.
 * Runs a dummy inference to pre-load weights and initialize KV cache.
 */
export function warmup(modelPath: string): Promise<{ backend: LocalLlmBackend; warmedUp: boolean }> {
  return native.warmup(modelPath);
}

/** Generate text using Gemini Nano (max ~256 output tokens). */
export function nanoGenerate(options: NanoGenerateOptions): Promise<GenerateResult> {
  return native.nanoGenerate(options);
}

/** Quick grading via Nano — optimized for short MCQ/short-answer feedback. */
export function nanoGradeAnswer(options: NanoGradeOptions): Promise<GenerateResult> {
  return native.nanoGradeAnswer(options);
}

export default {
  initialize,
  isInitialized,
  getBackend,
  chat,
  chatStream,
  addLlmTokenListener,
  addLlmCompleteListener,
  addLlmErrorListener,
  cancel,
  release,
  nanoCheckStatus,
  nanoDownloadIfNeeded,
  nanoWarmup,
  nanoGenerate,
  nanoGradeAnswer,
  warmup,
};
