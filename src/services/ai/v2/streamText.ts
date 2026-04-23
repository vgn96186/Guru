/**
 * streamText — unified streaming API with agentic tool-calling loop.
 *
 * Contract:
 *   streamText({ model, messages, tools?, stopWhen? })
 *     → { textStream, fullStream, text, toolCalls, toolResults, finishReason, usage }
 *
 * The loop:
 *   1. Call model.doStream with messages + tools
 *   2. Relay text-delta parts to consumer
 *   3. If the step ends with tool-calls, execute each tool, append results to
 *      messages, loop again
 *   4. Stop when stopWhen() returns true OR finishReason is 'stop'
 */

import type {
  FinishReason,
  LanguageModelV2,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  ModelMessage,
  TextStreamPart,
  ToolCallPart,
  ToolResultPart,
} from './spec';
import { zodToJsonSchema, type ToolSet } from './tool';

export interface StreamTextOptions {
  model: LanguageModelV2;
  messages: ModelMessage[];
  system?: string;
  tools?: ToolSet;
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string };
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  /** Per-request context passed to tool.execute. */
  context?: Record<string, unknown>;
  /** Agentic loop stop condition. Default: stepCountIs(5). */
  stopWhen?: StopCondition;
  abortSignal?: AbortSignal;
  /** Called once per step when that step finishes (before next tool round). */
  onStepFinish?: (step: StepResult) => void | Promise<void>;
}

export interface StepResult {
  text: string;
  toolCalls: ToolCallPart[];
  toolResults: ToolResultPart[];
  finishReason: FinishReason;
  usage: LanguageModelV2Usage;
}

export interface StreamTextResult {
  /** Stream of text-delta strings only (the simple case). */
  textStream: AsyncIterable<string>;
  /** Rich stream: text-delta, tool-call, tool-result, step-finish, finish. */
  fullStream: AsyncIterable<TextStreamPart>;
  /** Resolves to the final aggregated assistant text across all steps. */
  text: Promise<string>;
  toolCalls: Promise<ToolCallPart[]>;
  toolResults: Promise<ToolResultPart[]>;
  finishReason: Promise<FinishReason>;
  usage: Promise<LanguageModelV2Usage>;
  /** Final ModelMessage[] including assistant + tool turns (useful for useChat). */
  responseMessages: Promise<ModelMessage[]>;
}

// ─── Stop conditions ─────────────────────────────────────────────────────────

export type StopCondition = (state: { steps: number; lastFinishReason: FinishReason }) => boolean;

export const stepCountIs =
  (n: number): StopCondition =>
  ({ steps }) =>
    steps >= n;

export const hasToolCall =
  (_toolName: string): StopCondition =>
  ({ lastFinishReason: _lastFinishReason }) => {
    // This is a simplified implementation - a full implementation would need
    // to track tool calls across steps. For now, this returns false to maintain
    // the existing behavior where stepCountIs is the primary stop condition.
    // A proper implementation would require passing tool call history to the state.
    return false;
  };

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Implementation notes:
 *   - We buffer the provider stream, fan it out to two consumers (textStream,
 *     fullStream) via a tiny broadcast queue.
 *   - Between steps (when finishReason === 'tool-calls'), we synchronously
 *     execute tools, append `{ role: 'tool', content: [...] }` to messages,
 *     and call model.doStream again.
 *   - stopWhen evaluated after each step.
 */
export function streamText(options: StreamTextOptions): StreamTextResult {
  const stopWhen = options.stopWhen ?? stepCountIs(5);

  // Normalize tools once.
  const toolDescriptions = options.tools
    ? Object.entries(options.tools).map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: zodToJsonSchema(def.inputSchema),
      }))
    : undefined;

  // Broadcast queue — fullStream is source of truth; textStream filters to deltas.
  const subscribers: Array<(p: TextStreamPart | { type: '__done__' }) => void> = [];
  const broadcast = (p: TextStreamPart | { type: '__done__' }) => {
    for (const s of subscribers) s(p);
  };

  const makeIterable = <T>(filter: (p: TextStreamPart) => T | undefined): AsyncIterable<T> => ({
    [Symbol.asyncIterator]() {
      const queue: T[] = [];
      let resolve: ((v: IteratorResult<T>) => void) | null = null;
      let done = false;

      subscribers.push((p) => {
        if (p.type === '__done__') {
          done = true;
          if (resolve) {
            resolve({ value: undefined as unknown as T, done: true });
            resolve = null;
          }
          return;
        }
        const mapped = filter(p);
        if (mapped === undefined) return;
        if (resolve) {
          resolve({ value: mapped, done: false });
          resolve = null;
        } else {
          queue.push(mapped);
        }
      });

      return {
        next(): Promise<IteratorResult<T>> {
          if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
          if (done) return Promise.resolve({ value: undefined as unknown as T, done: true });
          return new Promise((r) => (resolve = r));
        },
      };
    },
  });

  const fullStream = makeIterable<TextStreamPart>((p) => p);
  const textStream = makeIterable<string>((p) => (p.type === 'text-delta' ? p.text : undefined));

  // Promise resolvers for aggregated results.
  let resolveText!: (s: string) => void;
  let resolveToolCalls!: (v: ToolCallPart[]) => void;
  let resolveToolResults!: (v: ToolResultPart[]) => void;
  let resolveFinish!: (v: FinishReason) => void;
  let resolveUsage!: (v: LanguageModelV2Usage) => void;
  let resolveMessages!: (v: ModelMessage[]) => void;
  const text = new Promise<string>((r) => (resolveText = r));
  const toolCalls = new Promise<ToolCallPart[]>((r) => (resolveToolCalls = r));
  const toolResults = new Promise<ToolResultPart[]>((r) => (resolveToolResults = r));
  const finishReason = new Promise<FinishReason>((r) => (resolveFinish = r));
  const usage = new Promise<LanguageModelV2Usage>((r) => (resolveUsage = r));
  const responseMessages = new Promise<ModelMessage[]>((r) => (resolveMessages = r));

  // Run the agentic loop.
  void (async () => {
    const messages: ModelMessage[] = [...options.messages];
    if (options.system) {
      messages.unshift({ role: 'system', content: options.system });
    }
    const allToolCalls: ToolCallPart[] = [];
    const allToolResults: ToolResultPart[] = [];
    let aggregatedText = '';
    let lastFinish: FinishReason = 'stop';
    const aggregatedUsage: LanguageModelV2Usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const newResponseMessages: ModelMessage[] = [];

    try {
      for (let step = 0; ; step++) {
        const { stream } = await options.model.doStream({
          prompt: messages,
          tools: toolDescriptions,
          toolChoice: options.toolChoice,
          maxOutputTokens: options.maxOutputTokens,
          temperature: options.temperature,
          topP: options.topP,
          abortSignal: options.abortSignal,
        });

        let stepText = '';
        const stepToolCalls: ToolCallPart[] = [];
        let stepFinish: FinishReason = 'stop';
        let stepUsage: LanguageModelV2Usage = {};

        for await (const part of stream) {
          dispatchProviderPart(part, {
            onText: (delta) => {
              stepText += delta;
              aggregatedText += delta;
              broadcast({ type: 'text-delta', text: delta });
            },
            onReasoning: (delta) => {
              broadcast({ type: 'reasoning-delta', text: delta });
            },
            onToolCall: (tc) => {
              stepToolCalls.push(tc);
              allToolCalls.push(tc);
              broadcast({
                type: 'tool-call',
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              });
            },
            onFinish: (reason, u) => {
              stepFinish = reason;
              stepUsage = u;
              accumulateUsage(aggregatedUsage, u);
            },
            onError: (err) => {
              broadcast({ type: 'error', error: err });
            },
          });
        }

        lastFinish = stepFinish;

        // Persist this step's assistant message.
        const assistantContent: Array<{ type: 'text'; text: string } | ToolCallPart> = [];
        if (stepText) assistantContent.push({ type: 'text', text: stepText });
        for (const tc of stepToolCalls) assistantContent.push(tc);
        if (assistantContent.length) {
          newResponseMessages.push({ role: 'assistant', content: assistantContent });
          messages.push({ role: 'assistant', content: assistantContent });
        }

        // Execute tools if the model requested them.
        const stepToolResults: ToolResultPart[] = [];
        let requiresApproval = false;

        if (stepToolCalls.length && options.tools) {
          for (const call of stepToolCalls) {
            const toolDef = options.tools[call.toolName];
            if (!toolDef) {
              const err: ToolResultPart = {
                type: 'tool-result',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: { error: `Unknown tool: ${call.toolName}` },
                isError: true,
              };
              stepToolResults.push(err);
              broadcast(err);
              continue;
            }
            if (toolDef.needsApproval) {
              // Caller handles resumption — emit the call and stop.
              requiresApproval = true;
              continue;
            }
            try {
              const parsed = toolDef.inputSchema.parse(call.input);
              const output = await toolDef.execute(parsed, {
                toolCallId: call.toolCallId,
                abortSignal: options.abortSignal,
                context: options.context,
              });
              const result: ToolResultPart = {
                type: 'tool-result',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output,
              };
              stepToolResults.push(result);
              allToolResults.push(result);
              broadcast(result);
            } catch (err) {
              const errResult: ToolResultPart = {
                type: 'tool-result',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: { error: err instanceof Error ? err.message : String(err) },
                isError: true,
              };
              stepToolResults.push(errResult);
              allToolResults.push(errResult);
              broadcast(errResult);
            }
          }

          if (stepToolResults.length) {
            const toolMsg: ModelMessage = { role: 'tool', content: stepToolResults };
            newResponseMessages.push(toolMsg);
            messages.push(toolMsg);
          }
        }

        broadcast({ type: 'step-finish', finishReason: stepFinish, usage: stepUsage });
        await options.onStepFinish?.({
          text: stepText,
          toolCalls: stepToolCalls,
          toolResults: stepToolResults,
          finishReason: stepFinish,
          usage: stepUsage,
        });

        const finishedWithToolCalls: boolean = (stepFinish as FinishReason) === 'tool-calls';
        const shouldStop =
          !finishedWithToolCalls ||
          stopWhen({ steps: step + 1, lastFinishReason: stepFinish }) ||
          !stepToolCalls.length ||
          requiresApproval;
        if (shouldStop) break;
      }

      broadcast({ type: 'finish', finishReason: lastFinish, usage: aggregatedUsage });
    } catch (err) {
      broadcast({ type: 'error', error: err });
    } finally {
      broadcast({ type: '__done__' });
      resolveText(aggregatedText);
      resolveToolCalls(allToolCalls);
      resolveToolResults(allToolResults);
      resolveFinish(lastFinish);
      resolveUsage(aggregatedUsage);
      resolveMessages(newResponseMessages);
    }
  })();

  return {
    textStream,
    fullStream,
    text,
    toolCalls,
    toolResults,
    finishReason,
    usage,
    responseMessages,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dispatchProviderPart(
  part: LanguageModelV2StreamPart,
  handlers: {
    onText: (delta: string) => void;
    onReasoning?: (delta: string) => void;
    onToolCall: (tc: ToolCallPart) => void;
    onFinish: (reason: FinishReason, usage: LanguageModelV2Usage) => void;
    onError: (err: unknown) => void;
  },
): void {
  switch (part.type) {
    case 'text-delta':
      // Reasoning is routed via a special id prefix (see openaiChatCompletionsSse.ts).
      if (part.id.startsWith('reasoning-')) {
        handlers.onReasoning?.(part.delta);
      } else {
        handlers.onText(part.delta);
      }
      return;
    case 'tool-call':
      handlers.onToolCall({
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      });
      return;
    case 'finish':
      handlers.onFinish(part.finishReason, part.usage);
      return;
    case 'error':
      handlers.onError(part.error);
      return;
    default:
      return;
  }
}

function accumulateUsage(acc: LanguageModelV2Usage, next: LanguageModelV2Usage): void {
  acc.inputTokens = (acc.inputTokens ?? 0) + (next.inputTokens ?? 0);
  acc.outputTokens = (acc.outputTokens ?? 0) + (next.outputTokens ?? 0);
  acc.totalTokens = (acc.totalTokens ?? 0) + (next.totalTokens ?? 0);
}
