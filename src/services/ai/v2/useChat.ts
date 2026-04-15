/**
 * useChat — React hook for conversational UIs.
 *
 * Minimal version of Vercel AI SDK's `useChat`. Manages a list of UIMessages,
 * exposes `sendMessage()`, streams the assistant response via streamText, and
 * re-renders as deltas arrive.
 *
 * This is intentionally thin — app-specific concerns (persistence, sync,
 * medical grounding, Guru presence) belong in the caller, NOT here.
 */

import { useCallback, useRef, useState } from 'react';
import type { LanguageModelV2, ModelMessage, ToolCallPart, ToolResultPart } from './spec';
import { streamText } from './streamText';
import type { ToolSet } from './tool';

export type UIMessageRole = 'system' | 'user' | 'assistant';

/** UI-layer message — optimized for rendering, lossy about tool internals. */
export interface UIMessage {
  id: string;
  role: UIMessageRole;
  /** Rendered text (aggregated deltas for streaming assistant turns). */
  text: string;
  /** Tool calls the assistant made in this turn (for UI affordances). */
  toolCalls?: ToolCallPart[];
  /** Tool results received after the call. */
  toolResults?: ToolResultPart[];
  createdAt: number;
}

export type ChatStatus = 'idle' | 'streaming' | 'submitted' | 'error';

export interface UseChatOptions {
  model: LanguageModelV2;
  system?: string;
  tools?: ToolSet;
  initialMessages?: UIMessage[];
  onFinish?: (message: UIMessage) => void;
  onError?: (error: unknown) => void;
  /** Shared context passed to every tool call. */
  context?: Record<string, unknown>;
}

export interface UseChatReturn {
  messages: UIMessage[];
  status: ChatStatus;
  error: unknown;
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  setMessages: (messages: UIMessage[]) => void;
}

let idCounter = 0;
const genId = () => `msg_${Date.now()}_${++idCounter}`;

export function useChat(options: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runAssistantTurn = useCallback(
    async (history: UIMessage[]) => {
      setStatus('submitted');
      setError(null);
      const ac = new AbortController();
      abortRef.current = ac;

      const assistantId = genId();
      const assistantMsg: UIMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        toolCalls: [],
        toolResults: [],
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const modelMessages: ModelMessage[] = history.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.text,
      }));

      try {
        const result = streamText({
          model: options.model,
          messages: modelMessages,
          system: options.system,
          tools: options.tools,
          context: options.context,
          abortSignal: ac.signal,
        });

        setStatus('streaming');
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + part.text } : m)),
            );
          } else if (part.type === 'tool-call') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls ?? []),
                        {
                          type: 'tool-call',
                          toolCallId: part.toolCallId,
                          toolName: part.toolName,
                          input: part.input,
                        },
                      ],
                    }
                  : m,
              ),
            );
          } else if (part.type === 'tool-result') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolResults: [
                        ...(m.toolResults ?? []),
                        {
                          type: 'tool-result',
                          toolCallId: part.toolCallId,
                          toolName: part.toolName,
                          output: part.output,
                          isError: part.isError,
                        },
                      ],
                    }
                  : m,
              ),
            );
          } else if (part.type === 'error') {
            throw part.error;
          }
        }

        setStatus('idle');
        options.onFinish?.(assistantMsg);
      } catch (err) {
        setStatus('error');
        setError(err);
        options.onError?.(err);
      } finally {
        abortRef.current = null;
      }
    },
    [options],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: UIMessage = {
        id: genId(),
        role: 'user',
        text,
        createdAt: Date.now(),
      };
      const next = [...messages, userMsg];
      setMessages(next);
      await runAssistantTurn(next);
    },
    [messages, runAssistantTurn],
  );

  const regenerate = useCallback(async () => {
    // Drop last assistant, re-run from prior user message.
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    const sliceEnd = messages.length - lastUserIdx;
    const truncated = messages.slice(0, sliceEnd);
    setMessages(truncated);
    await runAssistantTurn(truncated);
  }, [messages, runAssistantTurn]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }, []);

  return { messages, status, error, sendMessage, stop, regenerate, setMessages };
}
