/**
 * useChat — React hook for conversational UIs, powered by Vercel AI SDK.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { streamText } from './v2/streamText';
import type {
  LanguageModelV2 as LanguageModel,
  ModelMessage,
  ToolCallPart,
  ToolResultPart,
} from './v2/spec';
import type { ToolSet } from './v2/tool';
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
  sendMessage: (
    text: string,
    options?: {
      contextOverride?: Record<string, unknown>;
      systemOverride?: string;
      assistantCreatedAt?: number;
    },
  ) => Promise<UIMessage | null>;
  stop: () => void;
  regenerate: () => Promise<UIMessage | null>;
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  addToolResult: (toolCallId: string, result: unknown) => Promise<void>;
}

let idCounter = 0;
const genId = () => `msg_${Date.now()}_${++idCounter}`;

function serializeToolHistory(message: UIMessage): string {
  const toolCalls = message.toolCalls?.length
    ? `\n\nTool calls:\n${message.toolCalls
        .map((call) => `- ${call.toolName}: ${JSON.stringify(call.input ?? {})}`)
        .join('\n')}`
    : '';
  const toolResults = message.toolResults?.length
    ? `\n\nTool results:\n${message.toolResults
        .map((result) => `- ${result.toolName}: ${JSON.stringify(result.output ?? {})}`)
        .join('\n')}`
    : '';
  return `${message.text}${toolCalls}${toolResults}`;
}

function toModelMessages(history: UIMessage[]): ModelMessage[] {
  return history.flatMap((message) => {
    if (message.role === 'system') return [{ role: 'system', content: message.text }];
    if (message.role === 'user') return [{ role: 'user', content: message.text }];

    const assistantContent: Array<{ type: 'text'; text: string } | ToolCallPart> = [];
    if (message.text) assistantContent.push({ type: 'text', text: message.text });
    if (message.toolCalls?.length) {
      for (const toolCall of message.toolCalls) assistantContent.push(toolCall);
    }

    const nextMessages: ModelMessage[] = [];
    if (assistantContent.length > 0) {
      nextMessages.push({ role: 'assistant', content: assistantContent });
    } else if (!message.toolResults?.length) {
      nextMessages.push({ role: 'assistant', content: serializeToolHistory(message) });
    }

    if (message.toolResults?.length) {
      nextMessages.push({ role: 'tool', content: message.toolResults });
    }

    return nextMessages;
  });
}

function getToolResultOutput(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== 'object') return null;
  return output as Record<string, unknown>;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<UIMessage[]>(options.initialMessages ?? []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const runAssistantTurn = useCallback(
    async (
      history: UIMessage[],
      optionsOverride?: {
        contextOverride?: Record<string, unknown>;
        systemOverride?: string;
        assistantCreatedAt?: number;
      },
    ): Promise<UIMessage | null> => {
      setStatus('submitted');
      setError(null);
      const ac = new AbortController();
      abortRef.current = ac;

      const assistantCreatedAt = optionsOverride?.assistantCreatedAt ?? Date.now();
      const assistantId = genId();
      const assistantMsg: UIMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        createdAt: assistantCreatedAt,
        sources: (optionsOverride?.contextOverride?.sources ?? options.context?.sources) as
          | MedicalGroundingSource[]
          | undefined,
        referenceImages: (optionsOverride?.contextOverride?.referenceImages ??
          options.context?.referenceImages) as MedicalGroundingSource[] | undefined,
        searchQuery: (optionsOverride?.contextOverride?.searchQuery ??
          options.context?.searchQuery) as string | undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const result = streamText({
          model: options.model,
          messages: toModelMessages(history),
          system: optionsOverride?.systemOverride ?? options.system,
          tools: options.tools,
          context: optionsOverride?.contextOverride ?? options.context,
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
                const nextResults = [...(m.toolResults ?? []), part as ToolResultPart];

                const nextMsg = { ...m, toolResults: nextResults };
                const output = getToolResultOutput(part.output);

                // Official integration: map specific tool outputs to UI properties
                if (part.toolName === 'search_medical' && Array.isArray(output?.results)) {
                  nextMsg.sources = [
                    ...(nextMsg.sources ?? []),
                    ...(output.results as MedicalGroundingSource[]),
                  ];
                } else if (
                  part.toolName === 'search_reference_images' &&
                  Array.isArray(output?.results)
                ) {
                  nextMsg.referenceImages = [
                    ...(nextMsg.referenceImages ?? []),
                    ...(output.results as MedicalGroundingSource[]),
                  ];
                } else if (part.toolName === 'generate_image' && output?.image) {
                  nextMsg.images = [
                    ...(nextMsg.images ?? []),
                    output.image as GeneratedStudyImageRecord,
                  ];
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
        const finalMessages = await new Promise<UIMessage[]>((resolve) => {
          setMessages((current) => {
            resolve(current);
            return current;
          });
        });
        const finalMsg = finalMessages.find((m) => m.id === assistantId) ?? null;
        if (finalMsg) options.onFinish?.(finalMsg);
        return finalMsg;
      } catch (err) {
        setStatus('error');
        setError(err);
        options.onError?.(err);
        return null;
      } finally {
        abortRef.current = null;
      }
    },
    [options],
  );

  const sendMessage = useCallback(
    async (
      text: string,
      optionsOverride?: {
        contextOverride?: Record<string, unknown>;
        systemOverride?: string;
        assistantCreatedAt?: number;
      },
    ) => {
      const userMsg: UIMessage = {
        id: genId(),
        role: 'user',
        text,
        createdAt: Date.now(),
      };
      const next = [...messagesRef.current, userMsg];
      messagesRef.current = next;
      setMessages(next);
      return runAssistantTurn(next, optionsOverride);
    },
    [runAssistantTurn],
  );

  const regenerate = useCallback(async () => {
    const currentMessages = messagesRef.current;
    const lastUserIdx = [...currentMessages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return null;
    const sliceEnd = currentMessages.length - lastUserIdx;
    const truncated = currentMessages.slice(0, sliceEnd);
    messagesRef.current = truncated;
    setMessages(truncated);
    return runAssistantTurn(truncated);
  }, [runAssistantTurn]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }, []);

  const addToolResult = useCallback(
    async (toolCallId: string, result: unknown) => {
      const currentMessages = messagesRef.current;
      const msgIndex = currentMessages.findIndex((m) =>
        m.toolCalls?.some((tc) => tc.toolCallId === toolCallId),
      );
      if (msgIndex === -1) return;

      const msg = currentMessages[msgIndex];
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

      const nextMessages = [...currentMessages];
      nextMessages[msgIndex] = updatedMsg;
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      await runAssistantTurn(nextMessages);
    },
    [runAssistantTurn],
  );

  return { messages, status, error, sendMessage, stop, regenerate, setMessages, addToolResult };
}
