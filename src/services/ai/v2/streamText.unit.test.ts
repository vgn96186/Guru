/**
 * Unit tests for streamText — the agentic loop is the most critical piece
 * to lock down because regressions are silent (tool results go unused, etc).
 */

import { z } from 'zod';
import { streamText, stepCountIs } from './streamText';
import { tool } from './tool';
import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
} from './spec';

function makeMockModel(
  scripts: LanguageModelV2StreamPart[][],
): LanguageModelV2 {
  let call = 0;
  return {
    specificationVersion: 'v2',
    provider: 'mock',
    modelId: 'mock-1',
    async doGenerate() {
      throw new Error('not used');
    },
    async doStream(): Promise<LanguageModelV2StreamResult> {
      const parts = scripts[call++] ?? [];
      async function* gen() {
        for (const p of parts) yield p;
      }
      return { stream: gen() };
    },
  };
}

describe('streamText', () => {
  it('streams plain text deltas and resolves aggregated text', async () => {
    const model = makeMockModel([
      [
        { type: 'text-delta', id: 'a', delta: 'hel' },
        { type: 'text-delta', id: 'a', delta: 'lo' },
        { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } },
      ],
    ]);
    const result = streamText({ model, messages: [{ role: 'user', content: 'hi' }] });
    const chunks: string[] = [];
    for await (const d of result.textStream) chunks.push(d);
    expect(chunks.join('')).toBe('hello');
    expect(await result.text).toBe('hello');
    expect(await result.finishReason).toBe('stop');
    const usage = await result.usage;
    expect(usage.inputTokens).toBe(1);
    expect(usage.outputTokens).toBe(2);
  });

  it('runs agentic tool-calling loop — call, execute, feed result, continue', async () => {
    const model = makeMockModel([
      // Step 1: model requests a tool.
      [
        { type: 'text-delta', id: 'a', delta: 'looking…' },
        {
          type: 'tool-call',
          toolCallId: 'tc1',
          toolName: 'add',
          input: { a: 2, b: 3 },
        },
        { type: 'finish', finishReason: 'tool-calls', usage: {} },
      ],
      // Step 2: model sees tool result and answers.
      [
        { type: 'text-delta', id: 'b', delta: 'The answer is 5.' },
        { type: 'finish', finishReason: 'stop', usage: {} },
      ],
    ]);

    const add = tool({
      name: 'add',
      description: 'Add two numbers',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => ({ sum: a + b }),
    });

    const result = streamText({
      model,
      messages: [{ role: 'user', content: '2+3' }],
      tools: { add },
      stopWhen: stepCountIs(5),
    });

    const allParts: string[] = [];
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') allParts.push(`t:${part.text}`);
      if (part.type === 'tool-call') allParts.push(`c:${part.toolName}`);
      if (part.type === 'tool-result') {
        allParts.push(`r:${part.toolName}:${JSON.stringify(part.output)}`);
      }
    }

    expect(allParts).toEqual([
      't:looking…',
      'c:add',
      'r:add:{"sum":5}',
      't:The answer is 5.',
    ]);
    expect(await result.text).toBe('looking…The answer is 5.');
    const toolCalls = await result.toolCalls;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolName).toBe('add');
    const toolResults = await result.toolResults;
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].output).toEqual({ sum: 5 });
  });

  it('stops after stepCountIs limit', async () => {
    // Model keeps requesting tools forever; cap at 2 steps.
    const step: LanguageModelV2StreamPart[] = [
      { type: 'tool-call', toolCallId: 'tc', toolName: 'noop', input: {} },
      { type: 'finish', finishReason: 'tool-calls', usage: {} },
    ];
    const model = makeMockModel([step, step, step, step]);
    const noop = tool({
      name: 'noop',
      description: 'does nothing',
      inputSchema: z.object({}),
      execute: () => ({ ok: true }),
    });
    const result = streamText({
      model,
      messages: [{ role: 'user', content: 'loop' }],
      tools: { noop },
      stopWhen: stepCountIs(2),
    });
    for await (const _ of result.fullStream) {
      // drain
    }
    expect((await result.toolCalls).length).toBe(2);
  });

  it('surfaces schema validation errors as tool-result with isError', async () => {
    const model = makeMockModel([
      [
        {
          type: 'tool-call',
          toolCallId: 'tc1',
          toolName: 'add',
          input: { a: 'not a number', b: 3 }, // invalid
        },
        { type: 'finish', finishReason: 'tool-calls', usage: {} },
      ],
      [{ type: 'finish', finishReason: 'stop', usage: {} }],
    ]);
    const add = tool({
      name: 'add',
      description: 'add',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => a + b,
    });
    const result = streamText({
      model,
      messages: [{ role: 'user', content: '?' }],
      tools: { add },
    });
    for await (const _ of result.fullStream) {
      // drain
    }
    const results = await result.toolResults;
    expect(results).toHaveLength(1);
    expect(results[0].isError).toBe(true);
  });
});
