/**
 * Vercel AI SDK Compatibility Layer
 * 
 * Provides Vercel AI SDK-compatible APIs on top of Guru's AI v2 framework.
 * This allows code written for Vercel AI SDK to work with Guru's multi-provider
 * system with minimal changes.
 */

import type { z } from 'zod';
import type { UserProfile } from '../../../types';
import type { LanguageModelV2, ModelMessage, TextPart, ImagePart, ToolCallPart, ToolResultPart, FinishReason as GuruFinishReason } from './spec';
import { createGuruFallbackModel } from './providers/guruFallback';
import { streamText as guruStreamText } from './streamText';
import { tool as guruTool, type ToolDefinition, type ToolSet } from './tool';

// ─────────────────────────────────────────────────────────────────────────────
// Vercel AI SDK Type Definitions (simplified)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vercel AI SDK compatible Message type.
 * Based on @ai-sdk/react types.
 */
export type CoreMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Optional tool call ID for tool messages */
  toolCallId?: string;
  /** Optional tool name for assistant messages with tool calls */
  name?: string;
  /** Experimental: parts for multimodal content */
  experimental_attachments?: Array<{
    name?: string;
    contentType: string;
    url: string;
  }>;
};

/**
 * Vercel AI SDK compatible tool definition.
 */
export interface CoreTool {
  description?: string;
  parameters: z.ZodType<unknown>;
  execute: (args: unknown) => Promise<unknown>;
}

/**
 * Vercel AI SDK compatible language model.
 */
export interface LanguageModel {
  doGenerate: (options: {
    prompt: CoreMessage[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    tools?: Array<{
      name: string;
      description?: string;
      parameters: unknown;
    }>;
    toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string };
    responseFormat?: { type: 'text' } | { type: 'json'; schema?: unknown };
    abortSignal?: AbortSignal;
  }) => Promise<{
    text: string;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      args: unknown;
    }>;
    finishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other';
    usage: { promptTokens: number; completionTokens: number };
  }>;

  doStream: (options: {
    prompt: CoreMessage[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    tools?: Array<{
      name: string;
      description?: string;
      parameters: unknown;
    }>;
    toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string };
    responseFormat?: { type: 'text' } | { type: 'json'; schema?: unknown };
    abortSignal?: AbortSignal;
  }) => Promise<{
    stream: AsyncIterable<{
      type: 'text-delta';
      textDelta: string;
    } | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: unknown;
    } | {
      type: 'finish';
      finishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other';
      usage: { promptTokens: number; completionTokens: number };
    }>;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map Guru's FinishReason to Vercel's finish reason.
 */
function mapFinishReason(reason: GuruFinishReason): 'stop' | 'length' | 'tool-calls' | 'error' | 'other' {
  switch (reason) {
    case 'stop':
    case 'length':
    case 'tool-calls':
    case 'error':
    case 'other':
      return reason;
    case 'content-filter':
      return 'other'; // Map content-filter to other
    default:
      return 'other';
  }
}

/**
 * Map Vercel's finish reason to Guru's FinishReason.
 */
function _mapToGuruFinishReason(reason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other'): GuruFinishReason {
  return reason;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert Vercel AI SDK CoreMessage to Guru ModelMessage.
 */
export function fromVercelMessage(msg: CoreMessage): ModelMessage {
  if (msg.role === 'system') {
    return { role: 'system', content: msg.content };
  }

  if (msg.role === 'user') {
    const parts: Array<TextPart | ImagePart> = [];
    
    // Handle text content
    if (msg.content) {
      parts.push({ type: 'text', text: msg.content });
    }
    
    // Handle attachments (simplified - convert to image parts if possible)
    if (msg.experimental_attachments?.length) {
      for (const attachment of msg.experimental_attachments) {
        if (attachment.contentType.startsWith('image/')) {
          // Note: Vercel uses URLs, Guru uses base64. This is a simplified conversion.
          // In a real implementation, you'd need to fetch and convert the image.
          parts.push({ 
            type: 'image', 
            mimeType: attachment.contentType, 
            base64Data: `data:${attachment.contentType};base64,PLACEHOLDER` 
          });
        }
      }
    }
    
    return { 
      role: 'user', 
      content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts 
    };
  }

  if (msg.role === 'assistant') {
    // Handle tool calls if present
    if (msg.name) {
      // This is a tool call response in Vercel format
      // Guru expects tool calls as ToolCallPart[]
      const toolCall: ToolCallPart = {
        type: 'tool-call',
        toolCallId: msg.toolCallId || `call_${Date.now()}`,
        toolName: msg.name,
        input: JSON.parse(msg.content || '{}'),
      };
      return { role: 'assistant', content: [toolCall] };
    }
    
    // Regular text response
    return { role: 'assistant', content: msg.content };
  }

  if (msg.role === 'tool') {
    const toolResult: ToolResultPart = {
      type: 'tool-result',
      toolCallId: msg.toolCallId || '',
      toolName: msg.name || 'unknown',
      output: JSON.parse(msg.content || '{}'),
    };
    return { role: 'tool', content: [toolResult] };
  }

  // Fallback (should never happen)
  return { role: 'user', content: msg.content };
}

/**
 * Convert Guru ModelMessage to Vercel AI SDK CoreMessage.
 */
export function toVercelMessage(msg: ModelMessage): CoreMessage {
  if (msg.role === 'system') {
    return { role: 'system', content: msg.content };
  }

  if (msg.role === 'user') {
    let content = '';
    const attachments: Array<{ name?: string; contentType: string; url: string }> = [];
    
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          content += part.text;
        } else if (part.type === 'image') {
          // Convert base64 to data URL
          attachments.push({
            contentType: part.mimeType,
            url: `data:${part.mimeType};base64,${part.base64Data}`,
          });
        }
      }
    }
    
    return {
      role: 'user',
      content,
      ...(attachments.length > 0 ? { experimental_attachments: attachments } : {}),
    };
  }

  if (msg.role === 'assistant') {
    if (typeof msg.content === 'string') {
      return { role: 'assistant', content: msg.content };
    } else if (Array.isArray(msg.content)) {
      // Handle tool calls
      const toolCall = msg.content.find((p): p is ToolCallPart => p.type === 'tool-call');
      if (toolCall) {
        return {
          role: 'assistant',
          content: JSON.stringify(toolCall.input),
          name: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
        };
      }
      
      // Fallback: concatenate text parts
      const textParts = msg.content.filter((p): p is TextPart => p.type === 'text');
      return { role: 'assistant', content: textParts.map(p => p.text).join('') };
    }
  }

  if (msg.role === 'tool') {
    const toolResult = msg.content[0] as ToolResultPart;
    return {
      role: 'tool',
      content: JSON.stringify(toolResult.output),
      name: toolResult.toolName,
      toolCallId: toolResult.toolCallId,
    };
  }

  // Fallback
  return { role: 'user', content: '' };
}

/**
 * Convert Vercel AI SDK tool definition to Guru tool definition.
 */
export function fromVercelTool(name: string, tool: CoreTool): ToolDefinition {
  return guruTool({
    name,
    description: tool.description || '',
    inputSchema: tool.parameters,
    execute: async (input, _ctx) => {
      return await tool.execute(input);
    },
  });
}

/**
 * Convert Guru tool definition to Vercel AI SDK tool format.
 */
export function toVercelTool<INPUT = unknown, OUTPUT = unknown>(tool: ToolDefinition<INPUT, OUTPUT>): CoreTool {
  return {
    description: tool.description,
    parameters: tool.inputSchema,
    execute: async (args: unknown) => {
      return await tool.execute(args as INPUT, { toolCallId: 'temp' });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vercel-style createModel factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vercel AI SDK-style createModel factory.
 * Creates a Guru LanguageModelV2 wrapped in a Vercel-compatible interface.
 */
export function createModel(options: {
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'custom';
  apiKey?: string;
  baseURL?: string;
  modelId?: string;
  profile?: UserProfile; // Guru-specific: use profile for multi-provider fallback
}): LanguageModel {
  // If profile is provided, use Guru's multi-provider fallback
  // Otherwise, create a simple provider-specific model
  let guruModel: LanguageModelV2;
  
  if (options.profile) {
    guruModel = createGuruFallbackModel({ profile: options.profile });
  } else {
    // For simplicity, we'll create a basic OpenAI-compatible model
    // In a full implementation, you'd map provider to the appropriate Guru provider
    throw new Error('Direct provider creation not yet implemented. Use profile-based fallback.');
  }

  return {
    async doGenerate(vercelOptions) {
      const prompt = vercelOptions.prompt.map(fromVercelMessage);
      
      const result = await guruModel.doGenerate({
        prompt,
        maxOutputTokens: vercelOptions.maxTokens,
        temperature: vercelOptions.temperature,
        topP: vercelOptions.topP,
        stopSequences: vercelOptions.stopSequences,
        tools: vercelOptions.tools?.map(t => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.parameters,
        })),
        toolChoice: vercelOptions.toolChoice,
        responseFormat: vercelOptions.responseFormat?.type === 'json' 
          ? { type: 'json', schema: vercelOptions.responseFormat.schema }
          : undefined,
        abortSignal: vercelOptions.abortSignal,
      });

      // Convert result to Vercel format
      const text = result.content
        .filter((p): p is TextPart => p.type === 'text')
        .map(p => p.text)
        .join('');

      const toolCalls = result.content
        .filter((p): p is ToolCallPart => p.type === 'tool-call')
        .map(p => ({
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          args: p.input,
        }));

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: mapFinishReason(result.finishReason),
        usage: {
          promptTokens: result.usage.inputTokens || 0,
          completionTokens: result.usage.outputTokens || 0,
        },
      };
    },

    async doStream(vercelOptions) {
      const prompt = vercelOptions.prompt.map(fromVercelMessage);
      
      const result = await guruModel.doStream({
        prompt,
        maxOutputTokens: vercelOptions.maxTokens,
        temperature: vercelOptions.temperature,
        topP: vercelOptions.topP,
        stopSequences: vercelOptions.stopSequences,
        tools: vercelOptions.tools?.map(t => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.parameters,
        })),
        toolChoice: vercelOptions.toolChoice,
        responseFormat: vercelOptions.responseFormat?.type === 'json' 
          ? { type: 'json', schema: vercelOptions.responseFormat.schema }
          : undefined,
        abortSignal: vercelOptions.abortSignal,
      });

      // Convert Guru stream parts to Vercel format
      const stream = (async function* () {
        for await (const part of result.stream) {
          if (part.type === 'text-delta') {
            yield { type: 'text-delta' as const, textDelta: part.delta };
          } else if (part.type === 'tool-call') {
            yield { 
              type: 'tool-call' as const, 
              toolCallId: part.toolCallId, 
              toolName: part.toolName, 
              args: part.input 
            };
          } else if (part.type === 'finish') {
            yield {
              type: 'finish' as const,
              finishReason: mapFinishReason(part.finishReason),
              usage: {
                promptTokens: part.usage.inputTokens || 0,
                completionTokens: part.usage.outputTokens || 0
              }
            };
          }
        }
      })();

      return { stream };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vercel-style streamText wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vercel AI SDK-style streamText API.
 * Simplified wrapper around Guru's streamText for easier migration.
 */
export async function* streamText(options: {
  model: LanguageModel;
  messages: CoreMessage[];
  system?: string;
  tools?: Record<string, CoreTool>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  abortSignal?: AbortSignal;
}) {
  // Convert to Guru format
  const guruMessages = options.messages.map(fromVercelMessage);
  const guruTools: ToolSet = {};
  
  if (options.tools) {
    for (const [name, tool] of Object.entries(options.tools)) {
      guruTools[name] = fromVercelTool(name, tool);
    }
  }

  // Get the underlying Guru model
  // Note: This assumes the LanguageModel was created with createModel above
  const guruModel = (options.model as { _guruModel?: LanguageModelV2 })._guruModel;
  
  if (!guruModel) {
    throw new Error('Model must be created with createModel from this compatibility layer');
  }

  const result = guruStreamText({
    model: guruModel,
    messages: guruMessages,
    system: options.system,
    tools: guruTools,
    maxOutputTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
    abortSignal: options.abortSignal,
  });

  // Yield text deltas
  for await (const chunk of result.textStream) {
    yield { type: 'text-delta', textDelta: chunk };
  }

  // Yield final result
  const _text = await result.text;
  const _toolCalls = await result.toolCalls;
  const finishReason = await result.finishReason;
  const usage = await result.usage;

  yield {
    type: 'finish',
    finishReason: mapFinishReason(finishReason),
    usage: {
      promptTokens: usage.inputTokens || 0,
      completionTokens: usage.outputTokens || 0
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export compatibility utilities
// ─────────────────────────────────────────────────────────────────────────────

export const experimental_ObjectStream = {
  fromReadableStream: () => {
    throw new Error('Not implemented in compatibility layer');
  },
};

export const tool = guruTool;

// Re-export from leaf modules (not `./index`) to avoid a require cycle with `index.ts`.
export { generateText } from './generateText';
export { generateObject } from './generateObject';
export { streamObject } from './streamObject';