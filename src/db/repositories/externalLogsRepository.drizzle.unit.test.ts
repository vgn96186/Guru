import { getDrizzleDb } from '../drizzle';
import { externalAppLogs } from '../drizzleSchema';
import { externalLogsRepositoryDrizzle } from './externalLogsRepository.drizzle';

// Mock drizzle
jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

describe('externalLogsRepositoryDrizzle', () => {
  const mockDb = {
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
  };

  const mockInsertBuilder = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  };

  const mockUpdateBuilder = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn(),
  };

  const mockSelectBuilder = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getDrizzleDb as jest.Mock).mockReturnValue(mockDb);

    mockDb.insert.mockReturnValue(mockInsertBuilder);
    mockDb.update.mockReturnValue(mockUpdateBuilder);
    mockDb.select.mockReturnValue(mockSelectBuilder);
    mockInsertBuilder.values.mockReturnValue(mockInsertBuilder);
    mockUpdateBuilder.set.mockReturnValue(mockUpdateBuilder);
    mockSelectBuilder.from.mockReturnValue(mockSelectBuilder);
    mockSelectBuilder.where.mockReturnValue(mockSelectBuilder);
    mockSelectBuilder.orderBy.mockReturnValue(mockSelectBuilder);
  });

  describe('startExternalAppSession', () => {
    it('inserts a new session and returns the id', async () => {
      mockInsertBuilder.returning.mockResolvedValue([{ id: 42 }]);

      const result = await externalLogsRepositoryDrizzle.startExternalAppSession(
        'Marrow',
        '/path/to/audio',
      );

      expect(result).toBe(42);
      expect(mockDb.insert).toHaveBeenCalledWith(externalAppLogs);
      expect(mockInsertBuilder.values).toHaveBeenCalledWith({
        appName: 'Marrow',
        launchedAt: expect.any(Number),
        recordingPath: '/path/to/audio',
        transcriptionStatus: 'recording',
      });
    });
  });

  describe('finishExternalAppSession', () => {
    it('updates returnedAt and durationMinutes', async () => {
      await externalLogsRepositoryDrizzle.finishExternalAppSession(42, 15, 'Some notes');

      expect(mockDb.update).toHaveBeenCalledWith(externalAppLogs);
      expect(mockUpdateBuilder.set).toHaveBeenCalledWith({
        returnedAt: expect.any(Number),
        durationMinutes: 15,
        notes: 'Some notes',
      });
    });
  });

  describe('updateSessionTranscriptionStatus', () => {
    it('updates the status properly', async () => {
      await externalLogsRepositoryDrizzle.updateSessionTranscriptionStatus(
        42,
        'completed',
        undefined,
        123,
      );

      expect(mockDb.update).toHaveBeenCalledWith(externalAppLogs);
      expect(mockUpdateBuilder.set).toHaveBeenCalledWith({
        transcriptionStatus: 'completed',
        transcriptionError: null,
        lectureNoteId: 123,
      });
    });
  });

  describe('getIncompleteExternalSession', () => {
    it('returns null if no incomplete sessions exist', async () => {
      mockSelectBuilder.limit.mockResolvedValue([]);

      const result = await externalLogsRepositoryDrizzle.getIncompleteExternalSession();

      expect(result).toBeNull();
    });

    it('returns the incomplete session if found', async () => {
      mockSelectBuilder.limit.mockResolvedValue([
        {
          id: 1,
          appName: 'PrepLadder',
          launchedAt: 12345,
          returnedAt: null,
        },
      ]);

      const result = await externalLogsRepositoryDrizzle.getIncompleteExternalSession();

      expect(result).toEqual(
        expect.objectContaining({
          id: 1,
          appName: 'PrepLadder',
          launchedAt: 12345,
        }),
      );
    });
  });

  describe('getTotalExternalStudyMinutes', () => {
    it('returns total minutes', async () => {
      mockSelectBuilder.limit.mockResolvedValue([{ totalMinutes: 120 }]);

      const result = await externalLogsRepositoryDrizzle.getTotalExternalStudyMinutes();

      expect(result).toBe(120);
    });

    it('returns 0 if no results', async () => {
      mockSelectBuilder.limit.mockResolvedValue([]);

      const result = await externalLogsRepositoryDrizzle.getTotalExternalStudyMinutes();

      expect(result).toBe(0);
    });
  });
});
