import { create } from 'zustand';
import type { Agenda, AgendaItem, AIContent, ContentType, SessionState } from '../types';

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
  currentContent: AIContent | null;
  isLoadingContent: boolean;
  completedTopicIds: number[];
  quizResults: QuizResult[];
  startedAt: number | null;
  activeStudyDuration: number;
  // Break state
  isOnBreak: boolean;
  breakCountdown: number;
  // Actions
  setSessionId: (id: number) => void;
  setSessionState: (state: SessionState) => void;
  setAgenda: (agenda: Agenda) => void;
  setCurrentContent: (content: AIContent | null) => void;
  setLoadingContent: (loading: boolean) => void;
  // Pausing
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  nextContent: () => void;
  nextTopic: () => void;
  markTopicComplete: () => void;
  addQuizResult: (result: QuizResult) => void;
  startBreak: (seconds: number) => void;
  endBreak: () => void;
  tickBreak: () => void;
  downgradeSession: () => void;
  incrementActiveStudyDuration: (amount: number) => void;
  resetSession: () => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessionId: null,
  sessionState: 'planning',
  agenda: null,
  currentItemIndex: 0,
  currentContentIndex: 0,
  currentContent: null,
  isLoadingContent: false,
  completedTopicIds: [],
  quizResults: [],
  startedAt: null,
  isOnBreak: false,
  breakCountdown: 300,
  isPaused: false,
  activeStudyDuration: 0,

  setSessionId: (id) => set({ sessionId: id, startedAt: Date.now() }),
  setSessionState: (state) => set({ sessionState: state }),
  setAgenda: (agenda) => set({ agenda }),
  setCurrentContent: (content) => set({ currentContent: content }),
  setLoadingContent: (loading) => set({ isLoadingContent: loading }),
  setPaused: (paused) => set({ isPaused: paused }),

  nextContent: () => {
    const { agenda, currentItemIndex, currentContentIndex } = get();
    if (!agenda) return;
    const item = agenda.items[currentItemIndex];
    if (!item) return;
    if (currentContentIndex < item.contentTypes.length - 1) {
      set({ currentContentIndex: currentContentIndex + 1, currentContent: null });
    }
    // If last content type, caller should call nextTopic
  },

  nextTopic: () => {
    const { agenda, currentItemIndex, completedTopicIds } = get();
    if (!agenda) return;
    const currentTopic = agenda.items[currentItemIndex];
    const newCompleted = currentTopic && !completedTopicIds.includes(currentTopic.topic.id)
      ? [...completedTopicIds, currentTopic.topic.id]
      : completedTopicIds;

    if (currentItemIndex < agenda.items.length - 1) {
      set({
        currentItemIndex: currentItemIndex + 1,
        currentContentIndex: 0,
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
    if (!agenda) return;
    const topic = agenda.items[currentItemIndex]?.topic;
    if (topic && !completedTopicIds.includes(topic.id)) {
      set({ completedTopicIds: [...completedTopicIds, topic.id] });
    }
  },

  addQuizResult: (result) => {
    const { quizResults } = get();
    const existing = quizResults.find(r => r.topicId === result.topicId);
    if (existing) {
      set({ quizResults: quizResults.map(r => r.topicId === result.topicId ? result : r) });
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
    } else {
      set({ breakCountdown: breakCountdown - 1 });
    }
  },

  downgradeSession: () => {
    const { agenda, currentItemIndex } = get();
    if (!agenda) return;

    // 1. Truncate agenda: keep current item + maybe 1 more if it exists, discard rest
    const remainingItems = agenda.items.slice(currentItemIndex, currentItemIndex + 2);
    
    // 2. Simplify content: remove time-consuming types (story, detective, deep_dive logic)
    // Keep only: keypoints, quiz, mnemonic
    const simplifiedItems = remainingItems.map(item => ({
      ...item,
      contentTypes: item.contentTypes.filter(ct => ['keypoints', 'quiz', 'mnemonic'].includes(ct)),
      estimatedMinutes: 5 // Force short estimate
    }));

    // If current item became empty (had only deep types), force add keypoints
    if (simplifiedItems[0] && simplifiedItems[0].contentTypes.length === 0) {
      simplifiedItems[0].contentTypes = ['keypoints'];
    }

    const newAgenda = {
      ...agenda,
      items: [...agenda.items.slice(0, currentItemIndex), ...simplifiedItems],
      mode: 'sprint', // Switch mode label
      focusNote: agenda.focusNote + " (Downgraded due to focus loss)",
    };

    set({ agenda: newAgenda as Agenda });
  },

  incrementActiveStudyDuration: (amount: number) => {
    set(state => ({ activeStudyDuration: state.activeStudyDuration + amount }));
  },

  resetSession: () => set({
    sessionId: null,
    sessionState: 'planning',
    agenda: null,
    currentItemIndex: 0,
    currentContentIndex: 0,
    currentContent: null,
    isLoadingContent: false,
    completedTopicIds: [],
    quizResults: [],
    startedAt: null,
    isOnBreak: false,
    breakCountdown: 300,
    isPaused: false,
    activeStudyDuration: 0,
  }),
}));

export function getCurrentAgendaItem(state: SessionStoreState): AgendaItem | null {
  return state.agenda?.items[state.currentItemIndex] ?? null;
}

export function getCurrentContentType(state: SessionStoreState): ContentType | null {
  const item = getCurrentAgendaItem(state);
  if (!item) return null;
  return item.contentTypes[state.currentContentIndex] ?? null;
}
