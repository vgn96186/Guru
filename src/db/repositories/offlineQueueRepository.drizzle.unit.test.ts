import { getDrizzleDb } from '../drizzle';
import {
  offlineQueueRepositoryDrizzle,
  type OfflineQueueItemRecord,
} from './offlineQueueRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type MockDb = {
  insert: jest.Mock;
  select: jest.Mock;
  update: jest.Mock;
};

const makeDb = (): MockDb => ({
  insert: jest.fn(),
  select: jest.fn(),
  update: jest.fn(),
});

describe('offlineQueueRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueueRequest stores canonical payload JSON and pending metadata', async () => {
    const db = makeDb();
    const values = jest.fn().mockResolvedValue(undefined);
    db.insert.mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);
    jest.spyOn(Date, 'now').mockReturnValue(1710001234567);

    await offlineQueueRepositoryDrizzle.enqueueRequest('generate_json', {
      zeta: 1,
      alpha: 'first',
    });

    expect(values).toHaveBeenCalledWith({
      requestType: 'generate_json',
      payload: JSON.stringify({ alpha: 'first', zeta: 1 }),
      status: 'pending',
      attempts: 0,
      createdAt: 1710001234567,
    });
  });

  it('getPendingRequests returns parsed legacy-shaped items', async () => {
    const db = makeDb();
    const limit = jest.fn().mockResolvedValue([
      {
        id: 9,
        requestType: 'transcribe',
        payload: JSON.stringify({ audioFilePath: '/tmp/lecture.m4a' }),
        status: 'failed',
        attempts: 2,
        createdAt: 1710000000000,
        lastAttemptAt: 1710000300000,
        errorMessage: 'timeout',
      },
    ]);
    const orderBy = jest.fn(() => ({ limit }));
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await offlineQueueRepositoryDrizzle.getPendingRequests();

    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toEqual<OfflineQueueItemRecord[]>([
      {
        id: 9,
        requestType: 'transcribe',
        payload: { audioFilePath: '/tmp/lecture.m4a' },
        status: 'failed',
        attempts: 2,
        createdAt: 1710000000000,
        lastAttemptAt: 1710000300000,
        errorMessage: 'timeout',
      },
    ]);
  });

  it('markCompleted updates status to completed', async () => {
    const db = makeDb();
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));
    db.update.mockReturnValue({ set });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await offlineQueueRepositoryDrizzle.markCompleted(17);

    expect(set).toHaveBeenCalledWith({
      status: 'completed',
    });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('markFailed updates failed status and error message', async () => {
    const db = makeDb();
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));
    db.update.mockReturnValue({ set });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await offlineQueueRepositoryDrizzle.markFailed(23, 'Network timeout');

    expect(set).toHaveBeenCalledWith({
      status: 'failed',
      errorMessage: 'Network timeout',
    });
    expect(where).toHaveBeenCalledTimes(1);
  });
});
