import {
  requireNativeModule,
  NativeModule,
  EventEmitter,
  EventSubscription,
} from 'expo-modules-core';

/**
 * Backend used for the last successful load. "unknown" before any load.
 */
export type LocalLlmBackend = 'gpu' | 'cpu' | 'unknown';

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
}

export interface GenerateResult {
  text: string;
  backend: LocalLlmBackend;
}

export interface ChatMessage {
  role: string;
  content: string;
}

interface LocalLlmNativeModule extends NativeModule {
  initialize(options: InitializeOptions): Promise<{ backend: LocalLlmBackend }>;
  isInitialized(): Promise<boolean>;
  getBackend(): Promise<LocalLlmBackend>;
  chat(messages: ChatMessage[], options: GenerateOptions): Promise<GenerateResult>;
  chatStream(messages: ChatMessage[], options: GenerateOptions): Promise<{ status: string }>;
  cancel(): Promise<void>;
  release(): Promise<void>;
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
  listener: (event: { text: string; backend: LocalLlmBackend }) => void,
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
};
