import { useAppStore } from './useAppStore';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { getLevelInfo } from '../services/xpService';
import { isLocalLlmAllowedOnThisDevice, getLocalLlmRamWarning } from '../services/deviceMemory';
import { showToast } from '../components/Toast';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';

// Mock repositories
jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
  dailyLogRepository: {
    getDailyLog: jest.fn(),
  },
}));

// Mock services
jest.mock('../services/xpService', () => ({
  getLevelInfo: jest.fn(),
}));

jest.mock('../services/deviceMemory', () => ({
  isLocalLlmAllowedOnThisDevice: jest.fn(),
  getLocalLlmRamWarning: jest.fn(),
}));

jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('../services/databaseEvents', () => ({
  dbEvents: {
    on: jest.fn(),
  },
  DB_EVENT_KEYS: {
    LECTURE_SAVED: 'LECTURE_SAVED',
    TRANSCRIPT_RECOVERED: 'TRANSCRIPT_RECOVERED',
    PROGRESS_UPDATED: 'PROGRESS_UPDATED',
    PROFILE_UPDATED: 'PROFILE_UPDATED',
  },
}));

describe('useAppStore', () => {
  const mockProfile = {
    totalXp: 100,
    currentLevel: 1,
    focusAudioEnabled: false,
    visualTimersEnabled: false,
    faceTrackingEnabled: false,
    useLocalModel: false,
  };

  const mockLevelInfo = { level: 1, xpToNext: 100 };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Zustand state manually if needed, but since it's a hook we might need to be careful.
    // However, Zustand's 'create' returns the hook which also has 'getState' and 'setState'.
    useAppStore.setState({
      profile: null,
      levelInfo: null,
      loading: false,
      hasCheckedInToday: false,
      dailyAvailability: null,
      todayPlan: null,
      planGeneratedAt: null,
      isRecoveringBackground: false,
    });
  });

  it('should initialize with default state', () => {
    const state = useAppStore.getState();
    expect(state.profile).toBeNull();
    expect(state.loading).toBe(false);
  });

  describe('loadProfile', () => {
    it('should load profile and daily log successfully', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue(mockProfile);
      (getLevelInfo as jest.Mock).mockReturnValue(mockLevelInfo);
      (dailyLogRepository.getDailyLog as jest.Mock).mockResolvedValue({ checkedIn: true });

      await useAppStore.getState().loadProfile();

      const state = useAppStore.getState();
      expect(state.profile).toEqual(mockProfile);
      expect(state.levelInfo).toEqual(mockLevelInfo);
      expect(state.hasCheckedInToday).toBe(true);
      expect(state.loading).toBe(false);
    });

    it('should handle errors during loadProfile', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (profileRepository.getProfile as jest.Mock).mockRejectedValue(new Error('Load failed'));

      await useAppStore.getState().loadProfile();

      const state = useAppStore.getState();
      expect(state.profile).toBeNull();
      expect(state.loading).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not load if already loading', async () => {
      useAppStore.setState({ loading: true });
      await useAppStore.getState().loadProfile();
      expect(profileRepository.getProfile).not.toHaveBeenCalled();
    });
  });

  describe('refreshProfile', () => {
    it('should refresh profile successfully', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue(mockProfile);
      (getLevelInfo as jest.Mock).mockReturnValue(mockLevelInfo);
      (dailyLogRepository.getDailyLog as jest.Mock).mockResolvedValue({ checkedIn: false });

      await useAppStore.getState().refreshProfile();

      const state = useAppStore.getState();
      expect(state.profile).toEqual(mockProfile);
      expect(state.loading).toBe(false);
    });

    it('should handle errors during refreshProfile without clearing state', async () => {
      useAppStore.setState({ profile: mockProfile as any });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(); // Actually refreshProfile uses console.error in catch, wait let me check
      // Re-reading code: refreshProfile uses console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (profileRepository.getProfile as jest.Mock).mockRejectedValue(new Error('Refresh failed'));

      await useAppStore.getState().refreshProfile();

      const state = useAppStore.getState();
      expect(state.profile).toEqual(mockProfile); // Still has old profile
      expect(state.loading).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
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

  describe('optimistic updates (makeProfileSetter)', () => {
    beforeEach(() => {
      useAppStore.setState({ profile: { ...mockProfile } as any });
    });

    it('should toggle focus audio optimistically', async () => {
      (profileRepository.updateProfile as jest.Mock).mockResolvedValue(undefined);
      
      await useAppStore.getState().toggleFocusAudio();
      
      expect(useAppStore.getState().profile?.focusAudioEnabled).toBe(true);
      expect(profileRepository.updateProfile).toHaveBeenCalledWith({ focusAudioEnabled: true });
    });

    it('should rollback focus audio on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (profileRepository.updateProfile as jest.Mock).mockRejectedValue(new Error('Update failed'));
      
      await useAppStore.getState().toggleFocusAudio();
      
      expect(useAppStore.getState().profile?.focusAudioEnabled).toBe(false); // Rolled back
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
      consoleSpy.mockRestore();
    });

    it('should toggle visual timers', async () => {
      await useAppStore.getState().toggleVisualTimers();
      expect(useAppStore.getState().profile?.visualTimersEnabled).toBe(true);
    });

    it('should toggle face tracking', async () => {
      await useAppStore.getState().toggleFaceTracking();
      expect(useAppStore.getState().profile?.faceTrackingEnabled).toBe(true);
    });
  });

  describe('setUseLocalModel', () => {
    it('should prevent enabling if not allowed on device', async () => {
      useAppStore.setState({ profile: { ...mockProfile } as any });
      (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(false);
      (getLocalLlmRamWarning as jest.Mock).mockReturnValue('Low RAM');

      await useAppStore.getState().setUseLocalModel(true);

      expect(useAppStore.getState().profile?.useLocalModel).toBe(false);
      expect(showToast).toHaveBeenCalledWith('Low RAM', 'warning');
      expect(profileRepository.updateProfile).toHaveBeenCalledWith({ useLocalModel: false });
    });

    it('should allow enabling if allowed on device', async () => {
      useAppStore.setState({ profile: { ...mockProfile } as any });
      (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
      (profileRepository.updateProfile as jest.Mock).mockResolvedValue(undefined);

      await useAppStore.getState().setUseLocalModel(true);

      expect(useAppStore.getState().profile?.useLocalModel).toBe(true);
      expect(profileRepository.updateProfile).toHaveBeenCalledWith({ useLocalModel: true });
    });
  });

  describe('event listeners', () => {
    it('should have registered listeners', () => {
      // Re-import the store in an isolated module to check registration calls
      jest.isolateModules(() => {
        const { dbEvents: localDbEvents } = require('../services/databaseEvents');
        // The mock is already active for the entire file, 
        // but isolateModules will re-run the useAppStore initialization.
        require('./useAppStore');
        
        expect(localDbEvents.on).toHaveBeenCalledWith(DB_EVENT_KEYS.LECTURE_SAVED, expect.any(Function));
        expect(localDbEvents.on).toHaveBeenCalledWith(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED, expect.any(Function));
        expect(localDbEvents.on).toHaveBeenCalledWith(DB_EVENT_KEYS.PROGRESS_UPDATED, expect.any(Function));
        expect(localDbEvents.on).toHaveBeenCalledWith(DB_EVENT_KEYS.PROFILE_UPDATED, expect.any(Function));
      });
    });
  });
});
