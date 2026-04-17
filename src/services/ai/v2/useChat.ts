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
import type { MedicalGroundingSource } from '../types';
import type { GeneratedStudyImageRecord } from '../../../db/queries/generatedStudyImages';

export interface UIMessage {
  id: string;
  role: UIMessageRole;
  /** Rendered text (aggregated deltas for streaming assistant turns). */
  text: string;
  /** Rendered reasoning text (aggregated deltas for reasoning models). */
  reasoning?: string;
  /** Tool calls the assistant made in this turn (for UI affordances). */
  toolCalls?: ToolCallPart[];
  /** Tool results received after the call. */
  toolResults?: ToolResultPart[];
  createdAt: number;

  // Guru-specific extensions for grounding and UI
  sources?: MedicalGroundingSource[];
  referenceImages?: MedicalGroundingSource[];
  images?: GeneratedStudyImageRecord[];
  modelUsed?: string;
  searchQuery?: string;
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
  sendMessage: (text: string, contextOverride?: Record<string, unknown>) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  addToolResult: (toolCallId: string, result: unknown) => Promise<void>;
}

let idCounter = 0;
const genId = () => `msg_${Date.now()}_${++idCounter}`;

export function useChat(options: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runAssistantTurn = useCallback(
    async (history: UIMessage[], contextOverride?: Record<string, unknown>) => {
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
        sources: (contextOverride?.sources ?? options.context?.sources) as
          | MedicalGroundingSource[]
          | undefined,
        referenceImages: (contextOverride?.referenceImages ?? options.context?.referenceImages) as
          | MedicalGroundingSource[]
          | undefined,
        searchQuery: (contextOverride?.searchQuery ?? options.context?.searchQuery) as
          | string
          | undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const modelMessages: ModelMessage[] = history.flatMap((m) => {
        if (m.role === 'system') return [{ role: 'system', content: m.text }];
        if (m.role === 'user') return [{ role: 'user', content: m.text }];

        // Assistant message
        const assistantContent: Array<{ type: 'text'; text: string } | ToolCallPart> = [];
        if (m.text) assistantContent.push({ type: 'text', text: m.text });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) assistantContent.push(tc);
        }

        const msgs: ModelMessage[] = [];
        if (assistantContent.length > 0) {
          msgs.push({ role: 'assistant', content: assistantContent });
        } else if (!m.toolResults || m.toolResults.length === 0) {
          // Fallback for empty assistant message without tools
          msgs.push({ role: 'assistant', content: m.text });
        }

        if (m.toolResults && m.toolResults.length > 0) {
          msgs.push({ role: 'tool', content: m.toolResults });
        }

        return msgs;
      });

      try {
        const result = streamText({
          model: options.model,
          messages: modelMessages,
          system: options.system,
          tools: options.tools,
          context: contextOverride ?? options.context,
          abortSignal: ac.signal,
        });

        setStatus('streaming');
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + part.text } : m)),
            );
          } else if (part.type === 'reasoning-delta') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, reasoning: (m.reasoning || '') + part.text } : m,
              ),
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
        // We need to pass the updated message to onFinish, not the initial empty one
        setMessages((current) => {
          const finalMsg = current.find((m) => m.id === assistantId);
          if (finalMsg) options.onFinish?.(finalMsg);
          return current;
        });
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
    async (text: string, contextOverride?: Record<string, unknown>) => {
      const userMsg: UIMessage = {
        id: genId(),
        role: 'user',
        text,
        createdAt: Date.now(),
      };
      const next = [...messages, userMsg];
      setMessages(next);
      await runAssistantTurn(next, contextOverride);
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

  const addToolResult = useCallback(
    async (toolCallId: string, result: unknown) => {
      // Find the message with this tool call
      const msgIndex = messages.findIndex((m) =>
        m.toolCalls?.some((tc) => tc.toolCallId === toolCallId),
      );

      if (msgIndex === -1) return;

      const msg = messages[msgIndex];
      const toolCall = msg.toolCalls?.find((tc) => tc.toolCallId === toolCallId);

      if (!toolCall) return;

      // Add the result to the message
      const updatedMsg = {
        ...msg,
        toolResults: [
          ...(msg.toolResults ?? []),
          {
            type: 'tool-result' as const,
            toolCallId,
            toolName: toolCall.toolName,
            output: result,
          },
        ],
      };

      const nextMessages = [...messages];
      nextMessages[msgIndex] = updatedMsg;
      setMessages(nextMessages);

      // Resume the turn with the new tool result
      await runAssistantTurn(nextMessages);
    },
    [messages, runAssistantTurn],
  );

  return { messages, status, error, sendMessage, stop, regenerate, setMessages, addToolResult };
}
