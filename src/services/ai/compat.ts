/**
 * Legacy Compatibility Layer.
 * 
 * Bridges old Guru-specific AI calls to the new Vercel-standard pipeline.
 * Use these only for gradual migration of legacy call sites.
 */

import { generateText, generateObject, streamText } from 'ai';
import { createGuruFallbackModel } from './providers/guruFallback';
import { profileRepository } from '../../db/repositories/profileRepository';

export async function generateTextV2(messages: any[], options?: any) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  return generateText({
    model,
    messages: messages as any,
    ...options,
  });
}

export async function generateJSONV2(messages: any[], schema: any, options?: any) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  return generateObject({
    model,
    schema,
    messages: messages as any,
    ...options,
  });
}

export async function chatWithGuruV2(messages: any[], options?: any) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  const result = await generateText({
    model,
    messages: messages as any,
    ...options,
  });
  return result.text;
}

export async function* chatWithGuruStreamV2(messages: any[], options?: any) {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  const result = streamText({
    model,
    messages: messages as any,
    ...options,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') yield part.text;
    else if (part.type === 'tool-call') {
      options?.onToolCall?.({ toolName: part.toolName, input: part.input });
    } else if (part.type === 'tool-result') {
      options?.onToolResult?.({ toolName: part.toolName, output: part.output });
    }
  }
}
