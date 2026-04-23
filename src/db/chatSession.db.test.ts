import { resetDbSingleton, setDbForTests } from './database';
import { createTestDatabase } from './testing/createTestDatabase';
import {
  clearChatHistory,
  createGuruChatThread,
  deleteGuruChatThread,
  getChatHistory,
  getChatMessageCount,
  getGuruChatThreadById,
  listGuruChatThreads,
  renameGuruChatThread,
  saveChatMessage,
} from './queries/aiCache';
import {
  deleteSessionMemory,
  getSessionMemoryRow,
  upsertSessionMemory,
} from './queries/guruChatMemory';

describe('DB integration (in-memory SQLite)', () => {
  let dispose: () => void;

  beforeEach(() => {
    resetDbSingleton();
    const sqlite = createTestDatabase();
    const d = () => {};
    dispose = d;
    setDbForTests(sqlite);
  });

  afterEach(() => {
    resetDbSingleton();
    dispose();
  });

  it('persists chat_history and loads in order', async () => {
    const thread = await createGuruChatThread('Cardiology');
    await saveChatMessage(thread.id, 'Cardiology', 'user', 'hello', 1000);
    await saveChatMessage(thread.id, 'Cardiology', 'guru', 'hi there', 2000);

    const rows = await getChatHistory(thread.id, 20);
    expect(rows).toHaveLength(2);
    expect(rows[0].role).toBe('user');
    expect(rows[1].role).toBe('guru');
    expect(await getChatMessageCount(thread.id)).toBe(2);
  });

  it('clearChatHistory removes messages and guru_chat_session_memory', async () => {
    const thread = await createGuruChatThread('Renal');
    await saveChatMessage(thread.id, 'Renal', 'user', 'q', 1);
    await upsertSessionMemory(thread.id, 'Renal', 'old summary', 3);

    await clearChatHistory('Renal');

    expect(await getChatMessageCount(thread.id)).toBe(0);
    expect(await getSessionMemoryRow(thread.id)).toBeNull();
  });

  it('session memory upsert and delete', async () => {
    const thread = await createGuruChatThread('TopicA');
    await upsertSessionMemory(thread.id, 'TopicA', 'summary text', 10);
    const row = await getSessionMemoryRow(thread.id);
    expect(row?.summaryText).toBe('summary text');
    expect(row?.stateJson).toBe('{}');
    expect(row?.messagesAtLastSummary).toBe(10);

    await deleteSessionMemory(thread.id);
    expect(await getSessionMemoryRow(thread.id)).toBeNull();
  });

  it('lists, renames, and deletes Guru chat threads', async () => {
    const thread = await createGuruChatThread('Neurology');
    await saveChatMessage(
      thread.id,
      'Neurology',
      'user',
      'What is internuclear ophthalmoplegia?',
      3000,
    );

    const listed = await listGuruChatThreads(10);
    expect(listed[0]?.id).toBe(thread.id);
    expect(listed[0]?.lastMessagePreview).toContain('internuclear ophthalmoplegia');

    await renameGuruChatThread(thread.id, 'INO revision');
    const renamed = await getGuruChatThreadById(thread.id);
    expect(renamed?.title).toBe('INO revision');

    await deleteGuruChatThread(thread.id);
    expect(await getGuruChatThreadById(thread.id)).toBeNull();
  });
});
