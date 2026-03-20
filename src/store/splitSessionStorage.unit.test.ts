import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
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

describe('splitSessionStorage', () => {
  const SECURE_SESSION_ID_KEY = 'session_secure_id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getItem', () => {
    it('should return null if AsyncStorage.getItem returns null', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await splitSessionStorage.getItem('test-key');
      expect(result).toBeNull();
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('test-key');
    });

    it('should return plain state if SecureStore has no session ID', async () => {
      const plainState = { state: { data: 'test' } };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(plainState));
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await splitSessionStorage.getItem('test-key');
      expect(JSON.parse(result!)).toEqual(plainState);
    });

    it('should rehydrate sessionId from SecureStore', async () => {
      const plainState = { state: { data: 'test' } };
      const sessionId = 'secure-id-123';
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(plainState));
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(sessionId));

      const result = await splitSessionStorage.getItem('test-key');
      const parsedResult = JSON.parse(result!);
      expect(parsedResult.state.sessionId).toBe(sessionId);
      expect(parsedResult.state.data).toBe('test');
    });

    it('should ignore SecureStore parse errors', async () => {
      const plainState = { state: { data: 'test' } };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(plainState));
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json');

      const result = await splitSessionStorage.getItem('test-key');
      const parsedResult = JSON.parse(result!);
      expect(parsedResult.state.sessionId).toBeUndefined();
      expect(parsedResult.state.data).toBe('test');
    });

    it('should catch and log errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Async error'));

      const result = await splitSessionStorage.getItem('test-key');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setItem', () => {
    it('should split and save data correctly', async () => {
      const sessionId = 'secure-id-123';
      const stateToSave = {
        state: {
          data: 'test',
          sessionId: sessionId
        }
      };

      await splitSessionStorage.setItem('test-key', JSON.stringify(stateToSave));

      // AsyncStorage should not have sessionId
      const asyncStorageCall = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const savedPlainState = JSON.parse(asyncStorageCall[1]);
      expect(savedPlainState.state.sessionId).toBeUndefined();
      expect(savedPlainState.state.data).toBe('test');

      // SecureStore should have sessionId
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_SESSION_ID_KEY, JSON.stringify(sessionId));
    });

    it('should delete secure session ID if not present in state', async () => {
      const stateToSave = { state: { data: 'test' } };
      await splitSessionStorage.setItem('test-key', JSON.stringify(stateToSave));

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_SESSION_ID_KEY);
    });

    it('should catch and log errors during setItem', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Async set error'));

      const stateToSave = { state: { data: 'test' } };
      await splitSessionStorage.setItem('test-key', JSON.stringify(stateToSave));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('removeItem', () => {
    it('should remove items from both storages', async () => {
      await splitSessionStorage.removeItem('test-key');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_SESSION_ID_KEY);
    });

    it('should catch and log errors during removeItem', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValue(new Error('Async remove error'));

      await splitSessionStorage.removeItem('test-key');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
