import { renderHook, waitFor } from '@testing-library/react-native';
import { useGuruPresence } from './useGuruPresence';

const mockGenerateGuruPresenceMessages = jest.fn();

jest.mock('../services/aiService', () => ({
  generateGuruPresenceMessages: (...args: unknown[]) => mockGenerateGuruPresenceMessages(...args),
}));

describe('useGuruPresence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateGuruPresenceMessages.mockResolvedValue([
      { text: 'Stay with this topic.', trigger: 'periodic' },
    ]);
  });

  it('generates messages from the active topic, not the full agenda', async () => {
    renderHook(() =>
      useGuruPresence({
        currentTopicIdentity: 'topic-b',
        currentTopicName: 'Topic B',
        allTopicNames: ['Topic A', 'Topic B', 'Topic C'],
        isActive: true,
      }),
    );

    await waitFor(() => {
      expect(mockGenerateGuruPresenceMessages).toHaveBeenCalledWith(
        ['Topic B'],
        ['Topic A', 'Topic B', 'Topic C'],
      );
    });
  });

  it('regenerates when the active topic changes', async () => {
    const { rerender } = renderHook(
      ({
        currentTopicIdentity,
        currentTopicName,
      }: {
        currentTopicIdentity: string;
        currentTopicName: string;
      }) =>
        useGuruPresence({
          currentTopicIdentity,
          currentTopicName,
          allTopicNames: ['Topic A', 'Topic B'],
          isActive: true,
        }),
      {
        initialProps: { currentTopicIdentity: 'topic-a', currentTopicName: 'Topic A' },
      },
    );

    await waitFor(() => {
      expect(mockGenerateGuruPresenceMessages).toHaveBeenCalledWith(
        ['Topic A'],
        ['Topic A', 'Topic B'],
      );
    });

    rerender({ currentTopicIdentity: 'topic-b', currentTopicName: 'Topic B' });

    await waitFor(() => {
      expect(mockGenerateGuruPresenceMessages).toHaveBeenCalledWith(
        ['Topic B'],
        ['Topic A', 'Topic B'],
      );
    });
  });

  it('regenerates when the active topic identity changes even if the visible name stays the same', async () => {
    const { rerender } = renderHook(
      ({ currentTopicIdentity }: { currentTopicIdentity: string }) =>
        useGuruPresence({
          currentTopicIdentity,
          currentTopicName: 'Cardiac Cycle',
          allTopicNames: ['Cardiac Cycle', 'Cardiac Cycle'],
          isActive: true,
        }),
      {
        initialProps: { currentTopicIdentity: 'physiology-11' },
      },
    );

    await waitFor(() => {
      expect(mockGenerateGuruPresenceMessages).toHaveBeenCalledTimes(1);
    });

    rerender({ currentTopicIdentity: 'medicine-42' });

    await waitFor(() => {
      expect(mockGenerateGuruPresenceMessages).toHaveBeenCalledTimes(2);
    });
  });
});
