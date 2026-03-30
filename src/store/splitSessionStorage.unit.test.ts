import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { splitSessionStorage } from './splitSessionStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/documents/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
}));

describe('splitSessionStorage', () => {
  const SECURE_SESSION_ID_KEY = 'session_secure_id';
  const EXPECTED_FILE = 'file:///mock/documents/guru_zustand_test-key.json';

  beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { fetch?: typeof fetch }).fetch = jest.fn().mockResolvedValue({});
  });

  describe('getItem', () => {
    it('should read plain state from file when present', async () => {
      const plainState = { state: { data: 'test' } };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(plainState));
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await splitSessionStorage.getItem('test-key');
      expect(JSON.parse(result!)).toEqual(plainState);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(EXPECTED_FILE);
      expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    });

    it('should fall back to AsyncStorage when file missing and migrate', async () => {
      const plainState = { state: { data: 'test' } };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(plainState));
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await splitSessionStorage.getItem('test-key');
      expect(JSON.parse(result!)).toEqual(plainState);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
      expect(FileSystem.moveAsync).toHaveBeenCalled();
    });

    it('should return null if neither file nor AsyncStorage have data', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await splitSessionStorage.getItem('test-key');
      expect(result).toBeNull();
    });

    it('should rehydrate sessionId from SecureStore', async () => {
      const plainState = { state: { data: 'test' } };
      const sessionId = 'secure-id-123';
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(plainState));
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(sessionId));

      const result = await splitSessionStorage.getItem('test-key');
      const parsedResult = JSON.parse(result!);
      expect(parsedResult.state.sessionId).toBe(sessionId);
      expect(parsedResult.state.data).toBe('test');
    });

    it('should ignore SecureStore parse errors', async () => {
      const plainState = { state: { data: 'test' } };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(plainState));
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json');

      const result = await splitSessionStorage.getItem('test-key');
      const parsedResult = JSON.parse(result!);
      expect(parsedResult.state.sessionId).toBeUndefined();
      expect(parsedResult.state.data).toBe('test');
    });

    it('should catch and log errors on corrupt file payload', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('not-json');
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await splitSessionStorage.getItem('test-key');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setItem', () => {
    it('should write file and strip sessionId from payload', async () => {
      const sessionId = 'secure-id-123';
      const stateToSave = {
        state: {
          data: 'test',
          sessionId: sessionId,
        },
      };

      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await splitSessionStorage.setItem('test-key', JSON.stringify(stateToSave));

      const tmpPath = `${EXPECTED_FILE}.tmp`;
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        tmpPath,
        expect.stringContaining('"data":"test"'),
      );
      const written = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1];
      expect(JSON.parse(written).state.sessionId).toBeUndefined();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        SECURE_SESSION_ID_KEY,
        JSON.stringify(sessionId),
      );
      expect(FileSystem.moveAsync).toHaveBeenCalledWith({ from: tmpPath, to: EXPECTED_FILE });
    });

    it('should delete secure session ID if not present in state', async () => {
      const stateToSave = { state: { data: 'test' } };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await splitSessionStorage.setItem('test-key', JSON.stringify(stateToSave));

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_SESSION_ID_KEY);
    });

    it('should fall back to direct write when moveAsync fails', async () => {
      const stateToSave = { state: { data: 'test' } };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      (FileSystem.moveAsync as jest.Mock).mockRejectedValue(new Error('rename failed'));

      await splitSessionStorage.setItem('test-key', JSON.stringify(stateToSave));

      expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        1,
        `${EXPECTED_FILE}.tmp`,
        expect.any(String),
      );
      expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        2,
        EXPECTED_FILE,
        expect.any(String),
      );
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${EXPECTED_FILE}.tmp`, {
        idempotent: true,
      });
    });

    it('should catch and log errors during setItem', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValue(new Error('FS write error'));

      const stateToSave = { state: { data: 'test' } };
      await splitSessionStorage.setItem('test-key', JSON.stringify(stateToSave));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('removeItem', () => {
    it('should remove file and legacy AsyncStorage and SecureStore', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await splitSessionStorage.removeItem('test-key');

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(EXPECTED_FILE, { idempotent: true });
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_SESSION_ID_KEY);
    });

    it('should continue removeItem when deleteAsync fails (idempotent cleanup)', async () => {
      (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('FS remove error'));
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await splitSessionStorage.removeItem('test-key');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_SESSION_ID_KEY);
    });
  });
});
