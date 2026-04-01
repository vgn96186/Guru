jest.mock('../../db/queries/aiCache', () => ({
  getCachedContent: jest.fn(),
  setCachedContent: jest.fn(),
}));

jest.mock('../../db/queries/questionBank', () => ({
  saveBulkQuestions: jest.fn(),
}));

jest.mock('./generate', () => ({
  generateJSONWithRouting: jest.fn(),
}));

jest.mock('./medicalSearch', () => ({
  searchMedicalImages: jest.fn(),
}));

import { fetchContent } from './content';
import { getCachedContent, setCachedContent } from '../../db/queries/aiCache';
import { saveBulkQuestions } from '../../db/queries/questionBank';
import { generateJSONWithRouting } from './generate';
import { searchMedicalImages } from './medicalSearch';

describe('ai content prefetching', () => {
  const topic: any = {
    id: 42,
    name: 'Hypertension',
    subjectName: 'Medicine',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    (saveBulkQuestions as jest.Mock).mockResolvedValue(undefined);
  });

  it('reuses the same in-flight generation for duplicate content requests', async () => {
    let resolveGeneration: ((value: unknown) => void) | null = null;
    (getCachedContent as jest.Mock).mockResolvedValue(null);
    (generateJSONWithRouting as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);

    const first = fetchContent(topic, 'keypoints');
    const second = fetchContent(topic, 'keypoints');
    await Promise.resolve();

    expect(generateJSONWithRouting).toHaveBeenCalledTimes(1);

    expect(resolveGeneration).toBeTruthy();
    resolveGeneration!({
      parsed: {
        type: 'keypoints',
        topicName: 'Hypertension',
        points: ['Point 1', 'Point 2', 'Point 3', 'Point 4'],
        memoryHook: 'A memorable hook for hypertension.',
      },
      modelUsed: 'groq/test-model',
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(setCachedContent).toHaveBeenCalledTimes(1);
  });

  it('retries once when the generated card is obviously incomplete', async () => {
    (getCachedContent as jest.Mock).mockResolvedValue(null);
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);
    (generateJSONWithRouting as jest.Mock)
      .mockResolvedValueOnce({
        parsed: {
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
        modelUsed: 'groq/first-pass',
      })
      .mockResolvedValueOnce({
        parsed: {
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
        modelUsed: 'groq/retry-pass',
      });

    const result = await fetchContent(topic, 'quiz');

    expect(generateJSONWithRouting).toHaveBeenCalledTimes(2);
    expect(result.type).toBe('quiz');
    expect((result as any).questions).toHaveLength(3);
  });

  it('accepts and caches must_know content', async () => {
    (getCachedContent as jest.Mock).mockResolvedValue(null);
    (setCachedContent as jest.Mock).mockResolvedValue(undefined);
    (generateJSONWithRouting as jest.Mock).mockResolvedValue({
      parsed: {
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
      modelUsed: 'groq/test-model',
    });

    const result = await fetchContent(topic, 'must_know');

    expect(generateJSONWithRouting).toHaveBeenCalledTimes(1);
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
    (generateJSONWithRouting as jest.Mock).mockResolvedValue({
      parsed: {
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
      modelUsed: 'groq/test-model',
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
    (generateJSONWithRouting as jest.Mock).mockResolvedValue({
      parsed: {
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
      modelUsed: 'groq/test-model',
    });

    const result = await fetchContent(topic, 'flashcards');

    expect(searchMedicalImages).toHaveBeenCalledWith('hypertensive retinopathy fundus', 1);
    expect(result.type).toBe('flashcards');
    if (result.type !== 'flashcards') throw new Error('expected flashcards');
    expect(result.cards[0].imageUrl).toBe('https://example.com/fundus.jpg');
    expect(result.cards[0].imageSearchQuery).toBeUndefined();
  });
});
