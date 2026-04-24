/**
 * Guru AI SDK v2 — Core Specification
 *
 * Inspired by Vercel AI SDK's `LanguageModelV2`. A provider is anything that
 * implements `LanguageModelV2`. Everything else (streamText, generateText,
 * generateObject, useChat, tool calling) is built on top.
 *
 * Keep this file TYPE-ONLY. No runtime code.
 */

import type { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Messages (wire format passed into models)
// ─────────────────────────────────────────────────────────────────────────────

export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image'; mimeType: string; base64Data: string };
export type ToolCallPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
};
export type ToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
};

export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | Array<TextPart | ImagePart> }
  | {
      role: 'assistant';
      content: string | Array<TextPart | ToolCallPart>;
    }
  | { role: 'tool'; content: ToolResultPart[] };

// ─────────────────────────────────────────────────────────────────────────────
// Tool definition (model-facing)
// ─────────────────────────────────────────────────────────────────────────────

/** Description a model sees — just schema, no execute. */
export interface ToolDescription {
  name: string;
  description: string;
  /** JSON Schema OR Zod schema. streamText normalizes to JSON Schema before calling the model. */
  inputSchema: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// LanguageModelV2 — THE contract every provider must implement
// ─────────────────────────────────────────────────────────────────────────────

export interface LanguageModelV2CallOptions {
  prompt: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  /** JSON Schema (already normalized) of tools the model may call. */
  tools?: ToolDescription[];
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string };
  /** Force structured output to conform to this JSON Schema. */
  responseFormat?: { type: 'json'; schema?: unknown };
  abortSignal?: AbortSignal;
  /** Escape hatch for provider-specific fields. */
  providerOptions?: Record<string, unknown>;
}

export type FinishReason = 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other';

export interface LanguageModelV2Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Non-streaming result. */
export interface LanguageModelV2GenerateResult {
  content: Array<TextPart | ToolCallPart>;
  finishReason: FinishReason;
  usage: LanguageModelV2Usage;
  rawResponse?: unknown;
}

/**
 * Stream part union. This is the wire protocol between providers and streamText.
 * UI layers should NOT consume these directly — they consume the richer
 * `TextStreamPart` produced by streamText (which adds tool-result parts etc).
 */
export type LanguageModelV2StreamPart =
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | { type: 'tool-input-start'; id: string; toolName: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end'; id: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: 'finish';
      finishReason: FinishReason;
      usage: LanguageModelV2Usage;
    }
  | { type: 'error'; error: unknown };

export interface LanguageModelV2StreamResult {
  stream: AsyncIterable<LanguageModelV2StreamPart>;
  rawResponse?: unknown;
}

export interface LanguageModelV2 {
  readonly specificationVersion: 'v2';
  readonly provider: string;
  readonly modelId: string;
  /** Optional URL patterns this model supports (for grounding). Maps provider names to RegExp patterns or a promise for them. */
  readonly supportedUrls?: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>>;
  doGenerate(options: LanguageModelV2CallOptions): Promise<LanguageModelV2GenerateResult>;
  doStream(options: LanguageModelV2CallOptions): Promise<LanguageModelV2StreamResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Higher-level stream parts (what streamText yields to UI)
// ─────────────────────────────────────────────────────────────────────────────

export type TextStreamPart =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: unknown;
      isError?: boolean;
    }
  | { type: 'step-finish'; finishReason: FinishReason; usage: LanguageModelV2Usage }
  | { type: 'finish'; finishReason: FinishReason; usage: LanguageModelV2Usage }
  | { type: 'error'; error: unknown };

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema helper type
// ─────────────────────────────────────────────────────────────────────────────

export type ZodLike<T> = z.ZodType<T>;
