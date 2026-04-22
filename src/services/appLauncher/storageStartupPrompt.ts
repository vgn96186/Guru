import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  findLocalModelFiles,
  hasAllFilesAccess,
  requestAllFilesAccess,
} from '../../../modules/app-launcher';
import { showToast } from '../../components/Toast';
import { showDialog } from '../../components/dialogService';

export const STORAGE_STARTUP_PROMPT_KEY = 'storage_startup_prompt_shown_v1';
export const STORAGE_MODEL_TOAST_KEY = 'storage_model_toast_signature_v1';
let storagePromptShownThisSession = false;

export function __resetStorageStartupPromptForTests(): void {
  storagePromptShownThisSession = false;
}

function buildSignature(paths: string[]): string {
  return paths.sort().join('|');
}

export async function maybeHandleStorageAccessOnStartup(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const hasAccess = await hasAllFilesAccess();
  if (!hasAccess) {
    if (storagePromptShownThisSession) return;
    storagePromptShownThisSession = true;
    const result = await showDialog({
      title: 'Allow Model Import',
      message:
        'Guru can scan your device storage for existing on-device AI model files if you allow broad file access.',
      variant: 'focus',
      actions: [
        { id: 'later', label: 'Later', variant: 'secondary' },
        { id: 'allow', label: 'Allow', variant: 'primary' },
      ],
      allowDismiss: true,
    });
    if (result === 'allow') {
      void requestAllFilesAccess();
    }
    return;
  }

  storagePromptShownThisSession = false;

  const entries = await findLocalModelFiles();
  const paths = entries.map((entry) => entry.path).filter(Boolean);
  if (paths.length === 0) return;

  const signature = buildSignature(paths);
  const lastShown = await AsyncStorage.getItem(STORAGE_MODEL_TOAST_KEY);
  if (lastShown === signature) return;

  await AsyncStorage.setItem(STORAGE_MODEL_TOAST_KEY, signature);
  showToast({
    title: 'On-device AI found',
    message: 'Guru found model files on this device. Open AI Setup to import them.',
    variant: 'success',
    duration: 5000,
  });
}
