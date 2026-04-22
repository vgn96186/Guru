import { getDrizzleDb } from '../drizzle';
import { lectureScheduleRepositoryDrizzle } from './lectureScheduleRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type LectureScheduleRow = {
  id: number;
  batchId: string;
  lectureIndex: number;
  completedAt: number;
};

function createSelectChain(rows: LectureScheduleRow[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
  };
}

describe('lectureScheduleRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getCompletedLectures returns ordered lecture indices for a batch', async () => {
    const selectChain = createSelectChain([
      {
        id: 11,
        batchId: 'btr',
        lectureIndex: 1,
        completedAt: 1710000000000,
      },
      {
        id: 12,
        batchId: 'btr',
        lectureIndex: 3,
        completedAt: 1710000100000,
      },
    ]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await lectureScheduleRepositoryDrizzle.getCompletedLectures('btr');

    expect(select).toHaveBeenCalledTimes(1);
    expect(selectChain.where).toHaveBeenCalledTimes(1);
    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([1, 3]);
  });

  it('getCompletedLectures returns an empty list when no lectures are completed', async () => {
    const selectChain = createSelectChain([]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await lectureScheduleRepositoryDrizzle.getCompletedLectures('dbmci_one');

    expect(result).toEqual([]);
  });

  it('markLectureCompleted inserts one completion row with current timestamp', async () => {
    const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({
      onConflictDoNothing,
    });
    const insert = jest.fn().mockReturnValue({
      values,
    });
    (getDrizzleDb as jest.Mock).mockReturnValue({ insert });

    const before = Date.now();
    await lectureScheduleRepositoryDrizzle.markLectureCompleted('btr', 7);
    const after = Date.now();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'btr',
        lectureIndex: 7,
      }),
    );
    const inserted = values.mock.calls[0]?.[0] as { completedAt: number };
    expect(inserted.completedAt).toBeGreaterThanOrEqual(before);
    expect(inserted.completedAt).toBeLessThanOrEqual(after);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it('unmarkLectureCompleted deletes the requested batch lecture pair', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn().mockReturnValue({ where });
    (getDrizzleDb as jest.Mock).mockReturnValue({ delete: deleteFn });

    await lectureScheduleRepositoryDrizzle.unmarkLectureCompleted('dbmci_one', 4);

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
