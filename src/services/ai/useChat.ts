/**
 * useChat — React hook for conversational UIs, powered by Vercel AI SDK.
 */

import { useCallback, useRef, useState } from 'react';
import { streamText, type ToolSet } from 'ai';
import type { 
  LanguageModelV2 as LanguageModel, 
  LanguageModelV2ToolCallPart as ToolCallPart, 
  LanguageModelV2ToolResultPart as ToolResultPart 
} from '@ai-sdk/provider';
import type { MedicalGroundingSource } from './types';
import { logGroundingEvent } from './runtimeDebug';
import type { GeneratedStudyImageRecord } from '../../db/queries/generatedStudyImages';

export type UIMessageRole = 'system' | 'user' | 'assistant';

export interface UIMessage {
  id: string;
  role: UIMessageRole;
  text: string;
  reasoning?: string;
  toolCalls?: ToolCallPart[];
  toolResults?: ToolResultPart[];
  createdAt: number;
  sources?: MedicalGroundingSource[];
  referenceImages?: MedicalGroundingSource[];
  images?: GeneratedStudyImageRecord[];
  modelUsed?: string;
  searchQuery?: string;
}

export type ChatStatus = 'idle' | 'streaming' | 'submitted' | 'error';

export interface UseChatOptions {
  model: LanguageModel;
  system?: string;
  tools?: ToolSet;
  initialMessages?: UIMessage[];
  onFinish?: (message: UIMessage) => void;
  onError?: (error: unknown) => void;
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
        createdAt: Date.now(),
        sources: (contextOverride?.sources ?? options.context?.sources) as MedicalGroundingSource[] | undefined,
        referenceImages: (contextOverride?.referenceImages ?? options.context?.referenceImages) as MedicalGroundingSource[] | undefined,
        searchQuery: (contextOverride?.searchQuery ?? options.context?.searchQuery) as string | undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const result = streamText({
          model: options.model,
          messages: history.map(m => ({
            role: m.role as any,
            content: m.text,
            // In a real migration we'd handle tool calls/results in history properly here
          })),
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
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const nextResults = [
                  ...(m.toolResults ?? []),
                  part as ToolResultPart,
                ];

                const nextMsg = { ...m, toolResults: nextResults };

                // Official integration: map specific tool outputs to UI properties
                if (part.toolName === 'search_medical' && part.output?.results) {
                  nextMsg.sources = [...(nextMsg.sources ?? []), ...part.output.results];
                } else if (part.toolName === 'search_reference_images' && part.output?.results) {
                  nextMsg.referenceImages = [...(nextMsg.referenceImages ?? []), ...part.output.results];
                } else if (part.toolName === 'generate_image' && part.output?.image) {
                  nextMsg.images = [...(nextMsg.images ?? []), part.output.image];
                }

                return nextMsg;
              }),
            );
            logGroundingEvent?.('tool_result_summary', {
              caller: 'useChat',
              toolName: part.toolName,
              isError: false,
            });
          }
        }

        setStatus('idle');
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
      const msgIndex = messages.findIndex((m) =>
        m.toolCalls?.some((tc) => tc.toolCallId === toolCallId),
      );
      if (msgIndex === -1) return;

      const msg = messages[msgIndex];
      const toolCall = msg.toolCalls?.find((tc) => tc.toolCallId === toolCallId);
      if (!toolCall) return;

      const updatedMsg = {
        ...msg,
        toolResults: [
          ...(msg.toolResults ?? []),
          {
            type: 'tool-result' as const,
            toolCallId,
            toolName: toolCall.toolName,
            output: result,
          } as ToolResultPart,
        ],
      } as UIMessage;

      const nextMessages = [...messages];
      nextMessages[msgIndex] = updatedMsg;
      setMessages(nextMessages);
      await runAssistantTurn(nextMessages);
    },
    [messages, runAssistantTurn],
  );

  return { messages, status, error, sendMessage, stop, regenerate, setMessages, addToolResult };
}

