/**
 * generateText — non-streaming wrapper over streamText.
 *
 * Convenience for callers that don't care about deltas. Internally we just
 * consume the full stream and resolve.
 */

import type { FinishReason, LanguageModelV2Usage, ModelMessage, ToolCallPart, ToolResultPart } from './spec';
import { streamText, type StreamTextOptions } from './streamText';

export interface GenerateTextOptions extends Omit<StreamTextOptions, 'onStepFinish'> {}

export interface GenerateTextResult {
  text: string;
  toolCalls: ToolCallPart[];
  toolResults: ToolResultPart[];
  finishReason: FinishReason;
  usage: LanguageModelV2Usage;
  responseMessages: ModelMessage[];
}

export async function generateText(
  options: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const result = streamText(options);
  // Drain the stream to completion — otherwise promises never resolve.
  for await (const _ of result.fullStream) {
    // discard
  }
  const [text, toolCalls, toolResults, finishReason, usage, responseMessages] = await Promise.all([
    result.text,
    result.toolCalls,
    result.toolResults,
    result.finishReason,
    result.usage,
    result.responseMessages,
  ]);
  return { text, toolCalls, toolResults, finishReason, usage, responseMessages };
}
