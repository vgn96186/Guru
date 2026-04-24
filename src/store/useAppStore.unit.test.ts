import { useAppStore } from './useAppStore';

describe('useAppStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      dailyAvailability: null,
      todayPlan: null,
      planGeneratedAt: null,
      isRecoveringBackground: false,
    });
  });

  it('should initialize with default state', () => {
    const state = useAppStore.getState();
    expect(state.isRecoveringBackground).toBe(false);
  });

  describe('setters', () => {
    it('should set daily availability', () => {
      useAppStore.getState().setDailyAvailability(30);
      expect(useAppStore.getState().dailyAvailability).toBe(30);
    });

    it('should set today plan and generated timestamp', () => {
      const plan = { tasks: [] } as any;
      useAppStore.getState().setTodayPlan(plan);
      expect(useAppStore.getState().todayPlan).toBe(plan);
      expect(useAppStore.getState().planGeneratedAt).toBeGreaterThan(0);
    });

    it('should clear today plan and timestamp', () => {
      useAppStore.getState().setTodayPlan(null);
      expect(useAppStore.getState().todayPlan).toBeNull();
      expect(useAppStore.getState().planGeneratedAt).toBeNull();
    });
  });
});
