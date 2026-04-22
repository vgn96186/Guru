/**
 * toolRunner — centralized, graceful invocation of v2 tools from service code.
 *
 * Services (contentGeneration, planning, catalyze, notifications, ...) should
 * NOT duplicate LLM wiring. They call `invokeTool(tool, input)` and get back
 * the validated output. If the tool throws, or the LLM path fails, the caller
 * supplies a `fallback` that preserves current behavior.
 *
 * This keeps one execution path per capability, so we don't have scattered
 * `generateObject({ schema })` calls across the codebase.
 */

import type { ToolDefinition, ToolExecuteContext } from './tool';

export interface InvokeToolOptions<INPUT, OUTPUT> {
  input: INPUT;
  /** Called when tool.execute throws OR the result fails schema validation. */
  fallback?: (err: unknown) => OUTPUT | Promise<OUTPUT>;
  /** Extra context passed to tool.execute (tool-calls context, signals, etc.) */
  ctx?: Partial<ToolExecuteContext>;
  /** Log tag for DEV-mode diagnostics. */
  tag?: string;
}

export async function invokeTool<INPUT, OUTPUT>(
  tool: ToolDefinition<INPUT, OUTPUT>,
  opts: InvokeToolOptions<INPUT, OUTPUT>,
): Promise<OUTPUT> {
  const ctx: ToolExecuteContext = {
    toolCallId: opts.ctx?.toolCallId ?? `direct-${tool.name}-${Date.now()}`,
    abortSignal: opts.ctx?.abortSignal,
    context: opts.ctx?.context,
  };
  try {
    // Validate input with tool's own schema so direct-calls share the guardrail.
    const parsed = tool.inputSchema.parse(opts.input);
    const out = await tool.execute(parsed, ctx);
    return out;
  } catch (err) {
    if (__DEV__) {
      console.warn(`[toolRunner] ${opts.tag ?? tool.name} failed — using fallback.`, err);
    }
    if (opts.fallback) return await opts.fallback(err);
    throw err;
  }
}

/**
 * Helper: guard an output's shape at runtime. Useful when tools return union
 * types and the caller needs to narrow without throwing on a mismatch.
 */
export function isToolErrorShape(o: unknown): o is { error: string } {
  return !!o && typeof o === 'object' && 'error' in (o as Record<string, unknown>);
}
