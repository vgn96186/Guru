/**
 * useGuruChat — Vercel AI SDK wrapper for Guru Chat
 * Wraps useChat with Guru-specific context, persistence, and tools
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChat, type UIMessage, type ChatStatus } from '../services/ai/useChat';
import type { LanguageModelV2 as LanguageModel } from '../services/ai/v2/spec';
import { ChatMessage } from '../types/chat';
import { MedicalGroundingSource } from '../services/ai/types';
import { GeneratedStudyImageRecord } from '../db/queries/generatedStudyImages';
import { createGuruChatTools } from '../services/ai/chatTools';
import { saveChatMessage } from '../db/queries/aiCache';
import { markTopicDiscussedInChat } from '../db/queries/topics';
import { getSessionMemoryRow } from '../db/queries/guruChatMemory';
import { maybeSummarizeGuruSession } from '../services/guruChatSessionSummary';

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
  syllabusTopicId?: number;
  initialMessages?: ChatMessage[];
  context?: GuruChatContext;
  onRefreshThreads?: () => Promise<void> | void;
  onSessionMemoryUpdated?: (payload: { summaryText: string; stateJson: string }) => void;
  finalizeAssistantMessage?: (
    message: ChatMessage,
  ) => Promise<Partial<ChatMessage> | void> | Partial<ChatMessage> | void;
  onError?: (error: unknown) => void;
}

export interface UseGuruChatReturn {
  messages: ChatMessage[];
  status: ChatStatus;
  error: unknown;
  sendMessage: (
    text: string,
    contextOverride?: Partial<GuruChatContext>,
  ) => Promise<ChatMessage | null>;
  stop: () => void;
  regenerate: () => Promise<ChatMessage | null>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

function buildSystemPrompt(context?: GuruChatContext): string {
  const parts: string[] = [
    'You are Guru, a medical education AI assistant helping a student prepare for NEET-PG and INICET exams.',
  ];

  if (context?.profileNotes) {
    parts.push(`Student notes: ${context.profileNotes}`);
  }

  if (context?.sessionSummary) {
    parts.push(`Session summary: ${context.sessionSummary}`);
  }

  if (context?.sessionStateJson) {
    parts.push(`Tutor state JSON: ${context.sessionStateJson}`);
  }

  if (context?.studyContext) {
    parts.push(`Study context: ${context.studyContext}`);
  }

  if (context?.syllabusTopicId != null) {
    parts.push(`Syllabus topic id: ${context.syllabusTopicId}`);
  }

  if (context?.groundingTitle && context?.groundingContext) {
    parts.push(`Grounding topic: ${context.groundingTitle}\n${context.groundingContext}`);
  }

  parts.push(
    'Provide accurate medical information with citations when possible. Use the search_medical tool for factual queries.',
  );

  return parts.join('\n\n');
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
  const {
    model,
    threadId,
    topicName = '',
    syllabusTopicId,
    initialMessages,
    context,
    onRefreshThreads,
    onSessionMemoryUpdated,
    finalizeAssistantMessage,
    onError,
  } = options ?? ({} as UseGuruChatOptions);
  const assistantTimestampRef = useRef<number>(Date.now());
  const hasPersistedTopicProgressRef = useRef(false);

  useEffect(() => {
    hasPersistedTopicProgressRef.current = false;
  }, [threadId, syllabusTopicId, topicName]);

  // Build system prompt with Guru context
  const systemPrompt = useMemo(() => buildSystemPrompt(context), [context]);

  // Convert initial messages to UIMessage format
  const uiInitialMessages = useMemo(() => {
    return initialMessages?.map(mapChatMessageToUIMessage);
  }, [initialMessages]);

  // Create tools with topic context
  const tools = useMemo(
    () => createGuruChatTools(topicName, () => assistantTimestampRef.current),
    [topicName],
  );

  // Use Vercel AI SDK's useChat (only when model is provided)
  const chatResult = useChat(
    model
      ? {
          model,
          system: systemPrompt,
          tools,
          initialMessages: uiInitialMessages,
          onError,
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
    sendMessage: sendUIMessage = async () => null,
    stop = () => {},
    regenerate = async () => null,
    setMessages: setUIMessages = () => {},
  } = chatResult;

  // Convert UIMessages back to ChatMessages
  const messages = useMemo(() => {
    return uiMessages.map(mapUIMessageToChatMessage);
  }, [uiMessages]);

  // Wrap sendMessage to match our interface
  const sendMessage = useCallback(
    async (text: string, contextOverride?: Partial<GuruChatContext>) => {
      const mergedContext = contextOverride ? { ...context, ...contextOverride } : context;
      const trimmedText = text.trim();
      if (!trimmedText) return null;

      if (threadId != null) {
        try {
          await saveChatMessage(threadId, topicName, 'user', trimmedText, Date.now());
          await onRefreshThreads?.();
        } catch {
          // Persistence should not block the main conversation flow.
        }
      }

      assistantTimestampRef.current = Date.now();
      const assistantMessage = await sendUIMessage(trimmedText, {
        contextOverride: mergedContext as Record<string, unknown> | undefined,
        systemOverride: buildSystemPrompt(mergedContext),
        assistantCreatedAt: assistantTimestampRef.current,
      });
      const mappedAssistantMessage = assistantMessage
        ? mapUIMessageToChatMessage(assistantMessage)
        : null;
      if (!mappedAssistantMessage) return null;

      const finalizedPatch = finalizeAssistantMessage
        ? await finalizeAssistantMessage(mappedAssistantMessage)
        : undefined;
      const finalMessage = finalizedPatch
        ? { ...mappedAssistantMessage, ...finalizedPatch }
        : mappedAssistantMessage;

      if (finalizedPatch && Object.keys(finalizedPatch).length > 0) {
        setUIMessages((prev) =>
          prev.map((entry) =>
            entry.id === finalMessage.id ? mapChatMessageToUIMessage(finalMessage) : entry,
          ),
        );
      }

      if (threadId != null) {
        try {
          await saveChatMessage(
            threadId,
            topicName,
            'guru',
            finalMessage.text,
            finalMessage.timestamp,
            finalMessage.sources && finalMessage.sources.length > 0
              ? JSON.stringify(finalMessage.sources)
              : undefined,
            finalMessage.modelUsed,
          );
          await onRefreshThreads?.();
        } catch {
          // Ignore persistence issues here too.
        }

        if (syllabusTopicId != null && !hasPersistedTopicProgressRef.current) {
          try {
            await markTopicDiscussedInChat(syllabusTopicId);
            hasPersistedTopicProgressRef.current = true;
          } catch {
            // Progress persistence should not block the conversation flow.
          }
        }

        try {
          await maybeSummarizeGuruSession(threadId, topicName);
          const row = await getSessionMemoryRow(threadId);
          onSessionMemoryUpdated?.({
            summaryText: row?.summaryText ?? '',
            stateJson: row?.stateJson ?? '{}',
          });
        } catch {
          /* session summary is optional */
        }
      }

      return finalMessage;
    },
    [
      context,
      finalizeAssistantMessage,
      onRefreshThreads,
      onSessionMemoryUpdated,
      sendUIMessage,
      setUIMessages,
      syllabusTopicId,
      threadId,
      topicName,
    ],
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
    regenerate: async () => {
      const finalMessage = await regenerate();
      return finalMessage ? mapUIMessageToChatMessage(finalMessage) : null;
    },
    setMessages,
  };
}
