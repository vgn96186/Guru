import { PermissionsAndroid } from 'react-native';
import type { ContentType, ProviderId } from '../../types';

export const ALL_CONTENT_TYPES: { type: ContentType; label: string }[] = [
  { type: 'keypoints', label: 'Key Points' },
  { type: 'quiz', label: 'Quiz' },
  { type: 'story', label: 'Story' },
  { type: 'mnemonic', label: 'Mnemonic' },
  { type: 'teach_back', label: 'Teach Back' },
  { type: 'error_hunt', label: 'Error Hunt' },
  { type: 'detective', label: 'Detective' },
];

export const BACKUP_VERSION = 1;
export const LOCAL_FILE_ACCESS_PERMISSION =
  PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO ??
  PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

export type BackupRow = Record<string, unknown>;

export interface AppBackup {
  version: number;
  exportedAt: string;
  user_profile: BackupRow | null;
  topic_progress: BackupRow[];
  daily_log: BackupRow[];
  lecture_notes: BackupRow[];
  sessions?: BackupRow[];
  ai_cache?: BackupRow[];
  brain_dumps?: BackupRow[];
}

export type ValidationProviderId = ProviderId | 'deepgram' | 'fal' | 'brave' | 'google';
export type ApiValidationEntry = { verified: boolean; verifiedAt: number; fingerprint: string };
export type ApiValidationState = Partial<Record<ValidationProviderId, ApiValidationEntry>>;

export type ChatGptAccountSettings = {
  primary: { enabled: boolean; connected: boolean };
  secondary: { enabled: boolean; connected: boolean };
};
