import { getDrizzleDb } from '../drizzle';
import { guruChatRepositoryDrizzle } from './guruChatRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type GuruChatThreadRow = {
  id: number;
  topicName: string;
  syllabusTopicId: number | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessagePreview: string;
};

type ChatHistoryRow = {
  id: number;
  threadId: number | null;
  topicName: string;
  role: 'user' | 'guru';
  message: string;
  timestamp: number;
  sourcesJson: string | null;
  modelUsed: string | null;
};

function buildThreadSelectChain(rows: GuruChatThreadRow[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ limit, orderBy });
  const from = jest.fn().mockReturnValue({ where, orderBy });
  const select = jest.fn().mockReturnValue({ from });
  return { select, from, where, orderBy, limit };
}

function buildHistorySelectChain(rows: ChatHistoryRow[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select, from, where, orderBy, limit };
}

describe('guruChatRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createGuruChatThread inserts a normalized thread and returns the mapped record', async () => {
    const insertReturning = jest.fn().mockResolvedValue([{ id: 14 }]);
    const insertValues = jest.fn().mockReturnValue({ returning: insertReturning });
    const insert = jest.fn().mockReturnValue({ values: insertValues });
    const selectChain = buildThreadSelectChain([
      {
        id: 14,
        topicName: 'Cardiology',
        syllabusTopicId: 3,
        title: 'Cardiology',
        createdAt: 1711000000000,
        updatedAt: 1711000000000,
        lastMessageAt: 1711000000000,
        lastMessagePreview: '',
      },
    ]);

    (getDrizzleDb as jest.Mock).mockReturnValue({
      insert,
      select: selectChain.select,
    });

    const result = await guruChatRepositoryDrizzle.createGuruChatThread('Cardiology', 3, '   ');

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        topicName: 'Cardiology',
        syllabusTopicId: 3,
        title: 'Cardiology',
        lastMessagePreview: '',
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        lastMessageAt: expect.any(Number),
      }),
    );
    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: 14,
      topicName: 'Cardiology',
      syllabusTopicId: 3,
      title: 'Cardiology',
      createdAt: 1711000000000,
      updatedAt: 1711000000000,
      lastMessageAt: 1711000000000,
      lastMessagePreview: '',
    });
  });

  it('getGuruChatThreadById returns null when the thread does not exist', async () => {
    const selectChain = buildThreadSelectChain([]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: selectChain.select });

    const result = await guruChatRepositoryDrizzle.getGuruChatThreadById(999);

    expect(result).toBeNull();
    expect(selectChain.limit).toHaveBeenCalledWith(1);
  });

  it('listGuruChatThreads returns mapped rows ordered by latest activity and honors the default limit', async () => {
    const selectChain = buildThreadSelectChain([
      {
        id: 9,
        topicName: 'Renal',
        syllabusTopicId: null,
        title: 'AKI doubt',
        createdAt: 1711000000000,
        updatedAt: 1711000100000,
        lastMessageAt: 1711000200000,
        lastMessagePreview: 'User asked about prerenal AKI...',
      },
    ]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: selectChain.select });

    const result = await guruChatRepositoryDrizzle.listGuruChatThreads();

    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(40);
    expect(result).toEqual([
      {
        id: 9,
        topicName: 'Renal',
        syllabusTopicId: null,
        title: 'AKI doubt',
        createdAt: 1711000000000,
        updatedAt: 1711000100000,
        lastMessageAt: 1711000200000,
        lastMessagePreview: 'User asked about prerenal AKI...',
      },
    ]);
  });

  it('saveChatMessage inserts history and updates thread preview while promoting a user message into the title when the title is blank', async () => {
    const historyValues = jest.fn().mockResolvedValue(undefined);
    const historyInsert = jest.fn().mockReturnValue({ values: historyValues });
    const updateSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    const update = jest.fn().mockReturnValue({ set: updateSet });
    const selectChain = buildThreadSelectChain([
      {
        id: 77,
        topicName: 'Medicine',
        syllabusTopicId: null,
        title: '',
        createdAt: 1711999990000,
        updatedAt: 1711999995000,
        lastMessageAt: 1711999995000,
        lastMessagePreview: '',
      },
    ]);

    (getDrizzleDb as jest.Mock).mockReturnValue({
      insert: historyInsert,
      select: selectChain.select,
      update,
    });

    await guruChatRepositoryDrizzle.saveChatMessage(
      77,
      'Medicine',
      'user',
      '  Explain the mechanism of hyponatremia in SIADH with a long enough prompt to force clipping in the generated thread title preview.  ',
      1712000000000,
      '[{"label":"Source A"}]',
      'gemini/test',
    );

    expect(historyValues).toHaveBeenCalledWith({
      threadId: 77,
      topicName: 'Medicine',
      role: 'user',
      message:
        '  Explain the mechanism of hyponatremia in SIADH with a long enough prompt to force clipping in the generated thread title preview.  ',
      timestamp: 1712000000000,
      sourcesJson: '[{"label":"Source A"}]',
      modelUsed: 'gemini/test',
    });
    expect(updateSet).toHaveBeenCalledWith({
      updatedAt: 1712000000000,
      lastMessageAt: 1712000000000,
      lastMessagePreview:
        'Explain the mechanism of hyponatremia in SIADH with a long enough prompt to force clipping in th...',
      title: 'Explain the mechanism of hyponatremia in SIADH with a lo...',
    });
  });

  it('getChatHistory returns legacy-shaped history records ordered by timestamp and defaults optional fields to undefined', async () => {
    const selectChain = buildHistorySelectChain([
      {
        id: 1,
        threadId: 14,
        topicName: 'Cardiology',
        role: 'user',
        message: 'What causes pulsus paradoxus?',
        timestamp: 1710000000000,
        sourcesJson: null,
        modelUsed: null,
      },
      {
        id: 2,
        threadId: 14,
        topicName: 'Cardiology',
        role: 'guru',
        message: 'Think tamponade and severe asthma first.',
        timestamp: 1710000005000,
        sourcesJson: '[{"kind":"pubmed"}]',
        modelUsed: 'gemini/pro',
      },
    ]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: selectChain.select });

    const result = await guruChatRepositoryDrizzle.getChatHistory(14);

    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(20);
    expect(result).toEqual([
      {
        id: 1,
        threadId: 14,
        topicName: 'Cardiology',
        role: 'user',
        message: 'What causes pulsus paradoxus?',
        timestamp: 1710000000000,
        sourcesJson: undefined,
        modelUsed: undefined,
      },
      {
        id: 2,
        threadId: 14,
        topicName: 'Cardiology',
        role: 'guru',
        message: 'Think tamponade and severe asthma first.',
        timestamp: 1710000005000,
        sourcesJson: '[{"kind":"pubmed"}]',
        modelUsed: 'gemini/pro',
      },
    ]);
  });
});
