import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { splitSessionStorage } from './splitSessionStorage';
import type { Agenda, AgendaItem, AIContent, ContentType, SessionState } from '../types';
import { assertTransition } from '../services/sessionStateMachine';
import * as Haptics from 'expo-haptics';
import { sendImmediateNag } from '../services/notificationService';

interface QuizResult {
  topicId: number;
  correct: number;
  total: number;
}

interface SessionStoreState {
  sessionId: number | null;
  sessionState: SessionState;
  agenda: Agenda | null;
  currentItemIndex: number;
  currentContentIndex: number;
  maxUnlockedContentIndex: number;
  contentCacheBySlot: Record<string, AIContent>;
  currentContent: AIContent | null;
  isLoadingContent: boolean;
  completedTopicIds: number[];
  quizResults: QuizResult[];
  startedAt: number | null;
  activeStudyDuration: number;
  elapsedSeconds: number;
  // Break state
  isOnBreak: boolean;
  breakCountdown: number;
  // Actions
  setSessionId: (id: number) => void;
  setSessionState: (state: SessionState) => void;
  setAgenda: (agenda: Agenda) => void;
  setCurrentContent: (content: AIContent | null) => void;
  setLoadingContent: (loading: boolean) => void;
  jumpToContent: (index: number) => void;
  // Pausing
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  nextContent: () => void;
  nextTopic: () => void;
  markTopicComplete: () => void;
  nextTopicNoBreak: () => void;
  addQuizResult: (result: QuizResult) => void;
  startBreak: (seconds: number) => void;
  endBreak: () => void;
  tickBreak: () => void;
  downgradeSession: () => void;
  incrementActiveStudyDuration: (amount: number) => void;
  incrementElapsedSeconds: () => void;
  setElapsedSeconds: (seconds: number) => void;
  resetSession: () => void;
}

function getContentSlotKey(topicId: number, contentIndex: number): string {
  return `${topicId}:${contentIndex}`;
}

export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      sessionState: 'planning',
      agenda: null,
      currentItemIndex: 0,
      currentContentIndex: 0,
      maxUnlockedContentIndex: 0,
      contentCacheBySlot: {},
      currentContent: null,
      isLoadingContent: false,
      completedTopicIds: [],
      quizResults: [],
      startedAt: null,
      isOnBreak: false,
      breakCountdown: 300,
      isPaused: false,
      activeStudyDuration: 0,
      elapsedSeconds: 0,

      setSessionId: (id) => set({ sessionId: id, startedAt: Date.now() }),
      setSessionState: (state) => {
        const current = get().sessionState;
        if (state !== current) {
          assertTransition(current, state);
        }
        set({ sessionState: state });
      },
      setAgenda: (agenda) => set({ agenda }),
      setCurrentContent: (content) => {
        const { agenda, currentItemIndex, currentContentIndex, contentCacheBySlot } = get();
        const item =
          agenda && currentItemIndex < agenda.items.length ? agenda.items[currentItemIndex] : null;
        if (!item || !content) {
          set({ currentContent: content });
          return;
        }
        const slotKey = getContentSlotKey(item.topic.id, currentContentIndex);
        set({
          currentContent: content,
          contentCacheBySlot: {
            ...contentCacheBySlot,
            [slotKey]: content,
          },
        });
      },
      setLoadingContent: (loading) => set({ isLoadingContent: loading }),
      jumpToContent: (index) => {
        const { agenda, currentItemIndex, maxUnlockedContentIndex, contentCacheBySlot } = get();
        if (!agenda || currentItemIndex >= agenda.items.length) return;
        const item = agenda.items[currentItemIndex];
        if (index < 0 || index >= item.contentTypes.length) return;
        if (index > maxUnlockedContentIndex) return;
        const slotKey = getContentSlotKey(item.topic.id, index);
        set({
          currentContentIndex: index,
          currentContent: contentCacheBySlot[slotKey] ?? null,
        });
      },
      setPaused: (paused) => set({ isPaused: paused }),

      nextContent: () => {
        const { agenda, currentItemIndex, currentContentIndex } = get();
        if (!agenda || currentItemIndex >= agenda.items.length) return;
        const item = agenda.items[currentItemIndex];
        if (currentContentIndex < item.contentTypes.length - 1) {
          const nextIndex = currentContentIndex + 1;
          set({
            currentContentIndex: nextIndex,
            maxUnlockedContentIndex: Math.max(get().maxUnlockedContentIndex, nextIndex),
            currentContent: null,
          });
        }
        // If last content type, caller should call nextTopic
      },

      nextTopic: () => {
        const { agenda, currentItemIndex, completedTopicIds } = get();
        if (!agenda || currentItemIndex >= agenda.items.length) return;
        const currentTopic = agenda.items[currentItemIndex];
        const newCompleted =
          currentTopic && !completedTopicIds.includes(currentTopic.topic.id)
            ? [...completedTopicIds, currentTopic.topic.id]
            : completedTopicIds;

        if (currentItemIndex < agenda.items.length - 1) {
          set({
            currentItemIndex: currentItemIndex + 1,
            currentContentIndex: 0,
            maxUnlockedContentIndex: 0,
            currentContent: null,
            completedTopicIds: newCompleted,
            sessionState: 'topic_done',
          });
        } else {
          set({
            completedTopicIds: newCompleted,
            sessionState: 'session_done',
          });
        }
      },

      markTopicComplete: () => {
        const { agenda, currentItemIndex, completedTopicIds } = get();
        if (!agenda || currentItemIndex >= agenda.items.length) return;
        const topic = agenda.items[currentItemIndex]?.topic;
        if (topic && !completedTopicIds.includes(topic.id)) {
          set({ completedTopicIds: [...completedTopicIds, topic.id] });
        }
      },

      nextTopicNoBreak: () => {
        const { agenda, currentItemIndex, completedTopicIds } = get();
        if (!agenda || currentItemIndex >= agenda.items.length) return;
        const currentTopic = agenda.items[currentItemIndex];
        const newCompleted =
          currentTopic && !completedTopicIds.includes(currentTopic.topic.id)
            ? [...completedTopicIds, currentTopic.topic.id]
            : completedTopicIds;
        if (currentItemIndex < agenda.items.length - 1) {
          set({
            currentItemIndex: currentItemIndex + 1,
            currentContentIndex: 0,
            maxUnlockedContentIndex: 0,
            currentContent: null,
            completedTopicIds: newCompleted,
            sessionState: 'studying',
          });
        } else {
          set({ completedTopicIds: newCompleted, sessionState: 'session_done' });
        }
      },

      addQuizResult: (result) => {
        const { quizResults } = get();
        const existing = quizResults.find((r) => r.topicId === result.topicId);
        if (existing) {
          set({ quizResults: quizResults.map((r) => (r.topicId === result.topicId ? result : r)) });
        } else {
          set({ quizResults: [...quizResults, result] });
        }
      },

      startBreak: (seconds) => set({ isOnBreak: true, breakCountdown: seconds }),
      endBreak: () => set({ isOnBreak: false, breakCountdown: 0 }),
      tickBreak: () => {
        const { breakCountdown } = get();
        if (breakCountdown <= 1) {
          set({ isOnBreak: false, breakCountdown: 0 });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          void sendImmediateNag('Break over!', 'Time to get back to studying, Doctor!');
        } else {
          set({ breakCountdown: breakCountdown - 1 });
        }
      },

      downgradeSession: () => {
        const { agenda, currentItemIndex } = get();
        if (!agenda || currentItemIndex >= agenda.items.length) return;

        const remainingItems = agenda.items.slice(currentItemIndex, currentItemIndex + 2);

        const simplifiedItems = remainingItems.map((item) => ({
          ...item,
          contentTypes: item.contentTypes.filter((ct) =>
            ['keypoints', 'quiz', 'mnemonic'].includes(ct),
          ),
          estimatedMinutes: 5, // Force short estimate
        }));

        if (simplifiedItems[0] && simplifiedItems[0].contentTypes.length === 0) {
          simplifiedItems[0].contentTypes = ['keypoints'];
        }

        const newAgenda: Agenda = {
          items: [...agenda.items.slice(0, currentItemIndex), ...simplifiedItems],
          totalMinutes: agenda.totalMinutes,
          focusNote: (agenda.focusNote || '') + ' (Downgraded due to focus loss)',
          mode: 'sprint',
          guruMessage: agenda.guruMessage,
          skipBreaks: agenda.skipBreaks,
        };

        set({ agenda: newAgenda });
      },

      incrementActiveStudyDuration: (amount: number) => {
        set((state) => ({ activeStudyDuration: state.activeStudyDuration + amount }));
      },

      incrementElapsedSeconds: () => {
        set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 }));
      },

      setElapsedSeconds: (seconds: number) => {
        set({ elapsedSeconds: seconds });
      },

      resetSession: () =>
        set({
          sessionId: null,
          sessionState: 'planning',
          agenda: null,
          currentItemIndex: 0,
          currentContentIndex: 0,
          maxUnlockedContentIndex: 0,
          contentCacheBySlot: {},
          currentContent: null,
          isLoadingContent: false,
          completedTopicIds: [],
          quizResults: [],
          startedAt: null,
          isOnBreak: false,
          breakCountdown: 300,
          isPaused: false,
          activeStudyDuration: 0,
          elapsedSeconds: 0,
        }),
    }),
    {
      name: 'session-storage',
      storage: createJSONStorage(() => splitSessionStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        sessionState: state.sessionState,
        agenda: state.agenda,
        currentItemIndex: state.currentItemIndex,
        currentContentIndex: state.currentContentIndex,
        maxUnlockedContentIndex: state.maxUnlockedContentIndex,
        // Omit currentContent — large AI payloads; SessionScreen refetches via fetchContent when null
        completedTopicIds: state.completedTopicIds,
        quizResults: state.quizResults,
        startedAt: state.startedAt,
        activeStudyDuration: state.activeStudyDuration,
        isOnBreak: state.isOnBreak,
        breakCountdown: state.breakCountdown,
        isPaused: state.isPaused,
        elapsedSeconds: state.elapsedSeconds,
      }),
    },
  ),
);

export function getCurrentAgendaItem(state: SessionStoreState): AgendaItem | null {
  return state.agenda?.items[state.currentItemIndex] ?? null;
}

export function getCurrentContentType(state: SessionStoreState): ContentType | null {
  const item = getCurrentAgendaItem(state);
  if (!item) return null;
  return item.contentTypes[state.currentContentIndex] ?? null;
}
