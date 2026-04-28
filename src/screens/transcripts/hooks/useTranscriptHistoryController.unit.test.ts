import { renderHook } from '@testing-library/react-native';
import { useTranscriptHistoryController } from './useTranscriptHistoryController';

// Mock dependencies
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => callback()),
}));

jest.mock('../../../hooks/useScrollRestoration', () => ({
  useScrollRestoration: () => ({ onScroll: jest.fn(), onContentSizeChange: jest.fn(), listRef: { current: null } }),
  usePersistedInput: (key: string, init: string) => [init, jest.fn()],
}));

jest.mock('../../../navigation/typedHooks', () => ({
  MenuNav: {
    useNav: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
    useRoute: () => ({ params: {} }),
  },
}));

jest.mock('../../../db/queries/aiCache', () => ({
  getLectureHistory: jest.fn().mockResolvedValue([]),
  searchLectureNotes: jest.fn().mockResolvedValue([]),
  deleteLectureNote: jest.fn(),
  updateLectureTranscriptNote: jest.fn(),
  updateLectureTranscriptSummary: jest.fn(),
  getLectureNoteById: jest.fn().mockResolvedValue(null),
}));

describe('useTranscriptHistoryController', () => {
  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useTranscriptHistoryController());
    
    expect(result.current.notes).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.sortBy).toBe('date');
    expect(result.current.managerFilter).toBe('all');
  });
});
