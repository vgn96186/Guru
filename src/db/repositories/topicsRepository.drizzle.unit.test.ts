import { setDbForTests } from '../database';
import { resetDrizzleDb } from '../drizzle';
import { createTestDatabase } from '../testing/createTestDatabase';
import { topicsRepositoryDrizzle } from './topicsRepository.drizzle';

describe('topicsRepositoryDrizzle', () => {
  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = createTestDatabase();
    setDbForTests(db);
    resetDrizzleDb();

    await db.runAsync(
      'INSERT INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [2, 'Physiology', 'PHY', '#00AAFF', 1, 1, 1],
    );
    await db.runAsync(
      'INSERT INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [3, 'Biochemistry', 'BIO', '#FFAA00', 1, 1, 2],
    );
    await db.runAsync(
      'INSERT INTO topics (id, subject_id, name, estimated_minutes, inicet_priority) VALUES (?, ?, ?, ?, ?)',
      [11, 2, 'Renal physiology', 40, 8],
    );
    await db.runAsync(
      'INSERT INTO topic_progress (topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date, user_notes, wrong_count, is_nemesis, fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        11,
        'reviewed',
        2,
        1710000000000,
        3,
        25,
        '2026-04-25',
        'Important',
        1,
        1,
        '2026-04-25T00:00:00.000Z',
        1.2,
        4.1,
        2,
        5,
        3,
        0,
        2,
        '2026-04-20T00:00:00.000Z',
      ],
    );
  });

  afterEach(() => {
    setDbForTests(null);
    resetDrizzleDb();
  });

  it('returns empty array for invalid subject id', async () => {
    const result = await topicsRepositoryDrizzle.getTopicsBySubject('invalid');

    expect(result).toEqual([]);
  });

  it('maps getTopicsBySubject rows to TopicWithProgress shape', async () => {
    const result = await topicsRepositoryDrizzle.getTopicsBySubject(2);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 11,
      subjectId: 2,
      subjectName: 'Physiology',
      subjectCode: 'PHY',
      subjectColor: '#00AAFF',
      progress: {
        status: 'reviewed',
        userNotes: 'Important',
        isNemesis: true,
      },
    });
  });

  it('returns null when getTopicById has no row', async () => {
    const result = await topicsRepositoryDrizzle.getTopicById(9999);

    expect(result).toBeNull();
  });

  it('createTopic inserts trimmed values and returns created topic', async () => {
    const result = await topicsRepositoryDrizzle.createTopic({
      subjectId: 3,
      name: '  Acidosis  ',
      estimatedMinutes: 20,
      inicetPriority: 9,
    });

    expect(result?.name).toBe('Acidosis');
    expect(result?.subjectId).toBe(3);
    expect(result?.estimatedMinutes).toBe(20);
    expect(result?.inicetPriority).toBe(9);
  });

  it('searchTopicsByName returns empty for blank query and maps result for non-blank', async () => {
    const emptyResult = await topicsRepositoryDrizzle.searchTopicsByName('   ');
    expect(emptyResult).toEqual([]);

    const result = await topicsRepositoryDrizzle.searchTopicsByName('Renal');
    expect(result[0]?.name).toBe('Renal physiology');
  });
});
