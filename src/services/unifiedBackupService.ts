import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Platform } from 'react-native';
import { zip, unzip } from 'react-native-zip-archive';
import { getDb, resetDbSingleton, walCheckpoint, closeDbGracefully } from '../db/database';
import { profileRepository } from '../db/repositories';
import { shareBackupFileOrAlert } from './backupShare';
import { copyFileToPublicBackup } from '../../modules/app-launcher';
import { stripFileUri } from './fileUri';

const Updates = (() => {
  try {
    return require('expo-updates') as { reloadAsync: () => Promise<void> };
  } catch {
    return null;
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const BACKUP_VERSION = 1;
const GURU_EXTENSION = '.guru';
const TEMP_EXTRACT_DIR = `${FileSystem.cacheDirectory}guru_restore_temp/`;

// Database paths
const DB_NAME = 'neet_study.db';
const DB_DIR = `${FileSystem.documentDirectory}SQLite`;
const DB_PATH = `${DB_DIR}/${DB_NAME}`;

// External asset directories
const TRANSCRIPTS_DIR = `${FileSystem.documentDirectory}transcripts/`;
const IMAGES_DIR = `${FileSystem.documentDirectory}generated_images/`;
const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings/`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupManifest {
  version: number;
  exportedAt: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  backupType: 'full' | 'partial';
  includedAssets: {
    database: boolean;
    transcripts: boolean;
    images: boolean;
    recordings: boolean;
  };
  databaseInfo: {
    tables: string[];
    rowCount: number;
  };
  assetCounts: {
    transcripts: number;
    images: number;
    recordings: number;
  };
}

export interface RestoreOptions {
  database: boolean;
  transcripts: boolean;
  images: boolean;
  recordings: boolean;
  overwriteExisting: boolean;
}

export interface BackupInfo {
  uri: string;
  name: string;
  size: number;
  manifest: BackupManifest;
}

export type AutoBackupFrequency = 'off' | 'daily' | '3days' | 'weekly' | 'monthly';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateDeviceId(): string {
  return `${Platform.OS}_guru`;
}

function getDeviceName(): string {
  return Platform.OS === 'android' ? 'Android Device' : 'iOS Device';
}

function getAppVersion(): string {
  try {
    const Constants = require('expo-constants');
    return Constants.default?.expoConfig?.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function ensureDirectoryExists(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function getFileCount(directory: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(directory);
    if (!info.exists) return 0;
    const files = await FileSystem.readDirectoryAsync(directory);
    return files.length;
  } catch {
    return 0;
  }
}

async function copyAssetsToDirectory(
  sourceDir: string,
  destDir: string,
  filter?: (filename: string) => boolean,
): Promise<string[]> {
  const copiedFiles: string[] = [];

  try {
    const info = await FileSystem.getInfoAsync(sourceDir);
    if (!info.exists) return copiedFiles;

    const files = await FileSystem.readDirectoryAsync(sourceDir);
    await ensureDirectoryExists(destDir);

    for (const file of files) {
      if (filter && !filter(file)) continue;

      const sourcePath = `${sourceDir}${file}`;
      const destPath = `${destDir}${file}`;

      try {
        await FileSystem.copyAsync({ from: sourcePath, to: destPath });
        copiedFiles.push(file);
      } catch (err) {
        console.warn(`[Backup] Failed to copy ${file}:`, err);
      }
    }
  } catch (err) {
    console.warn(`[Backup] Failed to read directory ${sourceDir}:`, err);
  }

  return copiedFiles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest Generation
// ─────────────────────────────────────────────────────────────────────────────

async function generateManifest(options: RestoreOptions): Promise<BackupManifest> {
  const db = getDb();

  // Get database info
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const tableNames = tables.map((t) => t.name);

  let totalRows = 0;
  for (const table of tableNames) {
    try {
      const count = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table}`,
      );
      totalRows += count?.count ?? 0;
    } catch {
      // Skip tables that can't be counted
    }
  }

  // Count assets
  const transcriptCount = options.transcripts ? await getFileCount(TRANSCRIPTS_DIR) : 0;
  const imageCount = options.images ? await getFileCount(IMAGES_DIR) : 0;
  const recordingCount = options.recordings ? await getFileCount(RECORDINGS_DIR) : 0;

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: generateDeviceId(),
    deviceName: getDeviceName(),
    appVersion: getAppVersion(),
    backupType:
      options.database && options.transcripts && options.images && options.recordings
        ? 'full'
        : 'partial',
    includedAssets: {
      database: options.database,
      transcripts: options.transcripts,
      images: options.images,
      recordings: options.recordings,
    },
    databaseInfo: {
      tables: tableNames,
      rowCount: totalRows,
    },
    assetCounts: {
      transcripts: transcriptCount,
      images: imageCount,
      recordings: recordingCount,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function exportUnifiedBackup(options?: Partial<RestoreOptions>): Promise<boolean> {
  const restoreOptions: RestoreOptions = {
    database: true,
    transcripts: true,
    images: true,
    recordings: true,
    overwriteExisting: true,
    ...options,
  };

  const tempBackupDir = `${FileSystem.cacheDirectory}guru_backup_temp_${Date.now()}/`;
  const tempDbPath = `${tempBackupDir}neet_study.db`;
  const manifestPath = `${tempBackupDir}manifest.json`;
  const dateStr = new Date().toISOString().slice(0, 10);
  const backupPath = `${FileSystem.cacheDirectory}guru_backup_${dateStr}${GURU_EXTENSION}`;

  try {
    // Create temp directory
    await ensureDirectoryExists(tempBackupDir);

    // Copy database if requested
    if (restoreOptions.database) {
      // Flush WAL journal into main DB file before copying
      await walCheckpoint();
      const dbInfo = await FileSystem.getInfoAsync(DB_PATH);
      if (dbInfo.exists) {
        await FileSystem.copyAsync({ from: DB_PATH, to: tempDbPath });
      } else {
        Alert.alert('Error', 'Database file not found.');
        return false;
      }
    }

    // Copy transcripts if requested
    if (restoreOptions.transcripts) {
      await copyAssetsToDirectory(TRANSCRIPTS_DIR, `${tempBackupDir}assets/transcripts/`);
    }

    // Copy images if requested
    if (restoreOptions.images) {
      await copyAssetsToDirectory(
        IMAGES_DIR,
        `${tempBackupDir}assets/images/`,
        (file) => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'),
      );
    }

    // Copy recordings if requested
    if (restoreOptions.recordings) {
      await copyAssetsToDirectory(
        RECORDINGS_DIR,
        `${tempBackupDir}assets/recordings/`,
        (file) => file.endsWith('.m4a') || file.endsWith('.mp3') || file.endsWith('.wav'),
      );
    }

    // Generate and write manifest
    const manifest = await generateManifest(restoreOptions);
    await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(manifest, null, 2));

    // Create ZIP archive
    await zip(tempBackupDir, backupPath);

    // Clean up temp directory
    await FileSystem.deleteAsync(tempBackupDir, { idempotent: true });

    await shareBackupFileOrAlert(backupPath, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Save Guru Backup',
      unavailableAlert: {
        title: 'Backup Created',
        message: `Backup saved to:\n${backupPath}`,
      },
    });
    return true;
  } catch (err) {
    console.error('[Backup] Export failed:', err);
    Alert.alert('Backup Failed', 'Could not create backup file.');
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function validateBackupFile(
  uri: string,
): Promise<{ valid: boolean; manifest?: BackupManifest; error?: string }> {
  const tempDir = `${TEMP_EXTRACT_DIR}${Date.now()}/`;
  const manifestPath = `${tempDir}manifest.json`;

  try {
    await ensureDirectoryExists(tempDir);

    // Unzip to temp directory
    await unzip(uri, tempDir);

    // Check for manifest
    const manifestInfo = await FileSystem.getInfoAsync(manifestPath);
    if (!manifestInfo.exists) {
      return { valid: false, error: 'Backup manifest not found.' };
    }

    // Read and validate manifest
    const manifestContent = await FileSystem.readAsStringAsync(manifestPath);
    const manifest: BackupManifest = JSON.parse(manifestContent);

    // Validate version
    if (manifest.version > BACKUP_VERSION) {
      return {
        valid: false,
        error: 'Backup was created with a newer version of the app.',
      };
    }

    // Validate required fields
    if (!manifest.exportedAt || !manifest.deviceId) {
      return { valid: false, error: 'Invalid backup manifest.' };
    }

    // Check for database if required
    if (manifest.includedAssets.database) {
      const dbPath = `${tempDir}neet_study.db`;
      const dbInfo = await FileSystem.getInfoAsync(dbPath);
      if (!dbInfo.exists) {
        return { valid: false, error: 'Database file missing from backup.' };
      }

      // Validate SQLite header
      const isSqlite = await hasSQLiteHeader(dbPath);
      if (!isSqlite) {
        return { valid: false, error: 'Invalid SQLite database in backup.' };
      }
    }

    return { valid: true, manifest };
  } catch (err) {
    console.error('[Backup] Validation failed:', err);
    return { valid: false, error: 'Could not read backup file.' };
  } finally {
    // Clean up temp directory
    await FileSystem.deleteAsync(tempDir, { idempotent: true });
  }
}

async function hasSQLiteHeader(filePath: string): Promise<boolean> {
  try {
    const headerBase64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 16,
    });
    const header = atob(headerBase64);
    return header.startsWith('SQLite format 3');
  } catch {
    return false;
  }
}

/**
 * Import from a known file path (used by GDrive restore and auto-restore).
 * Skips the document picker.
 */
export async function importUnifiedBackupFromPath(
  backupUri: string,
  options?: Partial<RestoreOptions>,
): Promise<{ ok: boolean; message: string }> {
  return _importUnifiedBackup(backupUri, options);
}

export async function importUnifiedBackup(
  options?: Partial<RestoreOptions>,
): Promise<{ ok: boolean; message: string }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { ok: false, message: 'Cancelled' };
  }

  return _importUnifiedBackup(result.assets[0].uri, options);
}

async function _importUnifiedBackup(
  backupUri: string,
  options?: Partial<RestoreOptions>,
): Promise<{ ok: boolean; message: string }> {
  // Validate the backup file
  const validation = await validateBackupFile(backupUri);
  if (!validation.valid) {
    return { ok: false, message: validation.error || 'Invalid backup file.' };
  }

  const manifest = validation.manifest!;
  const tempDir = `${TEMP_EXTRACT_DIR}${Date.now()}/`;
  const rollbackDir = `${FileSystem.cacheDirectory}guru_rollback_${Date.now()}/`;

  try {
    await ensureDirectoryExists(tempDir);
    await ensureDirectoryExists(rollbackDir);

    // Extract backup
    await unzip(backupUri, tempDir);

    // Create rollback backup of current state
    if (manifest.includedAssets.database) {
      const rollbackDbPath = `${rollbackDir}neet_study.db`;
      const dbInfo = await FileSystem.getInfoAsync(DB_PATH);
      if (dbInfo.exists) {
        await FileSystem.copyAsync({ from: DB_PATH, to: rollbackDbPath });
      }
    }

    // Restore database
    if (manifest.includedAssets.database && (options?.database ?? true)) {
      const importedDbPath = `${tempDir}neet_study.db`;

      // Flush WAL then close DB gracefully before replacing the file
      try {
        await walCheckpoint();
      } catch (err) {
        console.warn('[Backup] WAL checkpoint before import failed:', err);
      }
      try {
        await closeDbGracefully();
      } catch (err) {
        console.warn('[Backup] Failed to close DB before import:', err);
      }
      resetDbSingleton();

      // Replace database file
      await FileSystem.copyAsync({ from: importedDbPath, to: DB_PATH });
    }

    // Restore assets with error collection (DB is already committed at this point)
    const assetErrors: string[] = [];

    // Restore transcripts
    if (manifest.includedAssets.transcripts && (options?.transcripts ?? true)) {
      try {
        const importedTranscriptsDir = `${tempDir}assets/transcripts/`;
        const dirInfo = await FileSystem.getInfoAsync(importedTranscriptsDir);
        if (dirInfo.exists) {
          await ensureDirectoryExists(TRANSCRIPTS_DIR);
          const files = await FileSystem.readDirectoryAsync(importedTranscriptsDir);
          for (const file of files) {
            await FileSystem.copyAsync({
              from: `${importedTranscriptsDir}${file}`,
              to: `${TRANSCRIPTS_DIR}${file}`,
            });
          }
        }
      } catch (err) {
        assetErrors.push(`Transcripts: ${err}`);
      }
    }

    // Restore images
    if (manifest.includedAssets.images && (options?.images ?? true)) {
      try {
        const importedImagesDir = `${tempDir}assets/images/`;
        const dirInfo = await FileSystem.getInfoAsync(importedImagesDir);
        if (dirInfo.exists) {
          await ensureDirectoryExists(IMAGES_DIR);
          const files = await FileSystem.readDirectoryAsync(importedImagesDir);
          for (const file of files) {
            await FileSystem.copyAsync({
              from: `${importedImagesDir}${file}`,
              to: `${IMAGES_DIR}${file}`,
            });
          }
        }
      } catch (err) {
        assetErrors.push(`Images: ${err}`);
      }
    }

    // Restore recordings
    if (manifest.includedAssets.recordings && (options?.recordings ?? true)) {
      try {
        const importedRecordingsDir = `${tempDir}assets/recordings/`;
        const dirInfo = await FileSystem.getInfoAsync(importedRecordingsDir);
        if (dirInfo.exists) {
          await ensureDirectoryExists(RECORDINGS_DIR);
          const files = await FileSystem.readDirectoryAsync(importedRecordingsDir);
          for (const file of files) {
            await FileSystem.copyAsync({
              from: `${importedRecordingsDir}${file}`,
              to: `${RECORDINGS_DIR}${file}`,
            });
          }
        }
      } catch (err) {
        assetErrors.push(`Recordings: ${err}`);
      }
    }

    if (assetErrors.length > 0) {
      console.warn('[Restore] Some assets failed to restore:', assetErrors);
    }

    // Verify restored database
    if (manifest.includedAssets.database && (options?.database ?? true)) {
      try {
        const testDb = getDb();
        await testDb.getFirstAsync('SELECT COUNT(*) FROM subjects');
      } catch {
        // Rollback on validation failure
        const rollbackDbPath = `${rollbackDir}neet_study.db`;
        const rollbackInfo = await FileSystem.getInfoAsync(rollbackDbPath);
        if (rollbackInfo.exists) {
          resetDbSingleton();
          await FileSystem.copyAsync({ from: rollbackDbPath, to: DB_PATH });
        }
        return {
          ok: false,
          message: 'Backup validation failed. Original data restored.',
        };
      }
    }

    // Clean up
    await FileSystem.deleteAsync(tempDir, { idempotent: true });
    await FileSystem.deleteAsync(rollbackDir, { idempotent: true });

    Alert.alert('Restore Complete', 'Backup restored successfully! The app will now restart.', [
      {
        text: 'Restart',
        onPress: () => {
          try {
            Updates?.reloadAsync?.();
          } catch {
            Alert.alert('Please restart the app manually.');
          }
        },
      },
    ]);

    return {
      ok: true,
      message: `Restored backup from ${manifest.deviceName} (${manifest.exportedAt})`,
    };
  } catch (err) {
    console.error('[Backup] Import failed:', err);

    // Attempt rollback
    try {
      const rollbackDbPath = `${rollbackDir}neet_study.db`;
      const rollbackInfo = await FileSystem.getInfoAsync(rollbackDbPath);
      if (rollbackInfo.exists) {
        resetDbSingleton();
        await FileSystem.copyAsync({ from: rollbackDbPath, to: DB_PATH });
      }
    } catch (rollbackErr) {
      console.error('[Backup] Rollback also failed:', rollbackErr);
    }

    return { ok: false, message: 'Failed to restore backup.' };
  } finally {
    // Clean up temp directories
    await FileSystem.deleteAsync(tempDir, { idempotent: true });
    await FileSystem.deleteAsync(rollbackDir, { idempotent: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Backup Engine
// ─────────────────────────────────────────────────────────────────────────────

const FREQUENCY_MS: Record<AutoBackupFrequency, number> = {
  off: 0,
  daily: 24 * 60 * 60 * 1000,
  '3days': 3 * 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export async function shouldRunAutoBackup(): Promise<boolean> {
  try {
    const profile = await profileRepository.getProfile();
    const frequency = profile.autoBackupFrequency ?? 'off';

    if (!frequency || frequency === 'off') return false;

    const lastBackup = profile.lastAutoBackupAt ?? null;
    if (!lastBackup) return true;

    const lastBackupTime = new Date(lastBackup).getTime();
    const threshold = FREQUENCY_MS[frequency];

    return Date.now() - lastBackupTime >= threshold;
  } catch {
    return false;
  }
}

export async function runAutoBackup(): Promise<boolean> {
  try {
    const profile = await profileRepository.getProfile();
    const backupDir = profile.backupDirectoryUri ?? null;

    // Run export without user interaction
    const tempBackupDir = `${FileSystem.cacheDirectory}guru_auto_backup/`;
    const tempDbPath = `${tempBackupDir}neet_study.db`;
    const manifestPath = `${tempBackupDir}manifest.json`;
    const backupName = `guru_auto_${new Date().toISOString().slice(0, 10)}${GURU_EXTENSION}`;
    const backupPath = `${FileSystem.cacheDirectory}${backupName}`;

    await ensureDirectoryExists(tempBackupDir);

    // Flush WAL and copy database
    await walCheckpoint();
    const dbInfo = await FileSystem.getInfoAsync(DB_PATH);
    if (!dbInfo.exists) {
      console.warn('[AutoBackup] Database file not found.');
      return false;
    }
    await FileSystem.copyAsync({ from: DB_PATH, to: tempDbPath });

    // Generate manifest
    const manifest = await generateManifest({
      database: true,
      transcripts: true,
      images: true,
      recordings: false, // Skip recordings for auto-backup (too large)
      overwriteExisting: true,
    });
    manifest.backupType = 'partial';
    manifest.includedAssets.recordings = false;

    await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(manifest, null, 2));

    // Copy transcripts and images (skip recordings for size)
    await copyAssetsToDirectory(TRANSCRIPTS_DIR, `${tempBackupDir}assets/transcripts/`);
    await copyAssetsToDirectory(
      IMAGES_DIR,
      `${tempBackupDir}assets/images/`,
      (file) => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'),
    );

    // Create ZIP
    await zip(tempBackupDir, backupPath);

    // Save to SAF folder if configured (Android)
    if (Platform.OS === 'android' && backupDir) {
      try {
        const { StorageAccessFramework } = FileSystem;
        const backupUri = await StorageAccessFramework.createFileAsync(
          backupDir,
          backupName,
          'application/octet-stream',
        );
        const backupBase64 = await FileSystem.readAsStringAsync(backupPath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(backupUri, backupBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (safErr) {
        console.warn('[AutoBackup] SAF backup failed:', safErr);
      }
    }

    // Also save to native public storage (survives app uninstall)
    await copyFileToPublicBackup(stripFileUri(backupPath), 'guru_latest.guru');

    // Update last backup timestamp and device ID
    await profileRepository.updateProfile({
      lastAutoBackupAt: new Date().toISOString(),
      lastBackupDeviceId: generateDeviceId(),
    });

    // Clean up temp directory
    await FileSystem.deleteAsync(tempBackupDir, { idempotent: true });

    // Prune old local backups
    await cleanupOldBackups(5);

    // Upload to GDrive if connected (non-blocking)
    void uploadToGDriveIfConnected(backupPath).catch((e) =>
      console.warn('[AutoBackup] GDrive upload failed (will retry next cycle):', e),
    );

    return true;
  } catch (err) {
    console.error('[AutoBackup] Auto-backup failed:', err);
    return false;
  }
}

/**
 * Attempt GDrive upload after a successful auto-backup.
 * Imported lazily to avoid circular deps and keep GDrive optional.
 */
async function uploadToGDriveIfConnected(backupPath: string): Promise<void> {
  try {
    const { isGDriveConnected, uploadBackupToGDrive, cleanupOldGDriveBackups } = await import(
      './gdriveBackupService'
    );
    if (!(await isGDriveConnected())) return;
    const uploaded = await uploadBackupToGDrive(backupPath);
    if (uploaded) {
      await cleanupOldGDriveBackups(3);
    }
  } catch (e) {
    // GDrive module may not be available — that's fine
    console.warn('[AutoBackup] GDrive integration unavailable:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function getBackupInfo(uri: string): Promise<BackupInfo | null> {
  try {
    const validation = await validateBackupFile(uri);
    if (!validation.valid || !validation.manifest) return null;

    const fileInfo = await FileSystem.getInfoAsync(uri);
    return {
      uri,
      name: uri.split('/').pop() || 'backup.guru',
      size: 'size' in fileInfo ? fileInfo.size ?? 0 : 0,
      manifest: validation.manifest,
    };
  } catch {
    return null;
  }
}

export async function getAvailableBackups(): Promise<BackupInfo[]> {
  const backups: BackupInfo[] = [];
  const cacheDir = FileSystem.cacheDirectory;

  if (!cacheDir) return backups;

  try {
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    const guruFiles = files.filter((f) => f.endsWith(GURU_EXTENSION));

    for (const file of guruFiles) {
      const uri = `${cacheDir}${file}`;
      const info = await getBackupInfo(uri);
      if (info) {
        backups.push(info);
      }
    }
  } catch (err) {
    console.error('[Backup] Failed to list backups:', err);
  }

  return backups.sort((a, b) => b.manifest.exportedAt.localeCompare(a.manifest.exportedAt));
}

export async function deleteBackup(uri: string): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

export async function cleanupOldBackups(keepCount: number = 5): Promise<void> {
  const backups = await getAvailableBackups();
  if (backups.length <= keepCount) return;

  const toDelete = backups.slice(keepCount);
  for (const backup of toDelete) {
    await deleteBackup(backup.uri);
  }
}
