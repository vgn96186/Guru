import { renderHook, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { useAppBootstrap } from './useAppBootstrap';
import { useAppStore } from '../store/useAppStore';

const mockLoadProfile = jest.fn();
const mockRefreshProfile = jest.fn();
const mockSetDailyAvailability = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
const mockLinkingGetInitialUrl = jest.fn().mockResolvedValue(null);
const mockLinkingAddEventListener = jest.fn<unknown, ['url', (event: { url: string }) => void]>(
  () => ({ remove: jest.fn() }),
);
type StoreSelector = Parameters<typeof useAppStore>[0];

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: () => mockAddNotificationResponseReceivedListener(),
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
  SENTRY_DSN: '',
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

jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(),
  unzip: jest.fn(),
}));

describe('useAppBootstrap', () => {
  const mockedUseAppStore = useAppStore as jest.MockedFunction<typeof useAppStore> & {
    getState: jest.Mock;
  };
  let originalGetInitialURL: typeof Linking.getInitialURL | undefined;
  let originalAddEventListener: (typeof Linking)['addEventListener'] | undefined;
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

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
    mockLinkingGetInitialUrl.mockResolvedValue(null);
    mockLinkingAddEventListener.mockImplementation(() => ({ remove: jest.fn() }));
    originalGetInitialURL = Linking.getInitialURL;
    originalAddEventListener = (Linking as typeof Linking & { addEventListener?: unknown })
      .addEventListener as typeof Linking.addEventListener | undefined;
    Object.defineProperty(Linking, 'getInitialURL', {
      configurable: true,
      value: () => mockLinkingGetInitialUrl(),
    });
    Object.defineProperty(Linking, 'addEventListener', {
      configurable: true,
      value: (type: 'url', handler: (event: { url: string }) => void) =>
        mockLinkingAddEventListener(type, handler) as unknown as ReturnType<
          NonNullable<typeof Linking.addEventListener>
        >,
    });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => {
    Object.defineProperty(Linking, 'getInitialURL', {
      configurable: true,
      value: originalGetInitialURL,
    });
    Object.defineProperty(Linking, 'addEventListener', {
      configurable: true,
      value: originalAddEventListener,
    });
    alertSpy.mockRestore();
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
