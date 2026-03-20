import { PermissionsAndroid, Platform } from 'react-native';
import { requestRecordingPermissions } from './permissions';

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
      WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
      READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
    },
    check: jest.fn(),
    requestMultiple: jest.fn(),
  },
}));

describe('permissions service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
  });

  describe('requestRecordingPermissions', () => {
    it('returns true immediately on non-android platforms', async () => {
      (Platform as any).OS = 'ios';
      const result = await requestRecordingPermissions();
      expect(result).toBe(true);
      expect(PermissionsAndroid.check).not.toHaveBeenCalled();
    });

    it('returns true if all permissions are already granted', async () => {
      (PermissionsAndroid.check as jest.Mock).mockResolvedValue(true);
      const result = await requestRecordingPermissions();
      expect(result).toBe(true);
      expect(PermissionsAndroid.check).toHaveBeenCalledTimes(3);
      expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
    });

    it('requests missing permissions and returns true if RECORD_AUDIO is granted', async () => {
      (PermissionsAndroid.check as jest.Mock)
        .mockResolvedValueOnce(false) // RECORD_AUDIO
        .mockResolvedValueOnce(true)  // WRITE_EXTERNAL_STORAGE
        .mockResolvedValueOnce(true); // READ_EXTERNAL_STORAGE
      
      (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
        'android.permission.RECORD_AUDIO': 'granted',
      });

      const result = await requestRecordingPermissions();
      expect(result).toBe(true);
      expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith(['android.permission.RECORD_AUDIO']);
    });

    it('returns false if RECORD_AUDIO is denied', async () => {
      (PermissionsAndroid.check as jest.Mock).mockResolvedValue(false);
      (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
        'android.permission.RECORD_AUDIO': 'denied',
      });

      const result = await requestRecordingPermissions();
      expect(result).toBe(false);
    });

    it('returns false and warns if an error occurs', async () => {
      (PermissionsAndroid.check as jest.Mock).mockRejectedValue(new Error('Permission check error'));
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await requestRecordingPermissions();
      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });
});
