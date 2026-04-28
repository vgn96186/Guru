import { renderHook } from '@testing-library/react-native';
import { useStudyPlanController } from './useStudyPlanController';

// Mock dependencies
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => callback()),
}));

jest.mock('../../../services/studyPlanner', () => ({
  generateStudyPlan: jest.fn().mockResolvedValue({ plan: [], summary: {} }),
}));

jest.mock('../../../hooks/queries/useProfile', () => {
  return {
    useProfileQuery: () => ({ data: { studyResourceMode: 'hybrid', examType: 'NEET' } }),
    useProfileActions: () => ({ setStudyResourceMode: jest.fn() }),
  };
});

jest.mock('../../../navigation/typedHooks', () => ({
  MenuNav: { useNav: () => ({ navigate: jest.fn() }) },
}));

jest.mock('../../../navigation/navigationRef', () => ({
  navigationRef: { isReady: () => false, navigate: jest.fn() },
}));

jest.mock('../../../db/queries/sessions', () => ({
  getCompletedTopicIdsBetween: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../db/queries/topics', () => ({
  getTopicsDueForReview: jest.fn().mockResolvedValue([]),
  getAllTopicsWithProgress: jest.fn().mockResolvedValue([]),
}));

describe('useStudyPlanController', () => {
  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useStudyPlanController());
    
    expect(result.current.plan).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.planMode).toBe('balanced');
    expect(result.current.resourceMode).toBe('hybrid');
  });
});
