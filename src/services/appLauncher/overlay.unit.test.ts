import { Platform } from 'react-native';
import { ensureOverlayPermission, canDrawOverlays, requestOverlayPermission } from './overlay';

jest.mock('../../../modules/app-launcher', () => ({
  canDrawOverlays: jest.fn(),
  requestOverlayPermission: jest.fn(),
}));

describe('overlay service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
  });

  describe('ensureOverlayPermission', () => {
    it('returns true immediately on non-android platforms', async () => {
      (Platform as any).OS = 'ios';
      const result = await ensureOverlayPermission();
      expect(result).toBe(true);
      expect(canDrawOverlays).not.toHaveBeenCalled();
    });

    it('returns true if permission is already granted on android', async () => {
      (canDrawOverlays as jest.Mock).mockResolvedValue(true);
      const result = await ensureOverlayPermission();
      expect(result).toBe(true);
      expect(canDrawOverlays).toHaveBeenCalled();
    });

    it('requests permission and returns false if not already granted on android', async () => {
      (canDrawOverlays as jest.Mock).mockResolvedValue(false);
      (requestOverlayPermission as jest.Mock).mockResolvedValue(undefined);

      const result = await ensureOverlayPermission();
      expect(result).toBe(false);
      expect(requestOverlayPermission).toHaveBeenCalled();
    });

    it('returns false and warns if request fails', async () => {
      (canDrawOverlays as jest.Mock).mockResolvedValue(false);
      (requestOverlayPermission as jest.Mock).mockRejectedValue(new Error('Failed'));

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await ensureOverlayPermission();

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });
});
