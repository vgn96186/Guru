import { useSessionStore, getCurrentAgendaItem, getCurrentContentType } from './useSessionStore';

// Mock splitSessionStorage
jest.mock('./splitSessionStorage', () => ({
  splitSessionStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

describe('useSessionStore', () => {
  const mockAgenda = {
    items: [
      {
        topic: { id: 1, name: 'Topic 1' },
        contentTypes: ['keypoints', 'quiz'],
        estimatedMinutes: 10,
      },
      {
        topic: { id: 2, name: 'Topic 2' },
        contentTypes: ['summary'],
        estimatedMinutes: 5,
      },
    ],
    mode: 'normal',
    focusNote: 'Initial note',
  } as any;

  beforeEach(() => {
    useSessionStore.getState().resetSession();
    jest.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const state = useSessionStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.sessionState).toBe('planning');
    expect(state.agenda).toBeNull();
  });

  it('should set session ID and startedAt', () => {
    const now = Date.now();
    jest.useFakeTimers().setSystemTime(now);

    useSessionStore.getState().setSessionId(123);

    const state = useSessionStore.getState();
    expect(state.sessionId).toBe(123);
    expect(state.startedAt).toBe(now);

    jest.useRealTimers();
  });

  describe('navigation', () => {
    it('should navigate to next content', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 0, currentContentIndex: 0 });

      useSessionStore.getState().nextContent();

      const state = useSessionStore.getState();
      expect(state.currentContentIndex).toBe(1);
      expect(state.currentContent).toBeNull();
    });

    it('should not navigate to next content if at the end', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 0, currentContentIndex: 1 });

      useSessionStore.getState().nextContent();

      const state = useSessionStore.getState();
      expect(state.currentContentIndex).toBe(1);
    });

    it('should navigate to next topic and set state to topic_done', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 0 });

      useSessionStore.getState().nextTopic();

      const state = useSessionStore.getState();
      expect(state.currentItemIndex).toBe(1);
      expect(state.currentContentIndex).toBe(0);
      expect(state.sessionState).toBe('topic_done');
      expect(state.completedTopicIds).toContain(1);
    });

    it('should set state to session_done if at the last topic', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 1 });

      useSessionStore.getState().nextTopic();

      const state = useSessionStore.getState();
      expect(state.sessionState).toBe('session_done');
      expect(state.completedTopicIds).toContain(2);
    });

    it('should navigate to next topic without break', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 0 });

      useSessionStore.getState().nextTopicNoBreak();

      const state = useSessionStore.getState();
      expect(state.currentItemIndex).toBe(1);
      expect(state.sessionState).toBe('studying');
    });

    it('should restore cached content when jumping back to an unlocked card', () => {
      useSessionStore.setState({
        agenda: mockAgenda,
        currentItemIndex: 0,
        currentContentIndex: 0,
        maxUnlockedContentIndex: 1,
      });

      const originalKeypoints = {
        type: 'keypoints',
        topicName: 'Topic 1',
        points: ['A', 'B'],
        memoryHook: 'Hook',
      } as any;

      useSessionStore.getState().setCurrentContent(originalKeypoints);
      useSessionStore.getState().jumpToContent(1);
      useSessionStore.getState().jumpToContent(0);

      const state = useSessionStore.getState();
      expect(state.currentContentIndex).toBe(0);
      expect(state.currentContent).toEqual(originalKeypoints);
    });
  });

  describe('markTopicComplete', () => {
    it('should add current topic to completedTopicIds', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 0 });

      useSessionStore.getState().markTopicComplete();

      expect(useSessionStore.getState().completedTopicIds).toContain(1);
    });
  });

  describe('quiz results', () => {
    it('should add a new quiz result', () => {
      const result = { topicId: 1, correct: 4, total: 5 };
      useSessionStore.getState().addQuizResult(result);

      expect(useSessionStore.getState().quizResults).toContainEqual(result);
    });

    it('should update an existing quiz result', () => {
      const result1 = { topicId: 1, correct: 2, total: 5 };
      const result2 = { topicId: 1, correct: 4, total: 5 };

      useSessionStore.getState().addQuizResult(result1);
      useSessionStore.getState().addQuizResult(result2);

      const results = useSessionStore.getState().quizResults;
      expect(results.length).toBe(1);
      expect(results[0]).toEqual(result2);
    });
  });

  describe('break management', () => {
    it('should start and end break', () => {
      useSessionStore.getState().startBreak(60);
      expect(useSessionStore.getState().isOnBreak).toBe(true);
      expect(useSessionStore.getState().breakCountdown).toBe(60);

      useSessionStore.getState().endBreak();
      expect(useSessionStore.getState().isOnBreak).toBe(false);
      expect(useSessionStore.getState().breakCountdown).toBe(0);
    });

    it('should tick break countdown', () => {
      useSessionStore.setState({ isOnBreak: true, breakCountdown: 10 });

      useSessionStore.getState().tickBreak();
      expect(useSessionStore.getState().breakCountdown).toBe(9);
    });

    it('should end break when countdown reaches zero via tick', () => {
      useSessionStore.setState({ isOnBreak: true, breakCountdown: 1 });

      useSessionStore.getState().tickBreak();
      expect(useSessionStore.getState().isOnBreak).toBe(false);
      expect(useSessionStore.getState().breakCountdown).toBe(0);
    });
  });

  describe('downgradeSession', () => {
    it('should simplify remaining agenda items', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 0 });

      useSessionStore.getState().downgradeSession();

      const newAgenda = useSessionStore.getState().agenda;
      expect(newAgenda?.mode).toBe('sprint');
      expect(newAgenda?.items[0].contentTypes).toEqual(['keypoints', 'quiz']); // 'keypoints', 'quiz' are allowed
      expect(newAgenda?.focusNote).toContain('Downgraded');
    });

    it('should ensure at least keypoints if filtered content is empty', () => {
      const agendaWithSummary = {
        items: [{ topic: { id: 3 }, contentTypes: ['summary'] }],
      } as any;
      useSessionStore.setState({ agenda: agendaWithSummary, currentItemIndex: 0 });

      useSessionStore.getState().downgradeSession();

      const newAgenda = useSessionStore.getState().agenda;
      expect(newAgenda?.items[0].contentTypes).toEqual(['keypoints']);
    });
  });

  describe('helpers', () => {
    it('getCurrentAgendaItem should return current item', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 1 });
      const item = getCurrentAgendaItem(useSessionStore.getState());
      expect(item?.topic.id).toBe(2);
    });

    it('getCurrentContentType should return current content type', () => {
      useSessionStore.setState({ agenda: mockAgenda, currentItemIndex: 0, currentContentIndex: 1 });
      const contentType = getCurrentContentType(useSessionStore.getState());
      expect(contentType).toBe('quiz');
    });
  });
});
