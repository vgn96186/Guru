import { renderHook, waitFor } from '@testing-library/react-native';
import { useAppBootstrap } from './useAppBootstrap';
import { useAppStore } from '../store/useAppStore';

const mockLoadProfile = jest.fn();
const mockRefreshProfile = jest.fn();
const mockSetDailyAvailability = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
type StoreSelector = Parameters<typeof useAppStore>[0];

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: () =>
    mockAddNotificationResponseReceivedListener(),
}));

jest.mock('../store/useAppStore', () => {
  const useAppStore = jest.fn((selector: StoreSelector) =>
    selector({
      loadProfile: mockLoadProfile,
      refreshProfile: mockRefreshProfile,
      setDailyAvailability: mockSetDailyAvailability,
    } as unknown as Parameters<StoreSelector>[0]),
  );
  (useAppStore as typeof useAppStore & { getState: jest.Mock }).getState = jest.fn();
  return { useAppStore };
});

jest.mock('../services/examDateSyncService', () => ({
  syncExamDatesIfStale: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/notificationService', () => ({
  refreshAccountabilityNotificationsSafely: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../navigation/navigationRef', () => ({
  navigationRef: { isReady: jest.fn().mockReturnValue(false), navigate: jest.fn() },
}));

jest.mock('../db/repositories', () => ({
  dailyLogRepository: { checkinToday: jest.fn().mockResolvedValue(undefined) },
  profileRepository: { updateProfile: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../services/studyPlanner', () => ({
  invalidatePlanCache: jest.fn(),
}));

jest.mock('../config/appConfig', () => ({
  BUNDLED_GROQ_KEY: '',
  BUNDLED_HF_TOKEN: '',
  BUNDLED_OPENROUTER_KEY: '',
}));

jest.mock('../services/appLauncher/overlayStartupPrompt', () => ({
  maybePromptOverlayPermissionOnStartup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../hooks/useAppStateTransition', () => ({
  useAppStateTransition: jest.fn(),
}));

jest.mock('../services/appPermissions', () => ({
  requestNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/backgroundTasks', () => ({
  warmAiContentCache: jest.fn().mockResolvedValue(undefined),
}));

describe('useAppBootstrap', () => {
  const mockedUseAppStore = useAppStore as jest.MockedFunction<typeof useAppStore> & {
    getState: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAppStore.mockImplementation((selector: StoreSelector) =>
      selector({
        loadProfile: mockLoadProfile,
        refreshProfile: mockRefreshProfile,
        setDailyAvailability: mockSetDailyAvailability,
      } as unknown as Parameters<StoreSelector>[0]),
    );
    mockedUseAppStore.getState.mockReturnValue({
      hasCheckedInToday: false,
      profile: null,
    });
    mockAddNotificationResponseReceivedListener.mockImplementation(() => ({ remove: jest.fn() }));
  });

  it('reports fatal async bootstrap errors instead of letting them fail silently', async () => {
    const onFatalError = jest.fn();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLoadProfile.mockRejectedValue(new Error('bootstrap exploded'));

    renderHook(() => useAppBootstrap(onFatalError));

    await waitFor(() => {
      expect(onFatalError).toHaveBeenCalledWith('bootstrap exploded');
    });

    errorSpy.mockRestore();
  });
});
