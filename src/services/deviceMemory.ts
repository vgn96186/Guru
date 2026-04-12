import * as Device from 'expo-device';
import { showToast } from '../components/Toast';
import { profileRepository } from '../db/repositories';
import type { UserProfile } from '../types';

export const MIN_LOCAL_LLM_RAM_BYTES = 4 * 1024 * 1024 * 1024;
export const MIN_BACKGROUND_TASK_RAM_BYTES = 3 * 1024 * 1024 * 1024;

function formatRam(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getTotalDeviceMemoryBytes(): number | null {
  const totalMemory = Device.totalMemory;
  if (typeof totalMemory !== 'number' || !Number.isFinite(totalMemory) || totalMemory <= 0) {
    return null;
  }
  return totalMemory;
}

export function isLocalLlmAllowedOnThisDevice(): boolean {
  const totalMemory = getTotalDeviceMemoryBytes();
  return totalMemory === null || totalMemory >= MIN_LOCAL_LLM_RAM_BYTES;
}

export function getLocalLlmRamWarning(): string | null {
  const totalMemory = getTotalDeviceMemoryBytes();
  if (totalMemory === null || totalMemory >= MIN_LOCAL_LLM_RAM_BYTES) {
    return null;
  }

  return `This device has ${formatRam(totalMemory)} RAM. Guru disables on-device text AI below 4.0 GB to avoid crashes.`;
}

export function isLocalLlmUsable(
  profile: Pick<UserProfile, 'useLocalModel' | 'localModelPath'> | null | undefined,
): boolean {
  return !!(profile?.useLocalModel && profile.localModelPath && isLocalLlmAllowedOnThisDevice());
}

/** Returns true if the device has enough RAM for heavy background tasks (orphan recovery, note repair). */
export function isBackgroundRecoveryAllowed(): boolean {
  const totalMemory = getTotalDeviceMemoryBytes();
  return totalMemory === null || totalMemory >= MIN_BACKGROUND_TASK_RAM_BYTES;
}

export async function enforceLocalLlmRamGuard(notify = false): Promise<boolean> {
  const profile = await profileRepository.getProfile();
  if (!profile.useLocalModel || isLocalLlmAllowedOnThisDevice()) {
    return true;
  }

  await profileRepository.updateProfile({ useLocalModel: false, localModelPath: null });
  if (notify) {
    showToast(
      getLocalLlmRamWarning() ??
        'On-device text AI was disabled on this device to avoid low-memory crashes.',
      'warning',
    );
  }
  return false;
}
