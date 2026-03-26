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
              question: 'A patient with severe hypertension presents with papilledema. What is the next best step?',
              options: ['A. Oral labetalol', 'B. IV nitroprusside', 'C. Observation', 'D. Repeat BP later'],
              correctIndex: 1,
              explanation: 'Hypertensive emergency with end-organ damage requires immediate IV therapy; the other options are inappropriate because they delay definitive control.',
            },
            {
              question: 'A pregnant patient at 34 weeks has severe hypertension and visual symptoms. Which drug is preferred first?',
              options: ['A. Enalapril', 'B. Sodium nitroprusside', 'C. Labetalol', 'D. Hydrochlorothiazide'],
              correctIndex: 2,
              explanation: 'Labetalol is preferred in pregnancy-related severe hypertension; the others are contraindicated or less appropriate here.',
            },
            {
              question: 'A patient with pheochromocytoma-related hypertensive crisis needs acute control. Which sequence is correct?',
              options: ['A. Beta then alpha blockade', 'B. Alpha then beta blockade', 'C. Diuretic alone', 'D. ACE inhibitor only'],
              correctIndex: 1,
              explanation: 'Alpha blockade must come before beta blockade to avoid unopposed alpha stimulation; the remaining choices miss the pathophysiology.',
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
});
