import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SECURE_SESSION_ID_KEY = 'session_secure_id';

/**
 * A custom storage adapter for Zustand that splits the persisted state.
 * Non-sensitive data (like large agenda/content objects) is saved plainly in AsyncStorage.
 * Sensitive data (like sessionId authentication tokens) is saved securely in SecureStore.
 */
export const splitSessionStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const plainStateString = await AsyncStorage.getItem(name);
      if (!plainStateString) return null;

      const plainStateObj = JSON.parse(plainStateString);

      // Rehydrate sensitive fields from SecureStore if they exist
      const secureSessionIdString = await SecureStore.getItemAsync(SECURE_SESSION_ID_KEY);
      if (secureSessionIdString) {
        try {
          plainStateObj.state.sessionId = JSON.parse(secureSessionIdString);
        } catch {
          // Ignore parse errors for secure items
        }
      }

      return JSON.stringify(plainStateObj);
    } catch (e) {
      console.error('[splitSessionStorage] Failed to get item:', e);
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const stateObj = JSON.parse(value);

      // Extract sensitive data
      const sessionId = stateObj.state?.sessionId;

      // Remove sensitive data from the plain object to be saved in AsyncStorage
      if (stateObj.state) {
        delete stateObj.state.sessionId;
      }

      // Save plain state
      await AsyncStorage.setItem(name, JSON.stringify(stateObj));

      // Save sensitive state securely
      if (sessionId !== undefined && sessionId !== null) {
        await SecureStore.setItemAsync(SECURE_SESSION_ID_KEY, JSON.stringify(sessionId));
      } else {
        await SecureStore.deleteItemAsync(SECURE_SESSION_ID_KEY);
      }
    } catch (e) {
      console.error('[splitSessionStorage] Failed to set item:', e);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
      await SecureStore.deleteItemAsync(SECURE_SESSION_ID_KEY);
    } catch (e) {
      console.error('[splitSessionStorage] Failed to remove item:', e);
    }
  },
};
