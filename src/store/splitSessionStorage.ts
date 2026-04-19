import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

const SECURE_SESSION_ID_KEY = 'session_secure_id';

/** @deprecated Only used when documentDirectory is unavailable (e.g. some web builds). */
const CHUNK_SIZE = 1000000; // 1MB chunks to be safe (Android limit is ~2MB)

function safePersistFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function persistFileUri(name: string): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}guru_zustand_${safePersistFileName(name)}.json`;
}

async function writeAtomic(uri: string, contents: string): Promise<void> {
  const tmp = `${uri}.tmp`;
  await FileSystem.writeAsStringAsync(tmp, contents);
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    /* ignore */
  }
  try {
    await FileSystem.moveAsync({ from: tmp, to: uri });
  } catch {
    // Some Android builds reject rename-over-write even after deleteAsync.
    // Fall back to a direct write so session persistence still succeeds.
    await FileSystem.writeAsStringAsync(uri, contents);
    try {
      await FileSystem.deleteAsync(tmp, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
}

async function readPlainStringFromFile(name: string): Promise<string | null> {
  const uri = persistFileUri(name);
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(uri);
  } catch {
    return null;
  }
}

async function deletePersistFile(name: string): Promise<void> {
  const uri = persistFileUri(name);
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

async function readPlainStringFromLegacyAsync(name: string): Promise<string | null> {
  let manifestOrPlain: string | null = null;
  try {
    manifestOrPlain = await AsyncStorage.getItem(name);
  } catch (e) {
    console.error('[splitSessionStorage] Manifest too big to read, clearing for recovery:', e);
    await AsyncStorage.removeItem(name);
    return null;
  }
  if (!manifestOrPlain) return null;

  let fullValue: string;
  try {
    const manifest = JSON.parse(manifestOrPlain);
    if (manifest && manifest.__is_chunked__) {
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
    fullValue = manifestOrPlain;
  }
  return fullValue;
}

async function clearLegacyAsyncStorage(name: string): Promise<void> {
  try {
    const manifestString = await AsyncStorage.getItem(name);
    if (manifestString) {
      try {
        const manifest = JSON.parse(manifestString);
        if (manifest && manifest.__is_chunked__) {
          for (let i = 0; i < manifest.chunkCount; i++) {
            await AsyncStorage.removeItem(`${name}_chunk_${i}`);
          }
        }
      } catch {
        /* ignore */
      }
    }
    await AsyncStorage.removeItem(name);
  } catch {
    /* ignore */
  }
}

/**
 * Zustand persist storage: large plain JSON lives in app documentDirectory (atomic file writes).
 * sessionId is stored in SecureStore. Legacy AsyncStorage chunks are migrated on read and cleared on write.
 */
export const splitSessionStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      let fullValue: string | null = await readPlainStringFromFile(name);
      let migratedFromLegacy = false;

      if (!fullValue) {
        fullValue = await readPlainStringFromLegacyAsync(name);
        migratedFromLegacy = !!fullValue;
      }

      if (!fullValue) return null;

      const uri = persistFileUri(name);
      if (migratedFromLegacy && uri) {
        try {
          await writeAtomic(uri, fullValue);
          await clearLegacyAsyncStorage(name);
        } catch (e) {
          if (__DEV__) console.warn('[splitSessionStorage] File migration write failed:', e);
        }
      }

      const plainStateObj = JSON.parse(fullValue) as { state?: { sessionId?: unknown } };

      const secureSessionIdString = await SecureStore.getItemAsync(SECURE_SESSION_ID_KEY);
      if (secureSessionIdString && plainStateObj.state) {
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
      const stateObj = JSON.parse(value) as { state?: { sessionId?: unknown } };

      const sessionId = stateObj.state?.sessionId;
      if (stateObj.state) {
        delete stateObj.state.sessionId;
      }

      const plainValue = JSON.stringify(stateObj);
      const uri = persistFileUri(name);

      if (uri) {
        await writeAtomic(uri, plainValue);
        await clearLegacyAsyncStorage(name);
      } else {
        const oldManifestString = await AsyncStorage.getItem(name);
        if (oldManifestString) {
          try {
            const oldManifest = JSON.parse(oldManifestString);
            if (oldManifest && oldManifest.__is_chunked__) {
              for (let i = 0; i < oldManifest.chunkCount; i++) {
                await AsyncStorage.removeItem(`${name}_chunk_${i}`);
              }
            }
          } catch {
            /* ignore */
          }
        }

        if (plainValue.length > CHUNK_SIZE) {
          const chunkCount = Math.ceil(plainValue.length / CHUNK_SIZE);
          for (let i = 0; i < chunkCount; i++) {
            const chunk = plainValue.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            await AsyncStorage.setItem(`${name}_chunk_${i}`, chunk);
          }
          await AsyncStorage.setItem(name, JSON.stringify({ __is_chunked__: true, chunkCount }));
        } else {
          await AsyncStorage.setItem(name, plainValue);
        }
      }

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
      await deletePersistFile(name);
      await clearLegacyAsyncStorage(name);
      await SecureStore.deleteItemAsync(SECURE_SESSION_ID_KEY);
    } catch (e) {
      console.error('[splitSessionStorage] Failed to remove item:', e);
    }
  },
};
