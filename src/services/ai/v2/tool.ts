/**
 * tool() — Factory for defining agentic tools the model can call.
 *
 * Mirrors Vercel AI SDK's `tool()` helper: you define a name, description,
 * Zod schema for the input, and an execute function. streamText handles the
 * rest (schema normalization, calling the model, invoking execute, feeding
 * the result back).
 */

import type { z } from 'zod';

export interface ToolExecuteContext {
  toolCallId: string;
  abortSignal?: AbortSignal;
  /** Per-request shared state (e.g. userId, dbHandle). Pass via streamText options. */
  context?: Record<string, unknown>;
}

export interface ToolDefinition<INPUT = unknown, OUTPUT = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<INPUT>;
  execute: (input: INPUT, ctx: ToolExecuteContext) => Promise<OUTPUT> | OUTPUT;
  /** If true, streamText emits `tool-call` but does NOT execute — caller must resume via resumeToolCall(). */
  needsApproval?: boolean;
}

export function tool<INPUT, OUTPUT>(
  def: ToolDefinition<INPUT, OUTPUT>,
): ToolDefinition<INPUT, OUTPUT> {
  return def;
}

/** Record of tools keyed by name — what streamText consumes. */
export type ToolSet = Record<string, ToolDefinition<any, any>>;

/**
 * Convert a Zod schema to JSON Schema. Minimal hand-rolled implementation —
 * covers the shapes we use (object/string/number/boolean/array/enum/optional).
 *
 * For complex schemas, callers should pass JSON Schema directly or install
 * `zod-to-json-schema`. This avoids the dependency for the common path.
 */
export function zodToJsonSchema(schema: z.ZodType<unknown>): unknown {
  const def: any = (schema as any)._def;
  const typeName: string = def?.typeName;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(def.type) };
    case 'ZodOptional':
    case 'ZodNullable':
      return zodToJsonSchema(def.innerType);
    case 'ZodDefault':
      return zodToJsonSchema(def.innerType);
    case 'ZodObject': {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, sub] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(sub as z.ZodType<unknown>);
        const subDef: any = (sub as any)._def;
        if (subDef?.typeName !== 'ZodOptional' && subDef?.typeName !== 'ZodDefault') {
          required.push(key);
        }
      }
      return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      };
    }
    default:
      // Fallback: permissive
      return {};
  }
}
