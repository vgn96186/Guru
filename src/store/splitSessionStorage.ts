import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SECURE_SESSION_ID_KEY = 'session_secure_id';

/**
 * A custom storage adapter for Zustand that splits the persisted state.
 * Non-sensitive data (like large agenda/content objects) is saved plainly in AsyncStorage.
 * Sensitive data (like sessionId authentication tokens) is saved securely in SecureStore.
 */
const CHUNK_SIZE = 1000000; // 1MB chunks to be safe (Android limit is ~2MB)

/**
 * A custom storage adapter for Zustand that splits the persisted state.
 * Non-sensitive data is saved in AsyncStorage with chunking to avoid "Row too big" errors on Android.
 * Sensitive data (sessionId) is saved securely in SecureStore.
 */
export const splitSessionStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      // 1. Read the manifest or plain string
      let manifestOrPlain: string | null = null;
      try {
        manifestOrPlain = await AsyncStorage.getItem(name);
      } catch (e) {
        // If this fails with "Row too big", we MUST clear it to recover
        console.error('[splitSessionStorage] Manifest too big to read, clearing for recovery:', e);
        await AsyncStorage.removeItem(name);
        return null;
      }
      if (!manifestOrPlain) return null;

      let fullValue: string;
      try {
        const manifest = JSON.parse(manifestOrPlain);
        if (manifest && manifest.__is_chunked__) {
          // Reassemble chunks
          const chunks: string[] = [];
          for (let i = 0; i < manifest.chunkCount; i++) {
            const chunk = await AsyncStorage.getItem(`${name}_chunk_${i}`);
            if (chunk) chunks.push(chunk);
          }
          fullValue = chunks.join('');
        } else {
          fullValue = manifestOrPlain;
        }
      } catch {
        // Not a JSON manifest, treat as plain string
        fullValue = manifestOrPlain;
      }

      const plainStateObj = JSON.parse(fullValue);

      // 2. Rehydrate sensitive fields from SecureStore
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

      // 1. Extract and delete sensitive data for SecureStore
      const sessionId = stateObj.state?.sessionId;
      if (stateObj.state) {
        delete stateObj.state.sessionId;
      }

      const plainValue = JSON.stringify(stateObj);

      // 2. Clear old chunks if any (to avoid orphans)
      const oldManifestString = await AsyncStorage.getItem(name);
      if (oldManifestString) {
        try {
          const oldManifest = JSON.parse(oldManifestString);
          if (oldManifest && oldManifest.__is_chunked__) {
            for (let i = 0; i < oldManifest.chunkCount; i++) {
              await AsyncStorage.removeItem(`${name}_chunk_${i}`);
            }
          }
        } catch { /* ignore */ }
      }

      // 3. Save plain state (with chunking if large)
      if (plainValue.length > CHUNK_SIZE) {
        const chunkCount = Math.ceil(plainValue.length / CHUNK_SIZE);
        for (let i = 0; i < chunkCount; i++) {
          const chunk = plainValue.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await AsyncStorage.setItem(`${name}_chunk_${i}`, chunk);
        }
        // Save manifest
        await AsyncStorage.setItem(
          name,
          JSON.stringify({ __is_chunked__: true, chunkCount }),
        );
      } else {
        await AsyncStorage.setItem(name, plainValue);
      }

      // 4. Save sensitive state securely
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
      // Clean up manifest and any chunks
      const manifestString = await AsyncStorage.getItem(name);
      if (manifestString) {
        try {
          const manifest = JSON.parse(manifestString);
          if (manifest && manifest.__is_chunked__) {
            for (let i = 0; i < manifest.chunkCount; i++) {
              await AsyncStorage.removeItem(`${name}_chunk_${i}`);
            }
          }
        } catch { /* ignore */ }
      }
      await AsyncStorage.removeItem(name);
      await SecureStore.deleteItemAsync(SECURE_SESSION_ID_KEY);
    } catch (e) {
      console.error('[splitSessionStorage] Failed to remove item:', e);
    }
  },
};
