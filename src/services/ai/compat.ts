/**
 * Legacy Compatibility Layer.
 *
 * Bridges old Guru-specific AI calls to the new Vercel-standard pipeline.
 * Use these only for gradual migration of legacy call sites.
 */

import { generateText, generateObject, streamText } from 'ai';
import { type CoreMessage, fromVercelMessage } from './v2/vercelCompat';
import { createGuruFallbackModel } from './v2/providers/guruFallback';
import { profileRepository } from '../../db/repositories/profileRepository';
import type { LanguageModel } from '@ai-sdk/provider';

export async function generateTextV2(messages: CoreMessage[], options?: Record<string, unknown>) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile }) as unknown as LanguageModel;
  return generateText({
    model,
    messages: messages.map(fromVercelMessage) as any,
    ...options,
  });
}

export async function generateJSONV2(
  messages: CoreMessage[],
  schema: unknown,
  options?: Record<string, unknown>,
) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile }) as unknown as LanguageModel;
  return generateObject({
    model,
    schema: schema as any,
    messages: messages.map(fromVercelMessage) as any,
    ...options,
  });
}

export async function chatWithGuruV2(messages: CoreMessage[], options?: Record<string, unknown>) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile }) as unknown as LanguageModel;
  const result = await generateText({
    model,
    messages: messages.map(fromVercelMessage) as any,
    ...options,
  });
  return result.text;
}

export async function* chatWithGuruStreamV2(
  messages: CoreMessage[],
  options?: Record<string, unknown> & {
    onToolCall?: (info: any) => void;
    onToolResult?: (info: any) => void;
  },
) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile }) as unknown as LanguageModel;
  const result = streamText({
    model,
    messages: messages.map(fromVercelMessage) as any,
    ...options,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') yield part.text;
    else if (part.type === 'tool-call') {
      options?.onToolCall?.({
        toolName: part.toolName,
        input: (part as any).args ?? (part as any).input,
      });
    } else if (part.type === 'tool-result') {
      options?.onToolResult?.({
        toolName: part.toolName,
        output: (part as any).result ?? (part as any).output,
      });
    }
  }
}
