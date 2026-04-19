jest.mock('../../db/queries/aiCache', () => ({
  getCachedContent: jest.fn(),
  setCachedContent: jest.fn(),
}));

jest.mock('../../db/queries/questionBank', () => ({
  saveBulkQuestions: jest.fn(),
}));

jest.mock('ai', () => ({
  generateObject: jest.fn(),
}));

jest.mock('./providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn().mockReturnValue({
    provider: 'groq',
    modelId: 'test-model',
    doGenerate: jest.fn(),
    doStream: jest.fn(),
  }),
}));

jest.mock('./medicalSearch', () => ({
  searchMedicalImages: jest.fn(),
  generateVisualSearchQueries: jest.fn(async (q: string) => [q]),
}));

jest.mock('./medicalFactCheck', () => ({
  scheduleBackgroundFactCheck: jest.fn(),
}));

jest.mock('../../db/repositories/profileRepository', () => ({
  profileRepository: {
    getProfile: jest.fn().mockResolvedValue({}),
  },
}));

import { fetchContent } from './contentGeneration';
import { getCachedContent, setCachedContent } from '../../db/queries/aiCache';
import { saveBulkQuestions } from '../../db/queries/questionBank';
import { generateObject } from 'ai';
import { searchMedicalImages, generateVisualSearchQueries } from './medicalSearch';

const mockGetCachedContent = getCachedContent as jest.MockedFunction<typeof getCachedContent>;
const mockSetCachedContent = setCachedContent as jest.MockedFunction<typeof setCachedContent>;
const mockSaveBulkQuestions = saveBulkQuestions as jest.MockedFunction<typeof saveBulkQuestions>;
const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;
const mockSearchMedicalImages = searchMedicalImages as jest.MockedFunction<
  typeof searchMedicalImages
>;
const mockGenerateVisualSearchQueries = generateVisualSearchQueries as jest.MockedFunction<
  typeof generateVisualSearchQueries
>;

describe('ai content prefetching', () => {
  const topic: any = {
    id: 42,
    name: 'Hypertension',
    subjectName: 'Medicine',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__DEV__ = true;
    mockSaveBulkQuestions.mockResolvedValue(0 as any);
    mockGenerateVisualSearchQueries.mockResolvedValue(['mocked query']);
  });

  it('reuses the same in-flight generation for duplicate content requests', async () => {
    let resolveGeneration: ((value: any) => void) | null = null;
    mockGetCachedContent.mockResolvedValue(null);
    mockGenerateObject.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);

    const first = fetchContent(topic, 'keypoints');
    const second = fetchContent(topic, 'keypoints');
    await Promise.resolve();

    expect(generateObject).toHaveBeenCalledTimes(1);

    expect(resolveGeneration).toBeTruthy();
    resolveGeneration!({
      object: {
        type: 'keypoints',
        topicName: 'Hypertension',
        points: ['Point 1', 'Point 2', 'Point 3', 'Point 4'],
        memoryHook: 'A memorable hook for hypertension.',
      },
      rawText: '',
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(setCachedContent).toHaveBeenCalledTimes(1);
  });

  it('retries once when the generated card is obviously incomplete', async () => {
    (getCachedContent as jest.Mock).mockResolvedValue(null);
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);
    (generateObject as jest.Mock)
      .mockResolvedValueOnce({
        object: {
          type: 'quiz',
          topicName: 'Hypertension',
          questions: [
            {
              question: 'Short?',
              options: ['A', 'B', 'C', 'D'],
              correctIndex: 0,
              explanation: 'Too short',
            },
          ],
        },
        rawText: '',
      })
      .mockResolvedValueOnce({
        object: {
          type: 'quiz',
          topicName: 'Hypertension',
          questions: [
            {
              question:
                'A patient with severe hypertension presents with papilledema. What is the next best step?',
              options: [
                'A. Oral labetalol',
                'B. IV nitroprusside',
                'C. Observation',
                'D. Repeat BP later',
              ],
              correctIndex: 1,
              explanation:
                'Hypertensive emergency with end-organ damage requires immediate IV therapy; the other options are inappropriate because they delay definitive control.',
            },
            {
              question:
                'A pregnant patient at 34 weeks has severe hypertension and visual symptoms. Which drug is preferred first?',
              options: [
                'A. Enalapril',
                'B. Sodium nitroprusside',
                'C. Labetalol',
                'D. Hydrochlorothiazide',
              ],
              correctIndex: 2,
              explanation:
                'Labetalol is preferred in pregnancy-related severe hypertension; the others are contraindicated or less appropriate here.',
            },
            {
              question:
                'A patient with pheochromocytoma-related hypertensive crisis needs acute control. Which sequence is correct?',
              options: [
                'A. Beta then alpha blockade',
                'B. Alpha then beta blockade',
                'C. Diuretic alone',
                'D. ACE inhibitor only',
              ],
              correctIndex: 1,
              explanation:
                'Alpha blockade must come before beta blockade to avoid unopposed alpha stimulation; the remaining choices miss the pathophysiology.',
            },
          ],
        },
        rawText: '',
      });

    const result = await fetchContent(topic, 'quiz');

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result.type).toBe('quiz');
    expect((result as any).questions).toHaveLength(3);
  });

  it('accepts and caches must_know content', async () => {
    (getCachedContent as jest.Mock).mockResolvedValue(null);
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        type: 'must_know',
        topicName: 'Hypertension',
        mustKnow: [
          '**Emergency** - Severe BP with end-organ damage needs urgent treatment.',
          '**Pregnancy** - Labetalol is commonly preferred in severe hypertension.',
          '**Retina** - Papilledema suggests hypertensive emergency.',
          '**Pheochromocytoma** - Alpha blockade precedes beta blockade.',
        ],
        mostTested: [
          '**MAP** - Reduce gradually, not abruptly, in hypertensive emergency.',
          '**Nitroprusside** - Classic IV option for acute BP control.',
          '**ACE inhibitors** - Contraindicated in pregnancy.',
          '**End-organ damage** - Defines emergency over urgency.',
        ],
        examTip: 'First decide urgency versus emergency before choosing the drug.',
      },
      rawText: '',
    });

    const result = await fetchContent(topic, 'must_know');

    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(result.type).toBe('must_know');
    expect(setCachedContent).toHaveBeenCalledWith(
      topic.id,
      'must_know',
      expect.objectContaining({
        type: 'must_know',
        topicName: 'Hypertension',
      }),
      'groq/test-model',
    );
  });

  it('hydrates quiz imageSearchQuery into imageUrl before caching', async () => {
    (getCachedContent as jest.Mock).mockResolvedValue(null);
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);
    (searchMedicalImages as jest.Mock).mockResolvedValue([
      {
        id: 'img-1',
        title: 'Chest radiograph',
        url: 'https://example.com/source',
        imageUrl: 'https://example.com/radiograph.jpg',
        snippet: 'Chest radiograph',
        source: 'Wikipedia',
      },
    ]);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        type: 'quiz',
        topicName: 'Hypertension',
        questions: [
          {
            question: 'Based on the image shown, what is the diagnosis?',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0,
            explanation: 'Explanation long enough to pass completeness checks.',
            imageSearchQuery: 'hypertensive retinopathy fundus',
          },
          {
            question: 'Second complete question for retry guard.',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 1,
            explanation: 'Another explanation long enough to pass completeness checks.',
          },
        ],
      },
      rawText: '',
    });

    const result = await fetchContent(topic, 'quiz');

    expect(searchMedicalImages).toHaveBeenCalledWith('hypertensive retinopathy fundus', 1);
    expect(result.type).toBe('quiz');
    if (result.type !== 'quiz') throw new Error('expected quiz');
    expect(result.questions[0].imageUrl).toBe('https://example.com/radiograph.jpg');
    expect(result.questions[0].imageSearchQuery).toBeUndefined();
  });

  it('hydrates flashcard imageSearchQuery into imageUrl before caching', async () => {
    (getCachedContent as jest.Mock).mockResolvedValue(null);
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);
    (searchMedicalImages as jest.Mock).mockResolvedValue([
      {
        id: 'img-2',
        title: 'Fundus photo',
        url: 'https://example.com/source2',
        imageUrl: 'https://example.com/fundus.jpg',
        snippet: 'Fundus image',
        source: 'Wikipedia',
      },
    ]);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        type: 'flashcards',
        topicName: 'Hypertension',
        cards: [
          {
            front: 'Identify the retinal change shown.',
            back: 'AV nicking',
            imageSearchQuery: 'hypertensive retinopathy fundus',
          },
          {
            front: 'Drug of choice?',
            back: 'Labetalol',
          },
          {
            front: 'Gold standard?',
            back: 'Ambulatory BP monitoring',
          },
        ],
      },
      rawText: '',
    });

    const result = await fetchContent(topic, 'flashcards');

    expect(searchMedicalImages).toHaveBeenCalledWith('hypertensive retinopathy fundus', 1);
    expect(result.type).toBe('flashcards');
    if (result.type !== 'flashcards') throw new Error('expected flashcards');
    expect(result.cards[0].imageUrl).toBe('https://example.com/fundus.jpg');
    expect(result.cards[0].imageSearchQuery).toBeUndefined();
  });
});
