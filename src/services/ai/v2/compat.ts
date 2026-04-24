/**
 * Compat layer — drop-in replacements for the old `generate.ts` / `chat.ts`
 * public functions, backed by the v2 framework.
 *
 * Lets callers migrate incrementally: swap the import, keep the call site.
 * Each function here mirrors the signature of its legacy counterpart.
 *
 * Once all callers have migrated, the legacy implementations in
 * `localLlmInfra.ts` keeps local LLM concerns; `generate.ts` is a thin re-export layer.
 */

import type { z } from 'zod';
import type { ProviderId } from '../../../types';
import type { Message } from '../types';
import { profileRepository } from '../../../db/repositories/profileRepository';
import type { ModelMessage } from './spec';
import { generateText } from './generateText';
import { generateObject } from './generateObject';
import { streamText } from './streamText';
import { createGuruFallbackModel } from './providers/guruFallback';
import type { ToolSet } from './tool';

// ─── Drop-in for generateTextWithRouting ────────────────────────────────────

export async function generateTextV2(
  messages: Message[],
  options?: {
    chosenModel?: string;
    providerOrderOverride?: ProviderId[];
    tools?: ToolSet;
  },
): Promise<{ text: string; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({
    profile,
    chosenModel: options?.chosenModel,
    forceOrder: options?.providerOrderOverride,
  });
  const result = await generateText({
    model,
    messages: toModelMessages(messages),
    tools: options?.tools,
  });
  return { text: result.text, modelUsed: `${model.provider}/${model.modelId}` };
}

// ─── Drop-in for generateTextWithRoutingStream ──────────────────────────────

export async function generateTextStreamV2(
  messages: Message[],
  onDelta: (delta: string) => void,
  options?: {
    chosenModel?: string;
    providerOrderOverride?: ProviderId[];
    tools?: ToolSet;
  },
): Promise<{ text: string; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({
    profile,
    chosenModel: options?.chosenModel,
    forceOrder: options?.providerOrderOverride,
  });
  const result = streamText({
    model,
    messages: toModelMessages(messages),
    tools: options?.tools,
  });
  for await (const delta of result.textStream) {
    onDelta(delta);
  }
  const text = await result.text;
  return { text, modelUsed: `${model.provider}/${model.modelId}` };
}

// ─── Drop-in for generateJSONWithRouting ────────────────────────────────────

export async function generateJSONV2<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  options?: {
    chosenModel?: string;
    providerOrderOverride?: ProviderId[];
  },
): Promise<{ object: T; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({
    profile,
    chosenModel: options?.chosenModel,
    forceOrder: options?.providerOrderOverride,
  });
  const result = await generateObject({
    model,
    messages: toModelMessages(messages),
    schema,
  });
  return { object: result.object, modelUsed: `${model.provider}/${model.modelId}` };
}

// ─── Drop-in for chatWithGuru (simple, no grounding) ────────────────────────

export async function chatWithGuruV2(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  options?: {
    systemPrompt?: string;
    studyContext?: string;
    chosenModel?: string;
    providerOrderOverride?: ProviderId[];
    tools?: ToolSet;
  },
): Promise<{ reply: string; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({
    profile,
    chosenModel: options?.chosenModel,
    forceOrder: options?.providerOrderOverride,
  });

  const messages: ModelMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  const ctx = `Topic: ${topicName}${
    options?.studyContext ? `\n\nStudy context:\n${options.studyContext}` : ''
  }`;
  messages.push({ role: 'system', content: ctx });
  for (const h of history.slice(-8)) {
    messages.push({
      role: h.role === 'guru' ? 'assistant' : 'user',
      content: h.text,
    });
  }
  messages.push({ role: 'user', content: question });

  const result = await generateText({ model, messages, tools: options?.tools });
  return { reply: result.text, modelUsed: `${model.provider}/${model.modelId}` };
}

// ─── Streaming chat — the main win (real deltas, including local) ───────────

export async function chatWithGuruStreamV2(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  onDelta: (delta: string) => void,
  options?: {
    systemPrompt?: string;
    studyContext?: string;
    chosenModel?: string;
    providerOrderOverride?: ProviderId[];
    tools?: ToolSet;
    onToolCall?: (call: { toolName: string; input: unknown }) => void;
    onToolResult?: (result: { toolName: string; output: unknown }) => void;
  },
): Promise<{ reply: string; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({
    profile,
    chosenModel: options?.chosenModel,
    forceOrder: options?.providerOrderOverride,
  });

  const messages: ModelMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  const ctx = `Topic: ${topicName}${
    options?.studyContext ? `\n\nStudy context:\n${options.studyContext}` : ''
  }`;
  messages.push({ role: 'system', content: ctx });
  for (const h of history.slice(-8)) {
    messages.push({
      role: h.role === 'guru' ? 'assistant' : 'user',
      content: h.text,
    });
  }
  messages.push({ role: 'user', content: question });

  const result = streamText({
    model,
    messages,
    tools: options?.tools,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') onDelta(part.text);
    else if (part.type === 'tool-call') {
      options?.onToolCall?.({ toolName: part.toolName, input: part.input });
    } else if (part.type === 'tool-result') {
      options?.onToolResult?.({ toolName: part.toolName, output: part.output });
    }
  }

  const reply = await result.text;
  return { reply, modelUsed: `${model.provider}/${model.modelId}` };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === 'system') return { role: 'system', content: m.content };
    if (m.role === 'user') return { role: 'user', content: m.content };
    return { role: 'assistant', content: m.content };
  });
}
