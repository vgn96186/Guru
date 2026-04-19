/**
 * useGuruChat — Vercel AI SDK wrapper for Guru Chat
 * Wraps useChat with Guru-specific context, persistence, and tools
 */

import { useCallback, useMemo } from 'react';
import { useChat, type UIMessage, type ChatStatus } from '../services/ai/useChat';
import type { LanguageModelV2 as LanguageModel } from '@ai-sdk/provider';
import { saveChatMessage } from '../db/queries/aiCache';
import { ChatMessage } from '../types/chat';
import { MedicalGroundingSource } from '../services/ai/types';
import { GeneratedStudyImageRecord } from '../db/queries/generatedStudyImages';
import { createGuruChatTools } from '../services/ai/chatTools';

export interface GuruChatContext {
  sessionSummary?: string;
  sessionStateJson?: string;
  profileNotes?: string;
  studyContext?: string;
  syllabusTopicId?: number;
  groundingTitle?: string;
  groundingContext?: string;
}

export interface UseGuruChatOptions {
  model: LanguageModel | null;
  threadId: number | null;
  topicName: string;
  initialMessages?: ChatMessage[];
  context?: GuruChatContext;
  onError?: (error: unknown) => void;
}

export interface UseGuruChatReturn {
  messages: ChatMessage[];
  status: ChatStatus;
  error: unknown;
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

function mapUIMessageToChatMessage(uiMsg: UIMessage): ChatMessage {
  return {
    id: uiMsg.id,
    role: uiMsg.role === 'user' ? 'user' : 'guru',
    text: uiMsg.text,
    sources: uiMsg.sources as MedicalGroundingSource[] | undefined,
    referenceImages: uiMsg.referenceImages as MedicalGroundingSource[] | undefined,
    images: uiMsg.images as GeneratedStudyImageRecord[] | undefined,
    modelUsed: uiMsg.modelUsed,
    searchQuery: uiMsg.searchQuery,
    timestamp: uiMsg.createdAt,
  };
}

function mapChatMessageToUIMessage(chatMsg: ChatMessage): UIMessage {
  return {
    id: chatMsg.id,
    role: chatMsg.role === 'user' ? 'user' : 'assistant',
    text: chatMsg.text,
    sources: chatMsg.sources,
    referenceImages: chatMsg.referenceImages,
    images: chatMsg.images,
    modelUsed: chatMsg.modelUsed,
    searchQuery: chatMsg.searchQuery,
    createdAt: chatMsg.timestamp,
  };
}

export function useGuruChat(options: UseGuruChatOptions): UseGuruChatReturn {
  const { model, threadId, topicName, initialMessages, context, onError } = options;

  // Build system prompt with Guru context
  const systemPrompt = useMemo(() => {
    const parts: string[] = [
      'You are Guru, a medical education AI assistant helping a student prepare for NEET-PG and INICET exams.',
    ];

    if (context?.profileNotes) {
      parts.push(`Student notes: ${context.profileNotes}`);
    }

    if (context?.sessionSummary) {
      parts.push(`Session summary: ${context.sessionSummary}`);
    }

    if (context?.studyContext) {
      parts.push(`Study context: ${context.studyContext}`);
    }

    if (context?.groundingTitle && context?.groundingContext) {
      parts.push(`Grounding topic: ${context.groundingTitle}\n${context.groundingContext}`);
    }

    parts.push(
      'Provide accurate medical information with citations when possible. Use the search_medical tool for factual queries.',
    );

    return parts.join('\n\n');
  }, [context]);

  // Convert initial messages to UIMessage format
  const uiInitialMessages = useMemo(() => {
    return initialMessages?.map(mapChatMessageToUIMessage);
  }, [initialMessages]);

  // Create tools with topic context
  const tools = useMemo(() => createGuruChatTools(topicName), [topicName]);

  // Use Vercel AI SDK's useChat (only when model is provided)
  const chatResult = useChat(
    model
      ? {
          model,
          system: systemPrompt,
          tools,
          initialMessages: uiInitialMessages,
          onError,
          onFinish: useCallback(
            async (finalMsg: UIMessage) => {
              // Persist to database
              if (threadId) {
                try {
                  await saveChatMessage(
                    threadId,
                    topicName,
                    finalMsg.role === 'user' ? 'user' : 'guru',
                    finalMsg.text,
                    finalMsg.createdAt,
                    finalMsg.sources && finalMsg.sources.length > 0
                      ? JSON.stringify(finalMsg.sources)
                      : undefined,
                    finalMsg.modelUsed ?? undefined,
                  );
                } catch {
                  // Persistence is non-blocking
                }
              }
            },
            [threadId, topicName],
          ),
        }
      : {
          // Dummy config when model is null (disabled state)
          model: null as any,
          system: '',
          initialMessages: [],
        },
  );

  // Destructure with defaults for disabled state
  const {
    messages: uiMessages = [],
    status = 'idle',
    error = null,
    sendMessage: sendUIMessage = async () => {},
    stop = () => {},
    regenerate = async () => {},
    setMessages: setUIMessages = () => {},
  } = chatResult;

  // Convert UIMessages back to ChatMessages
  const messages = useMemo(() => {
    return uiMessages.map(mapUIMessageToChatMessage);
  }, [uiMessages]);

  // Wrap sendMessage to match our interface
  const sendMessage = useCallback(
    async (text: string) => {
      await sendUIMessage(text);
    },
    [sendUIMessage],
  );

  // Wrap setMessages
  const setMessages = useCallback(
    (updater: React.SetStateAction<ChatMessage[]>) => {
      if (typeof updater === 'function') {
        setUIMessages((prev) => {
          const prevChat = prev.map(mapUIMessageToChatMessage);
          const nextChat = updater(prevChat);
          return nextChat.map(mapChatMessageToUIMessage);
        });
      } else {
        setUIMessages(updater.map(mapChatMessageToUIMessage));
      }
    },
    [setUIMessages],
  );

  return {
    messages,
    status,
    error,
    sendMessage,
    stop,
    regenerate,
    setMessages,
  };
}
