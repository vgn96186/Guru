import { searchLectureNotes } from './aiCache';
import { setDbForTests } from '../database';
import { resetDrizzleDb } from '../drizzle';
import { createTestDatabase } from '../testing/createTestDatabase';
import * as embeddingService from '../../services/ai/embeddingService';

jest.mock('../../services/ai/embeddingService', () => ({
  generateEmbedding: jest.fn(),
  embeddingToBlob: jest.fn(),
}));

describe('searchLectureNotes', () => {
  const asMock = <T>(v: T) => v as unknown as jest.Mock;

  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = createTestDatabase();
    setDbForTests(db);
    resetDrizzleDb();

    await db.runAsync(
      'INSERT INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 'Pathology', 'PATH', '#000000', 1, 1, 1],
    );

    await db.runAsync(
      'INSERT INTO lecture_notes (id, subject_id, note, created_at, transcript, summary, topics_json, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        10,
        1,
        'Kidney lecture note',
        Date.now(),
        'Transcribed content about kidneys',
        'Summary about kidneys',
        '["kidney"]',
        2,
      ],
    );
  });

  afterEach(() => {
    setDbForTests(null);
    resetDrizzleDb();
  });

  it('returns LIKE matches even when semantic embedding is unavailable', async () => {
    asMock(embeddingService.generateEmbedding).mockResolvedValue(null);

    const results = await searchLectureNotes('Kidney', 20);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(10);
  });

  it('merges semantic matches with LIKE matches (deduped)', async () => {
    asMock(embeddingService.generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
    asMock(embeddingService.embeddingToBlob).mockReturnValue(new Uint8Array([1, 2, 3]));

    const mockGetAllAsync = jest.fn().mockResolvedValue([{ id: 10, distance: 0.1 }]);
    (db as any).getAllAsync = mockGetAllAsync;

    const results = await searchLectureNotes('kidney', 20);

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('kidney');
    expect(mockGetAllAsync).toHaveBeenCalled();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(10);
  });
});
