/**
 * useGuruChatSession — Thread management and session memory
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createGuruChatThread,
  deleteGuruChatThread,
  getGuruChatThreadById,
  getLatestGuruChatThread,
  getOrCreateLatestGuruChatThread,
  listGuruChatThreads,
  renameGuruChatThread,
  type GuruChatThread,
} from '../db/queries/aiCache';
import { getSessionMemoryRow } from '../db/queries/guruChatMemory';

export interface UseGuruChatSessionOptions {
  topicName: string;
  syllabusTopicId?: number;
  requestedThreadId?: number;
}

export interface UseGuruChatSessionReturn {
  currentThread: GuruChatThread | null;
  threads: GuruChatThread[];
  sessionSummary: string;
  sessionStateJson: string;
  isHydrating: boolean;
  // Legacy compatibility aliases
  isHydratingThread: boolean;
  isHydratingHistory: boolean;
  setCurrentThread: (thread: GuruChatThread | null) => void;
  refreshThreads: () => Promise<void>;
  createNewThread: () => Promise<GuruChatThread | null>;
  openThread: (thread: GuruChatThread) => Promise<void>;
  deleteThread: (thread: GuruChatThread) => Promise<void>;
  renameThread: (threadId: number, newTitle: string) => Promise<void>;
}

export function useGuruChatSession(
  options: UseGuruChatSessionOptions,
): UseGuruChatSessionReturn {
  const { topicName, syllabusTopicId, requestedThreadId } = options;

  const [currentThread, setCurrentThread] = useState<GuruChatThread | null>(null);
  const [threads, setThreads] = useState<GuruChatThread[]>([]);
  const [sessionSummary, setSessionSummary] = useState('');
  const [sessionStateJson, setSessionStateJson] = useState('{}');
  const [isHydrating, setIsHydrating] = useState(true);
  const hasPersistedTopicProgressRef = useRef(false);

  const currentThreadId = currentThread?.id ?? null;

  // Hydrate thread on mount or when params change
  useEffect(() => {
    let cancelled = false;
    setIsHydrating(true);

    const hydrateThread = async () => {
      try {
        const thread =
          requestedThreadId != null
            ? await getGuruChatThreadById(requestedThreadId)
            : await getLatestGuruChatThread(topicName, syllabusTopicId);

        const finalThread = thread ?? (await getOrCreateLatestGuruChatThread(topicName, syllabusTopicId));

        if (!cancelled) {
          setCurrentThread(finalThread);
        }
      } catch {
        if (!cancelled) {
          setCurrentThread(null);
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
          void refreshThreads();
        }
      }
    };

    void hydrateThread();
    return () => {
      cancelled = true;
    };
  }, [requestedThreadId, syllabusTopicId, topicName]);

  // Load session memory when thread changes
  useEffect(() => {
    if (!currentThreadId) {
      setSessionSummary('');
      setSessionStateJson('{}');
      return;
    }

    void getSessionMemoryRow(currentThreadId).then((row) => {
      setSessionSummary(row?.summaryText ?? '');
      setSessionStateJson(row?.stateJson ?? '{}');
    });
  }, [currentThreadId]);

  // Reset progress tracking when thread/topic changes
  useEffect(() => {
    hasPersistedTopicProgressRef.current = false;
  }, [currentThreadId, syllabusTopicId, topicName]);

  const refreshThreads = useCallback(async () => {
    try {
      const list = await listGuruChatThreads(60);
      setThreads(list);
    } catch {
      setThreads([]);
    }
  }, []);

  const createNewThread = useCallback(async (): Promise<GuruChatThread | null> => {
    try {
      const thread = await createGuruChatThread(topicName, syllabusTopicId);
      setCurrentThread(thread);
      setSessionSummary('');
      hasPersistedTopicProgressRef.current = false;
      await refreshThreads();
      return thread;
    } catch {
      return null;
    }
  }, [refreshThreads, syllabusTopicId, topicName]);

  const openThread = useCallback(
    async (thread: GuruChatThread) => {
      setCurrentThread(thread);
      setSessionSummary('');
      hasPersistedTopicProgressRef.current = false;
      // Load new session memory
      void getSessionMemoryRow(thread.id).then((row) => {
        setSessionSummary(row?.summaryText ?? '');
        setSessionStateJson(row?.stateJson ?? '{}');
      });
    },
    [],
  );

  const deleteThread = useCallback(
    async (thread: GuruChatThread) => {
      await deleteGuruChatThread(thread.id);
      if (thread.id === currentThreadId) {
        const fallback =
          (await getLatestGuruChatThread(topicName, syllabusTopicId)) ??
          (await createGuruChatThread(topicName, syllabusTopicId));
        setCurrentThread(fallback);
        setSessionSummary('');
      }
      await refreshThreads();
    },
    [currentThreadId, refreshThreads, syllabusTopicId, topicName],
  );

  const renameThread = useCallback(
    async (threadId: number, newTitle: string) => {
      const normalized = newTitle.trim();
      if (!normalized) return;
      await renameGuruChatThread(threadId, normalized);
      if (currentThreadId === threadId && currentThread) {
        setCurrentThread({ ...currentThread, title: normalized });
      }
      await refreshThreads();
    },
    [currentThread, currentThreadId, refreshThreads],
  );

  return {
    currentThread,
    threads,
    sessionSummary,
    sessionStateJson,
    isHydrating,
    // Legacy compatibility aliases
    isHydratingThread: isHydrating,
    isHydratingHistory: isHydrating,
    setCurrentThread,
    refreshThreads,
    createNewThread,
    openThread,
    deleteThread,
    renameThread,
  };
}
