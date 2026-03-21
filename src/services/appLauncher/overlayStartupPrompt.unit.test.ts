import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import {
  maybePromptOverlayPermissionOnStartup,
  OVERLAY_STARTUP_PROMPT_KEY,
} from './overlayStartupPrompt';
import { canDrawOverlays, requestOverlayPermission } from '../../../modules/app-launcher';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../../../modules/app-launcher', () => ({
  canDrawOverlays: jest.fn(),
  requestOverlayPermission: jest.fn(),
}));

describe('overlayStartupPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (canDrawOverlays as jest.Mock).mockResolvedValue(false);
    (requestOverlayPermission as jest.Mock).mockResolvedValue(true);
  });

  it('does nothing on iOS', async () => {
    (Platform as any).OS = 'ios';

    await maybePromptOverlayPermissionOnStartup();

    expect(canDrawOverlays).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does nothing when overlay permission is already granted', async () => {
    (canDrawOverlays as jest.Mock).mockResolvedValue(true);

    await maybePromptOverlayPermissionOnStartup();

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('shows the startup prompt once when overlay permission is missing', async () => {
    await maybePromptOverlayPermissionOnStartup();

    expect(AsyncStorage.getItem).toHaveBeenCalledWith(OVERLAY_STARTUP_PROMPT_KEY);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(OVERLAY_STARTUP_PROMPT_KEY, 'shown');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Enable Lecture Bubble',
      expect.stringContaining('draw over other apps'),
      expect.any(Array),
    );
  });

  it('does not re-prompt after the marker is set', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('shown');

    await maybePromptOverlayPermissionOnStartup();

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('opens overlay settings when the user taps Enable', async () => {
    await maybePromptOverlayPermissionOnStartup();

    const buttons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const enableButton = buttons.find((button) => button.text === 'Enable');

    expect(enableButton).toBeTruthy();
    await enableButton?.onPress?.();

    expect(requestOverlayPermission).toHaveBeenCalledTimes(1);
  });
});
