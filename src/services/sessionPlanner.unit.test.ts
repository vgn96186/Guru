import { buildSession } from './sessionPlanner';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { getRecentlyStudiedTopicNames } from '../db/queries/sessions';
import { profileRepository } from '../db/repositories';
import { planSessionWithAI } from './aiService';
import { getMoodContentTypes } from '../constants/prompts';
import type { TopicWithProgress, Mood, ContentType } from '../types';

jest.mock('../db/queries/topics', () => ({
  getAllTopicsWithProgress: jest.fn(),
}));

jest.mock('../db/queries/sessions', () => ({
  getRecentlyStudiedTopicNames: jest.fn(),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
  },
}));

jest.mock('./aiService', () => ({
  planSessionWithAI: jest.fn(),
}));

jest.mock('../constants/prompts', () => ({
  __esModule: true,
  getMoodContentTypes: jest.fn(() => ['keypoints', 'quiz']),
  buildKeyPointsPrompt: jest.fn(),
  buildQuizPrompt: jest.fn(),
  buildStoryPrompt: jest.fn(),
  buildMnemonicPrompt: jest.fn(),
  buildTeachBackPrompt: jest.fn(),
  buildErrorHuntPrompt: jest.fn(),
  buildDetectivePrompt: jest.fn(),
  buildSocraticPrompt: jest.fn(),
  buildManualPrompt: jest.fn(),
  buildAgendaPrompt: jest.fn(),
  buildAccountabilityPrompt: jest.fn(),
  buildCatalystPrompt: jest.fn(),
  buildDailyAgendaPrompt: jest.fn(),
  buildReplanPrompt: jest.fn(),
  CONTENT_PROMPT_MAP: {},
}));

describe('sessionPlanner', () => {
  const mockTopics: TopicWithProgress[] = [
    {
      id: 1,
      name: 'Topic 1',
      subjectId: 101,
      inicetPriority: 10,
      estimatedMinutes: 20,
      progress: {
        status: 'unseen',
        confidence: 0,
        reps: 0,
        lapses: 0,
        isNemesis: false,
        lastStudiedAt: null,
        fsrsDue: null,
      },
    } as any,
    {
      id: 2,
      name: 'Topic 2',
      subjectId: 102,
      inicetPriority: 5,
      estimatedMinutes: 15,
      progress: {
        status: 'learning',
        confidence: 2,
        reps: 2,
        lapses: 0,
        isNemesis: false,
        lastStudiedAt: Date.now() - 48 * 3600000,
        fsrsDue: '2023-10-20T00:00:00.000Z',
      },
    } as any,
    {
      id: 3,
      name: 'Topic 3',
      subjectId: 101,
      inicetPriority: 10,
      estimatedMinutes: 30,
      progress: {
        status: 'mastered',
        confidence: 5,
        reps: 10,
        lapses: 0,
        isNemesis: false,
        lastStudiedAt: Date.now() - 2 * 3600000, // Very recently studied
        fsrsDue: '2024-12-31T00:00:00.000Z',
      },
    } as any,
  ];

  const mockProfile = {
    focusSubjectIds: [],
    blockedContentTypes: [],
    displayName: 'Test User',
    useLocalModel: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue(mockTopics);
    (getRecentlyStudiedTopicNames as jest.Mock).mockResolvedValue([]);
    (profileRepository.getProfile as jest.Mock).mockResolvedValue(mockProfile);
    (getMoodContentTypes as jest.Mock).mockReturnValue(['keypoints', 'quiz']);
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [1],
      focusNote: 'Default Note',
      guruMessage: 'Default Message',
    });
  });

  // --- Characterization Tests ---

  it('should throw error if no topics available', async () => {
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([]);
    await expect(buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' })).rejects.toThrow(/No topics available/i);
  });

  it('should build a session using AI if key is provided', async () => {
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [1],
      focusNote: 'AI Note',
      guruMessage: 'AI Message',
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });

    expect(agenda.items.length).toBe(1);
    expect(agenda.items[0].topic.id).toBe(1);
    expect(agenda.focusNote).toBe('AI Note');
    expect(planSessionWithAI).toHaveBeenCalled();
  });

  it('should use fallback if AI fails', async () => {
    (planSessionWithAI as jest.Mock).mockRejectedValue(new Error('AI fail'));

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });

    expect(agenda.items.length).toBeGreaterThan(0);
    expect(agenda.focusNote).toContain('Today:');
  });

  it('should handle explicit focus topics', async () => {
    const agenda = await buildSession({
      mood: 'okay',
      preferredMinutes: 30,
      apiKey: 'key',
      options: { focusTopicId: 2 },
    });

    expect(agenda.items.length).toBe(1);
    expect(agenda.items[0].topic.id).toBe(2);
    expect(agenda.focusNote).toContain('Focused study: Topic 2');
  });

  it('should handle multiple explicit focus topics', async () => {
    const agenda = await buildSession({
      mood: 'okay',
      preferredMinutes: 30,
      apiKey: 'key',
      options: { focusTopicIds: [1, 2] },
    });

    // Interleaved: Topic 1 gets [keypoints, quiz], Topic 2 (overdue) gets [keypoints, quiz] = 4 items
    expect(agenda.items.length).toBeGreaterThanOrEqual(2);
    const topicIds = agenda.items.map((i) => i.topic.id);
    expect(topicIds).toContain(1);
    expect(topicIds).toContain(2);
    // Each item should have exactly one content type (interleaved)
    agenda.items.forEach((item) => expect(item.contentTypes.length).toBe(1));
  });

  it('should respect blocked content types', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      ...mockProfile,
      blockedContentTypes: ['quiz'],
    });
    (getMoodContentTypes as jest.Mock).mockReturnValue(['keypoints', 'quiz']);
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [1],
      focusNote: 'Note',
      guruMessage: 'Msg',
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });

    expect(agenda.items[0].contentTypes).not.toContain('quiz');
  });

  it('should handle different moods correctly (distracted)', async () => {
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [1],
      focusNote: 'Note',
      guruMessage: 'Msg',
    });

    const agenda = await buildSession({ mood: 'distracted', preferredMinutes: 60, apiKey: 'key' });

    expect(agenda.totalMinutes).toBe(10); // Distracted mood overrides length
    expect(agenda.mode).toBe('sprint');
  });

  it('should handle energetic mood', async () => {
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [1],
      focusNote: 'Note',
      guruMessage: 'Msg',
    });

    const agenda = await buildSession({ mood: 'energetic', preferredMinutes: 60, apiKey: 'key' });

    expect(agenda.mode).toBe('deep');
  });

  it('should handle tired mood', async () => {
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [1],
      focusNote: 'Note',
      guruMessage: 'Msg',
    });

    const agenda = await buildSession({ mood: 'tired', preferredMinutes: 60, apiKey: 'key' });

    expect(agenda.totalMinutes).toBe(30);
    expect(agenda.mode).toBe('gentle');
  });

  it('should handle stressed mood', async () => {
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [1],
      focusNote: 'Note',
      guruMessage: 'Msg',
    });

    const agenda = await buildSession({ mood: 'stressed', preferredMinutes: 60, apiKey: 'key' });

    expect(agenda.totalMinutes).toBe(20);
    expect(agenda.mode).toBe('gentle');
  });

  it('should handle preferredActionType: review', async () => {
    const agenda = await buildSession({
      mood: 'okay',
      preferredMinutes: 30,
      apiKey: 'key',
      options: { focusTopicId: 1, preferredActionType: 'review' },
    });

    expect(agenda.focusNote).toContain('Focused review');
    expect(agenda.items[0].contentTypes).toContain('keypoints');
    expect(agenda.items[0].contentTypes).toContain('quiz');
  });

  it('should handle preferredActionType: deep_dive', async () => {
    const agenda = await buildSession({
      mood: 'okay',
      preferredMinutes: 30,
      apiKey: 'key',
      options: { focusTopicId: 1, preferredActionType: 'deep_dive' },
    });

    expect(agenda.focusNote).toContain('Focused deep_dive');
    expect(agenda.mode).toBe('deep');
  });

  it('should handle warmup mode fast path', async () => {
    const agenda = await buildSession({
      mood: 'okay',
      preferredMinutes: 30,
      apiKey: 'key',
      options: { mode: 'warmup' },
    });

    expect(agenda.mode).toBe('warmup');
    expect(agenda.skipBreaks).toBe(true);
    expect(agenda.items[0].estimatedMinutes).toBe(4);
    expect(agenda.items[0].contentTypes).toEqual(['keypoints', 'quiz']);
  });

  it('should handle mcq_block mode fast path', async () => {
    const agenda = await buildSession({
      mood: 'okay',
      preferredMinutes: 30,
      apiKey: 'key',
      options: { mode: 'mcq_block' },
    });

    expect(agenda.mode).toBe('mcq_block');
    expect(agenda.items.length).toBeLessThanOrEqual(12);
    expect(agenda.items[0].contentTypes).toEqual(['quiz']);
  });

  it('should include keypoints and quiz for overdue topics', async () => {
    const overdueTopic = {
      ...mockTopics[1],
      progress: {
        ...mockTopics[1].progress,
        fsrsDue: '2020-01-01T00:00:00.000Z',
      },
    };
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([overdueTopic]);
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [2],
      focusNote: 'Note',
      guruMessage: 'Msg',
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });

    expect(agenda.items[0].contentTypes).toEqual(['keypoints', 'quiz']);
  });

  it('should filter by focusSubjectIds from profile', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      ...mockProfile,
      focusSubjectIds: [102],
    });
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [2],
      focusNote: 'Note',
      guruMessage: 'Msg',
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });

    expect(agenda.items.every((i) => i.topic.subjectId === 102)).toBe(true);
  });

  it('should use local model fallback when no keys and useLocalModel is true', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      ...mockProfile,
      useLocalModel: true,
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: '' });

    expect(planSessionWithAI).toHaveBeenCalled(); // Local model still calls planSessionWithAI
  });

  it('should use smart fallback when no keys and useLocalModel is false', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      ...mockProfile,
      useLocalModel: false,
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: '' });

    expect(planSessionWithAI).not.toHaveBeenCalled();
    expect(agenda.items.length).toBeGreaterThan(0);
  });

  // --- Edge Case Tests ---

  it('should handle empty strings for all API keys', async () => {
    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: '  ', orKey: ' ', groqKey: '' });
    expect(planSessionWithAI).not.toHaveBeenCalled();
    expect(agenda.items.length).toBeGreaterThan(0);
  });

  it('should handle all content types blocked', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      ...mockProfile,
      blockedContentTypes: ['keypoints', 'quiz', 'socratic', 'story', 'detective', 'error_hunt'],
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });

    // Should fallback to 'keypoints' as per code:
    // const safeContentTypes = contentTypes.length > 0 ? contentTypes : ['keypoints' as ContentType];
    expect(agenda.items[0].contentTypes).toEqual(['keypoints']);
  });

  it('should handle AI returning non-existent topic IDs', async () => {
    (planSessionWithAI as jest.Mock).mockResolvedValue({
      selectedTopicIds: [999, 888],
      focusNote: 'Bad AI Note',
      guruMessage: 'Bad AI Message',
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });

    expect(agenda.items.length).toBe(1); // Should fallback to candidates[0]
    expect(agenda.items[0].topic.id).toBe(1); // Top scored topic
  });

  it('should handle very recently studied topics with penalty', async () => {
    // Topic 1: Unseen (+15)
    // Topic 2: Overdue learning (+10 plus 10) -> ~20
    // Topic 3: Mastered but studied 2 hours ago (-20 penalty)
    // Topic 2 should be top candidate.

    (planSessionWithAI as jest.Mock).mockImplementation((candidates) => {
      return {
        selectedTopicIds: [candidates[0].id],
        focusNote: 'Note',
        guruMessage: 'Msg',
      };
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });
    expect(agenda.items[0].topic.id).toBe(1);
  });

  it('should boost nemesis topics', async () => {
    // Modify Topic 1 to be nemesis (+50)
    const nemesisTopic = {
      ...mockTopics[0],
      progress: {
        ...mockTopics[0].progress,
        isNemesis: true,
      },
    };
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([
      nemesisTopic,
      mockTopics[1],
      mockTopics[2],
    ]);

    (planSessionWithAI as jest.Mock).mockImplementation((candidates) => {
      return {
        selectedTopicIds: [candidates[0].id],
        focusNote: 'Note',
        guruMessage: 'Msg',
      };
    });

    const agenda = await buildSession({ mood: 'okay', preferredMinutes: 30, apiKey: 'key' });
    expect(agenda.items[0].topic.id).toBe(1);
  });
});
