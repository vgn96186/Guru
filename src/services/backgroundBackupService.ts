import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { profileRepository } from '../db/repositories';
import { copyFileToPublicBackup } from '../../modules/app-launcher';

const PUBLIC_BACKUP_DIR = FileSystem.documentDirectory + 'backups/db/';

/**
 * Automatically triggers a JSON backup of the entire database
 * and saves it to public storage that survives app uninstalls.
 */
export async function runAutoPublicBackup() {
  try {
    const profile = await profileRepository.getProfile();
    if (__DEV__) console.log('[AutoBackup] Starting periodic database backup...');

    const DB_NAME = 'neet_study.db';
    const DB_PATH = FileSystem.documentDirectory + 'SQLite/' + DB_NAME;
    const backupName = `guru_auto_db_${new Date().toISOString().slice(0, 10)}.db`;

    // 1. Primary Backup: User-Selected Public/Cloud Folder (SAF)
    if (Platform.OS === 'android' && profile.backupDirectoryUri) {
      try {
        const { StorageAccessFramework } = FileSystem;
        const backupUri = await StorageAccessFramework.createFileAsync(
          profile.backupDirectoryUri,
          backupName,
          'application/octet-stream',
        );
        const dbBase64 = await FileSystem.readAsStringAsync(DB_PATH, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(backupUri, dbBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (__DEV__) console.log('[AutoBackup] Cloud/SAF backup successful:', backupName);
      } catch (safErr) {
        console.warn('[AutoBackup] Cloud/SAF backup failed:', safErr);
      }
    }

    // 2. Secondary Backup: Native Public Storage (Survives app uninstall)
    const success = await copyFileToPublicBackup(DB_PATH.replace('file://', ''), 'guru_latest.db');
    if (__DEV__) {
      if (success) console.log('[AutoBackup] Native public backup successful: guru_latest.db');
      else console.warn('[AutoBackup] Native public backup failed.');
    }
  } catch (err) {
    console.warn('[AutoBackup] Periodic backup failed:', err);
  }
}
