import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Validate agenda structure
function validateAgenda(agenda: any): Agenda | null {
  if (!agenda || typeof agenda !== 'object') return null;
  
  const { items, mode, focusNote } = agenda;
  if (!Array.isArray(items)) return null;
  
  // Validate each item
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    const { topic, contentTypes, estimatedMinutes } = item;
    if (!topic || typeof topic !== 'object') return null;
    if (!Array.isArray(contentTypes)) return null;
    if (typeof estimatedMinutes !== 'number') return null;
    
    // Validate topic structure
    if (typeof topic.id !== 'number') return null;
    if (typeof topic.name !== 'string') return null;
  }
  
  return {
    items: items as AgendaItem[],
    mode: mode === 'sprint' ? 'sprint' : 'normal',
    focusNote: typeof focusNote === 'string' ? focusNote : '',
  };
}

// Validate quiz result
function validateQuizResult(result: any): QuizResult | null {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.topicId !== 'number') return null;
  if (typeof result.correct !== 'number' || result.correct < 0) return null;
  if (typeof result.total !== 'number' || result.total < 1) return null;
  if (result.correct > result.total) return null;
  return {
    topicId: result.topicId,
    correct: result.correct,
    total: result.total,
  };
}

export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set, get) => ({
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
      
      setSessionState: (state) => {
        // Validate state transition
        const currentState = get().sessionState;
        const validTransitions: Record<SessionState, SessionState[]> = {
          'planning': ['topic_done', 'session_done', 'downgraded'],
          'topic_done': ['topic_done', 'session_done', 'downgraded'],
          'session_done': [],
          'downgraded': ['topic_done', 'session_done'],
        };
        
        if (!validTransitions[currentState]?.includes(state)) {
          console.warn(`[SessionStore] Invalid state transition: ${currentState} -> ${state}`);
          return;
        }
        set({ sessionState: state });
      },

      setAgenda: (agenda) => {
        const validated = validateAgenda(agenda);
        if (!validated) {
          console.error('[SessionStore] Invalid agenda provided:', agenda);
          return;
        }
        set({ 
          agenda: validated,
          currentItemIndex: 0,
          currentContentIndex: 0,
          currentContent: null,
          completedTopicIds