import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

const Updates = (() => {
  try {
    return require('expo-updates') as { reloadAsync: () => Promise<void> };
  } catch {
    return null;
  }
})();

const DB_NAME = 'neet_study.db';
const DB_DIR = `${FileSystem.documentDirectory}SQLite`;
const DB_PATH = `${DB_DIR}/${DB_NAME}`;
const SQLITE_HEADER = 'SQLite format 3';

async function hasSQLiteHeader(filePath: string): Promise<boolean> {
  try {
    const headerBase64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 16,
    });
    const header = atob(headerBase64);
    return header.startsWith(SQLITE_HEADER);
  } catch {
    return false;
  }
}

export async function exportDatabase() {
  try {
    const fileExists = await FileSystem.getInfoAsync(DB_PATH);
    if (!fileExists?.exists) {
      Alert.alert('Error', 'Database file not found.');
      return;
    }

    // Copy to a temporary file with a readable name
    const tempPath = `${FileSystem.cacheDirectory}neet_study_backup_${new Date().toISOString().slice(0, 10)}.db`;
    await FileSystem.copyAsync({ from: DB_PATH, to: tempPath });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(tempPath, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Export Backup',
      });
    } else {
      Alert.alert('Error', 'Sharing is not available on this device');
    }
  } catch (e) {
    if (__DEV__) console.error('Backup error', e);
    Alert.alert('Error', 'Failed to export backup.');
  }
}

export async function importDatabase() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: '*/*',
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const tempImportPath = `${FileSystem.cacheDirectory}neet_study_import_tmp_${Date.now()}.db`;
    const rollbackPath = `${DB_PATH}.rollback_${Date.now()}.bak`;

    // Ensure SQLite dir exists first
    const dirInfo = await FileSystem.getInfoAsync(DB_DIR);
    if (!dirInfo?.exists) {
      await FileSystem.makeDirectoryAsync(DB_DIR, { intermediates: true });
    }

    // Copy selected file to temp path and validate SQLite signature
    await FileSystem.copyAsync({ from: asset.uri, to: tempImportPath });
    const validSqlite = await hasSQLiteHeader(tempImportPath);
    if (!validSqlite) {
      await FileSystem.deleteAsync(tempImportPath, { idempotent: true });
      Alert.alert('Invalid backup', 'Selected file is not a valid SQLite database backup.');
      return;
    }

    // Close current DB connection before replacing file
    try {
      const { getDb } = require('../db/database');
      const db = getDb();
      db.closeSync();
    } catch (err) {
      if (__DEV__) console.warn('[Backup] Failed to close DB before import:', err);
    }
    const { resetDbSingleton } = require('../db/database');
    resetDbSingleton();

    const existing = await FileSystem.getInfoAsync(DB_PATH);
    if (existing?.exists) {
      await FileSystem.copyAsync({ from: DB_PATH, to: rollbackPath });
    }

    try {
      await FileSystem.copyAsync({ from: tempImportPath, to: DB_PATH });
      await FileSystem.deleteAsync(tempImportPath, { idempotent: true });
      // Keep rollback until we verify the new DB is valid
    } catch (replaceError) {
      // Restore old DB if replacement fails
      const rollbackExists = await FileSystem.getInfoAsync(rollbackPath);
      if (rollbackExists?.exists) {
        await FileSystem.copyAsync({ from: rollbackPath, to: DB_PATH });
      }
      await FileSystem.deleteAsync(tempImportPath, { idempotent: true });
      await FileSystem.deleteAsync(rollbackPath, { idempotent: true });
      throw replaceError;
    }

    // Verify the imported DB can be opened and has expected tables
    try {
      const { getDb } = require('../db/database');
      const testDb = getDb();
      await testDb.getFirstAsync('SELECT COUNT(*) FROM subjects');
      // DB is valid — clean up rollback
      await FileSystem.deleteAsync(rollbackPath, { idempotent: true });
    } catch (validationError) {
      // Imported DB is corrupt — rollback
      const rollbackExists = await FileSystem.getInfoAsync(rollbackPath);
      if (rollbackExists?.exists) {
        await FileSystem.copyAsync({ from: rollbackPath, to: DB_PATH });
      }
      await FileSystem.deleteAsync(rollbackPath, { idempotent: true });
      Alert.alert(
        'Invalid Backup',
        'The backup file failed schema validation. Your original data has been restored.',
      );
      return;
    }

    Alert.alert('Success', 'Backup restored successfully! The app will now restart.', [
      {
        text: 'Restart',
        onPress: () => {
          // Force a full restart so all components get fresh DB handles
          try {
            void Updates?.reloadAsync?.();
          } catch {
            // Fallback for dev builds where Updates isn't available
            Alert.alert('Please restart the app manually.');
          }
        },
      },
    ]);
  } catch (e) {
    if (__DEV__) console.error('Import error', e);
    Alert.alert('Error', 'Failed to import backup.');
  }
}
