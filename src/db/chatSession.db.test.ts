import { resetDbSingleton, setDbForTests } from './database';
import { createTestDatabase } from './testing/createTestDatabase';
import {
  clearChatHistory,
  getChatHistory,
  getChatMessageCount,
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
    const { sqlite, dispose: d } = createTestDatabase();
    dispose = d;
    setDbForTests(sqlite);
  });

  afterEach(() => {
    resetDbSingleton();
    dispose();
  });

  it('persists chat_history and loads in order', async () => {
    await saveChatMessage('Cardiology', 'user', 'hello', 1000);
    await saveChatMessage('Cardiology', 'guru', 'hi there', 2000);

    const rows = await getChatHistory('Cardiology', 20);
    expect(rows).toHaveLength(2);
    expect(rows[0].role).toBe('user');
    expect(rows[1].role).toBe('guru');
    expect(await getChatMessageCount('Cardiology')).toBe(2);
  });

  it('clearChatHistory removes messages and guru_chat_session_memory', async () => {
    await saveChatMessage('Renal', 'user', 'q', 1);
    await upsertSessionMemory('Renal', 'old summary', 3);

    await clearChatHistory('Renal');

    expect(await getChatMessageCount('Renal')).toBe(0);
    expect(await getSessionMemoryRow('Renal')).toBeNull();
  });

  it('session memory upsert and delete', async () => {
    await upsertSessionMemory('TopicA', 'summary text', 10);
    const row = await getSessionMemoryRow('TopicA');
    expect(row?.summaryText).toBe('summary text');
    expect(row?.messagesAtLastSummary).toBe(10);

    await deleteSessionMemory('TopicA');
    expect(await getSessionMemoryRow('TopicA')).toBeNull();
  });
});
