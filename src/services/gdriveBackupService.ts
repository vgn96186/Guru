/**
 * Google Drive backup service — handles auth, upload, download, and cleanup
 * of .guru backup files in the user's hidden appDataFolder.
 *
 * Uses @react-native-google-signin for auth and plain fetch() for Drive REST API.
 * No additional Drive SDK dependency needed.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { profileRepository } from '../db/repositories';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─��───────────────────────────────────────────────────────────────────────────

export interface GDriveBackupMeta {
  fileId: string;
  name: string;
  exportedAt: string;
  deviceId: string;
  deviceName: string;
  size: number;
}

// ─────────────────────────────────��───────────────────────────────���───────────
// Constants
// ────────────────────��─────────────────────────────��──────────────────────────

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// ─────────────────────────────��────────────────────────────────��──────────────
// Auth helpers (lazy-loaded to avoid crash if google-signin not installed)
// ──────���───────────���─────────────────────────────────��────────────────────────

let _GoogleSignin: any = null;

function getGoogleSigninModule(): any {
  if (!_GoogleSignin) {
    try {
      _GoogleSignin = require('@react-native-google-signin/google-signin');
    } catch {
      throw new Error(
        'Google Sign-In is not installed. Run: npm install @react-native-google-signin/google-signin',
      );
    }
  }
  return _GoogleSignin;
}

let _configured = false;
let _configuredWebClientId = '';

function configureGoogleSigninClient(webClientId: string): void {
  const { GoogleSignin } = getGoogleSigninModule();
  GoogleSignin.configure({
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    webClientId,
    offlineAccess: true,
  });
  _configured = true;
  _configuredWebClientId = webClientId;
}

function isConfigureMissingError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as any).message)
          : '';
  const normalized = message.toLowerCase();
  return normalized.includes('apiclient is null') || normalized.includes('call configure() first');
}

/**
 * Ensure Google Sign-In is configured before any auth operation.
 * Safe to call multiple times — only runs configure() once.
 */
async function resolveGoogleWebClientId(preferredWebClientId?: string): Promise<string> {
  const preferred = (preferredWebClientId ?? '').trim();
  if (preferred) return preferred;

  try {
    const profile = await profileRepository.getProfile();
    const fromProfile = (profile as any)?.gdriveWebClientId?.trim() ?? '';
    if (fromProfile) return fromProfile;
  } catch {
    // Non-fatal; fall back to build-time config.
  }

  const { GOOGLE_WEB_CLIENT_ID } = require('../config/appConfig');
  const webClientId = (GOOGLE_WEB_CLIENT_ID ?? '').trim();
  if (!webClientId) {
    throw new Error(
      'Google Drive needs a Web Client ID. Paste it in Settings or provide EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your build config.',
    );
  }
  return webClientId;
}

async function ensureConfigured(preferredWebClientId?: string): Promise<string> {
  const webClientId = await resolveGoogleWebClientId(preferredWebClientId);
  if (_configured && _configuredWebClientId === webClientId) return webClientId;
  configureGoogleSigninClient(webClientId);
  return webClientId;
}

/**
 * Configure Google Sign-In with a specific client ID.
 * Called from appBootstrap for early init, but ensureConfigured()
 * handles the case where bootstrap hasn't run yet.
 */
export function configureGoogleSignIn(webClientId: string): void {
  const normalized = webClientId.trim();
  if (!normalized) return;
  if (_configured && _configuredWebClientId === normalized) return;
  configureGoogleSigninClient(normalized);
}

async function getAccessToken(): Promise<string> {
  await ensureConfigured();
  const { GoogleSignin } = getGoogleSigninModule();

  // Silently refresh tokens if possible
  try {
    await GoogleSignin.signInSilently();
  } catch {
    // If silent sign-in fails, the user needs to re-authenticate
    throw new Error('Google Sign-In session expired. Please reconnect in Settings.');
  }

  const tokens = await GoogleSignin.getTokens();
  if (!tokens.accessToken) {
    throw new Error('No access token available from Google Sign-In.');
  }
  return tokens.accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Auth
// ─────────────────────────────────────────────────────────────────────────────

export async function signInToGDrive(preferredWebClientId?: string): Promise<{ email: string }> {
  await ensureConfigured(preferredWebClientId);
  const { GoogleSignin } = getGoogleSigninModule();
  await GoogleSignin.hasPlayServices?.({ showPlayServicesUpdateDialog: true });

  let userInfo: any;
  try {
    userInfo = await GoogleSignin.signIn();
  } catch (error) {
    if (!isConfigureMissingError(error)) throw error;
    // Defensive recovery for sporadic native state loss on Android.
    _configured = false;
    _configuredWebClientId = '';
    await ensureConfigured(preferredWebClientId);
    userInfo = await GoogleSignin.signIn();
  }
  const email = userInfo?.data?.user?.email ?? userInfo?.user?.email ?? '';

  await profileRepository.updateProfile({
    gdriveConnected: 1,
    gdriveEmail: email,
  } as any);

  return { email };
}

export async function signOutGDrive(): Promise<void> {
  try {
    const { GoogleSignin } = getGoogleSigninModule();
    await GoogleSignin.signOut();
  } catch {
    // Sign-out failure is non-critical
  }
  await profileRepository.updateProfile({
    gdriveConnected: 0,
    gdriveEmail: '',
    gdriveLastSyncAt: null,
  } as any);
}

export async function isGDriveConnected(): Promise<boolean> {
  try {
    const profile = await profileRepository.getProfile();
    return (profile as any)?.gdriveConnected === 1;
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────��─────────────────
// Public API — Upload
// ───────���───────────────────���──────────────────────────���──────────────────────

export async function uploadBackupToGDrive(localFilePath: string): Promise<boolean> {
  const accessToken = await getAccessToken();

  const fileInfo = await FileSystem.getInfoAsync(localFilePath);
  if (!fileInfo.exists) {
    console.warn('[GDrive] Backup file not found:', localFilePath);
    return false;
  }

  const deviceName = Platform.OS === 'android' ? 'Android Device' : 'iOS Device';
  const now = new Date().toISOString();
  const fileName = `guru_backup_${deviceName.replace(/\s+/g, '_')}_${now.slice(0, 10)}.guru`;

  // Read file as base64
  const fileBase64 = await FileSystem.readAsStringAsync(localFilePath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Metadata for the file
  const metadata = {
    name: fileName,
    parents: ['appDataFolder'],
    appProperties: {
      deviceId: `${Platform.OS}_${Date.now().toString(36)}`,
      deviceName,
      exportedAt: now,
    },
  };

  // Use multipart upload (metadata + content in one request)
  const boundary = `guru_backup_${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: application/octet-stream\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    fileBase64 +
    '\r\n' +
    `--${boundary}--`;

  const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[GDrive] Upload failed:', response.status, errorText);
    return false;
  }

  // Update last sync timestamp
  await profileRepository.updateProfile({
    gdriveLastSyncAt: now,
  } as any);

  console.log('[GDrive] Backup uploaded successfully:', fileName);
  return true;
}

// ──────────���──────────────────────────────────────────────────────────────────
// Public API — List & Download
// ─────────────────────���──────────────────────────────────���────────────────────

export async function listGDriveBackups(): Promise<GDriveBackupMeta[]> {
  const accessToken = await getAccessToken();

  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: "name contains 'guru_backup'",
    fields: 'files(id,name,size,appProperties)',
    orderBy: 'createdTime desc',
    pageSize: '20',
  });

  const response = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    console.error('[GDrive] List failed:', response.status);
    return [];
  }

  const data = await response.json();
  const files = data.files ?? [];

  return files.map((f: any) => ({
    fileId: f.id,
    name: f.name,
    exportedAt: f.appProperties?.exportedAt ?? '',
    deviceId: f.appProperties?.deviceId ?? '',
    deviceName: f.appProperties?.deviceName ?? '',
    size: parseInt(f.size ?? '0', 10),
  }));
}

/**
 * Download the latest backup from GDrive (from any device).
 * Returns the local temp file path, or null if no backup found.
 */
export async function downloadLatestFromGDrive(): Promise<string | null> {
  const backups = await listGDriveBackups();
  if (backups.length === 0) return null;

  // Pick newest by exportedAt
  const sorted = [...backups].sort(
    (a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime(),
  );
  return downloadBackupFromGDrive(sorted[0].fileId);
}

/**
 * Download a specific backup file by its GDrive file ID.
 * Returns the local temp file path.
 */
export async function downloadBackupFromGDrive(fileId: string): Promise<string | null> {
  const accessToken = await getAccessToken();

  const destPath = `${FileSystem.cacheDirectory}gdrive_restore_${Date.now()}.guru`;

  const downloadResult = await FileSystem.downloadAsync(
    `${DRIVE_FILES_URL}/${fileId}?alt=media`,
    destPath,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (downloadResult.status !== 200) {
    console.error('[GDrive] Download failed:', downloadResult.status);
    return null;
  }

  return destPath;
}

// ─────────��─────────────────���─────────────────────────────────────────────────
// Public API — Cleanup
// ────��───────────────────��─────────────────────────────────���──────────────────

/**
 * Keep only the latest `keepPerDevice` backups per device on GDrive.
 */
export async function cleanupOldGDriveBackups(keepPerDevice: number = 3): Promise<void> {
  const accessToken = await getAccessToken();
  const backups = await listGDriveBackups();

  // Group by deviceId
  const byDevice = new Map<string, GDriveBackupMeta[]>();
  for (const b of backups) {
    const key = b.deviceId || b.deviceName || 'unknown';
    if (!byDevice.has(key)) byDevice.set(key, []);
    byDevice.get(key)!.push(b);
  }

  // For each device, sort by exportedAt and delete old ones
  for (const [, deviceBackups] of byDevice) {
    const sorted = deviceBackups.sort(
      (a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime(),
    );

    const toDelete = sorted.slice(keepPerDevice);
    for (const backup of toDelete) {
      try {
        await fetch(`${DRIVE_FILES_URL}/${backup.fileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (e) {
        console.warn('[GDrive] Failed to delete old backup:', backup.name, e);
      }
    }
  }
}
