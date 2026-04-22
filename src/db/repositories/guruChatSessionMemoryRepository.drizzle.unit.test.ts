import { getDrizzleDb } from '../drizzle';
import { guruChatSessionMemoryRepositoryDrizzle } from './guruChatSessionMemoryRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type SessionMemoryRow = {
  threadId: number;
  topicName: string;
  summaryText: string;
  stateJson: string | null;
  updatedAt: number;
  messagesAtLastSummary: number;
};

function createSelectChain(rows: SessionMemoryRow[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

describe('guruChatSessionMemoryRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSessionMemoryRow returns the mapped legacy-shaped row', async () => {
    const selectChain = createSelectChain([
      {
        threadId: 41,
        topicName: 'Cardiology',
        summaryText: 'Discussed murmurs and valvular lesions.',
        stateJson: '{"lastCard":"murmurs"}',
        updatedAt: 1713760000000,
        messagesAtLastSummary: 9,
      },
    ]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await guruChatSessionMemoryRepositoryDrizzle.getSessionMemoryRow(41);

    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      threadId: 41,
      topicName: 'Cardiology',
      summaryText: 'Discussed murmurs and valvular lesions.',
      stateJson: '{"lastCard":"murmurs"}',
      updatedAt: 1713760000000,
      messagesAtLastSummary: 9,
    });
  });

  it('getSessionMemoryRow falls back to empty object JSON when stateJson is null', async () => {
    const selectChain = createSelectChain([
      {
        threadId: 42,
        topicName: 'Pharmacology',
        summaryText: 'Covered autonomic drugs.',
        stateJson: null,
        updatedAt: 1713761000000,
        messagesAtLastSummary: 4,
      },
    ]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await guruChatSessionMemoryRepositoryDrizzle.getSessionMemoryRow(42);

    expect(result?.stateJson).toBe('{}');
  });

  it('getSessionMemoryRow returns null when no memory exists for the thread', async () => {
    const selectChain = createSelectChain([]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await guruChatSessionMemoryRepositoryDrizzle.getSessionMemoryRow(404);

    expect(result).toBeNull();
  });

  it('upsertSessionMemory inserts and updates the legacy fields with a default stateJson', async () => {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue({ insert });

    await guruChatSessionMemoryRepositoryDrizzle.upsertSessionMemory(
      12,
      'Medicine',
      'Reviewed shock approach.',
      7,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 12,
        topicName: 'Medicine',
        summaryText: 'Reviewed shock approach.',
        stateJson: '{}',
        updatedAt: expect.any(Number),
        messagesAtLastSummary: 7,
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          topicName: 'Medicine',
          summaryText: 'Reviewed shock approach.',
          stateJson: '{}',
          updatedAt: expect.any(Number),
          messagesAtLastSummary: 7,
        }),
      }),
    );
  });

  it('deleteSessionMemory deletes the row for the requested thread', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const del = jest.fn().mockReturnValue({ where });
    (getDrizzleDb as jest.Mock).mockReturnValue({ delete: del });

    await guruChatSessionMemoryRepositoryDrizzle.deleteSessionMemory(19);

    expect(del).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
