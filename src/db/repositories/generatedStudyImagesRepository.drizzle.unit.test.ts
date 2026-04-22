import { getDrizzleDb } from '../drizzle';
import {
  generatedStudyImagesRepositoryDrizzle,
  type GeneratedStudyImageRow,
} from './generatedStudyImagesRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type MockDb = {
  insert: jest.Mock;
  select: jest.Mock;
};

const makeDb = (): MockDb => ({
  insert: jest.fn(),
  select: jest.fn(),
});

const makeRow = (overrides: Partial<GeneratedStudyImageRow> = {}): GeneratedStudyImageRow => ({
  id: 17,
  contextType: 'chat',
  contextKey: 'thread-1',
  topicId: 9,
  topicName: 'Aortic stenosis',
  lectureNoteId: 4,
  style: 'illustration',
  prompt: 'Generate a heart valve diagram',
  provider: 'openai',
  modelUsed: 'gpt-image-1',
  mimeType: 'image/png',
  localUri: 'file:///tmp/heart.png',
  remoteUrl: 'https://cdn.example.com/heart.png',
  width: 1024,
  height: 1024,
  createdAt: 1710000000000,
  ...overrides,
});

describe('generatedStudyImagesRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saveGeneratedStudyImage inserts a row and returns the mapped record shape', async () => {
    const db = makeDb();
    const returning = jest.fn().mockResolvedValue([{ id: 81 }]);
    const values = jest.fn(() => ({ returning }));
    db.insert.mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await generatedStudyImagesRepositoryDrizzle.saveGeneratedStudyImage({
      contextType: 'lecture_note',
      contextKey: 'note-12',
      topicId: null,
      topicName: 'Heart failure',
      lectureNoteId: 12,
      style: 'chart',
      prompt: 'Generate a flowchart of CHF management',
      provider: 'gemini',
      modelUsed: 'imagen-4',
      mimeType: 'image/webp',
      localUri: 'file:///tmp/chf.webp',
      remoteUrl: null,
      width: null,
      height: null,
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: 'lecture_note',
        contextKey: 'note-12',
        topicId: null,
        topicName: 'Heart failure',
        lectureNoteId: 12,
        style: 'chart',
        prompt: 'Generate a flowchart of CHF management',
        provider: 'gemini',
        modelUsed: 'imagen-4',
        mimeType: 'image/webp',
        localUri: 'file:///tmp/chf.webp',
        remoteUrl: null,
        width: null,
        height: null,
      }),
    );
    const insertedRow = (values.mock.calls as unknown as Array<[Record<string, unknown>]>).at(
      0,
    )?.[0];
    expect(insertedRow).toBeDefined();
    expect(typeof insertedRow?.createdAt).toBe('number');
    expect(result).toEqual({
      id: 81,
      contextType: 'lecture_note',
      contextKey: 'note-12',
      topicId: null,
      topicName: 'Heart failure',
      lectureNoteId: 12,
      style: 'chart',
      prompt: 'Generate a flowchart of CHF management',
      provider: 'gemini',
      modelUsed: 'imagen-4',
      mimeType: 'image/webp',
      localUri: 'file:///tmp/chf.webp',
      remoteUrl: null,
      width: null,
      height: null,
      createdAt: expect.any(Number),
    });
  });

  it('getGeneratedStudyImagesForContext returns mapped records ordered by query result', async () => {
    const db = makeDb();
    const orderBy = jest.fn().mockResolvedValue([
      makeRow(),
      makeRow({
        id: 16,
        createdAt: 1709999999999,
        style: 'chart',
      }),
    ]);
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await generatedStudyImagesRepositoryDrizzle.getGeneratedStudyImagesForContext(
      'chat',
      'thread-1',
    );

    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: 17,
        contextType: 'chat',
        contextKey: 'thread-1',
        topicId: 9,
        topicName: 'Aortic stenosis',
        lectureNoteId: 4,
        style: 'illustration',
        prompt: 'Generate a heart valve diagram',
        provider: 'openai',
        modelUsed: 'gpt-image-1',
        mimeType: 'image/png',
        localUri: 'file:///tmp/heart.png',
        remoteUrl: 'https://cdn.example.com/heart.png',
        width: 1024,
        height: 1024,
        createdAt: 1710000000000,
      },
      {
        id: 16,
        contextType: 'chat',
        contextKey: 'thread-1',
        topicId: 9,
        topicName: 'Aortic stenosis',
        lectureNoteId: 4,
        style: 'chart',
        prompt: 'Generate a heart valve diagram',
        provider: 'openai',
        modelUsed: 'gpt-image-1',
        mimeType: 'image/png',
        localUri: 'file:///tmp/heart.png',
        remoteUrl: 'https://cdn.example.com/heart.png',
        width: 1024,
        height: 1024,
        createdAt: 1709999999999,
      },
    ]);
  });

  it('listGeneratedStudyImages uses the provided limit and maps nullable fields', async () => {
    const db = makeDb();
    const limit = jest.fn().mockResolvedValue([
      makeRow({
        topicId: null,
        lectureNoteId: null,
        remoteUrl: null,
        width: null,
        height: null,
      }),
    ]);
    const orderBy = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ orderBy }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await generatedStudyImagesRepositoryDrizzle.listGeneratedStudyImages(25);

    expect(limit).toHaveBeenCalledWith(25);
    expect(result).toEqual([
      {
        id: 17,
        contextType: 'chat',
        contextKey: 'thread-1',
        topicId: null,
        topicName: 'Aortic stenosis',
        lectureNoteId: null,
        style: 'illustration',
        prompt: 'Generate a heart valve diagram',
        provider: 'openai',
        modelUsed: 'gpt-image-1',
        mimeType: 'image/png',
        localUri: 'file:///tmp/heart.png',
        remoteUrl: null,
        width: null,
        height: null,
        createdAt: 1710000000000,
      },
    ]);
  });

  it('listGeneratedStudyImages defaults to 500 when limit is omitted', async () => {
    const db = makeDb();
    const limit = jest.fn().mockResolvedValue([]);
    const orderBy = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ orderBy }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await generatedStudyImagesRepositoryDrizzle.listGeneratedStudyImages();

    expect(limit).toHaveBeenCalledWith(500);
  });
});
