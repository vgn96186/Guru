/**
 * tool() — Factory for defining agentic tools the model can call.
 *
 * Mirrors Vercel AI SDK's `tool()` helper: you define a name, description,
 * Zod schema for the input, and an execute function. streamText handles the
 * rest (schema normalization, calling the model, invoking execute, feeding
 * the result back).
 */

import type { z } from 'zod';
import { asSchema } from 'ai';

export interface ToolExecuteContext {
  toolCallId: string;
  abortSignal?: AbortSignal;
  context?: Record<string, unknown>;
}

export interface ToolDefinition<INPUT = unknown, OUTPUT = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<INPUT>;
  execute: (input: INPUT, ctx: ToolExecuteContext) => Promise<OUTPUT> | OUTPUT;
  needsApproval?: boolean;
}

export function tool<INPUT, OUTPUT>(
  def: ToolDefinition<INPUT, OUTPUT>,
): ToolDefinition<INPUT, OUTPUT> {
  return def;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export type ToolSet = Record<string, ToolDefinition<any, any>>;

function stripJsonSchemaDollarKeys(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(stripJsonSchemaDollarKeys);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === '$schema') continue;
    result[key] = stripJsonSchemaDollarKeys(value);
  }
  return result;
}

export function zodToJsonSchema(schema: z.ZodType<unknown>): unknown {
  try {
    const { jsonSchema } = asSchema(schema);
    return stripJsonSchemaDollarKeys(jsonSchema);
  } catch {
    return {};
  }
}
