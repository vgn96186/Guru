import * as Launcher from '../../modules/app-launcher';
import { profileRepository } from '../db/repositories/profileRepository';
import { nowTs } from '../db/database';

export async function maybePromptSamsungBattery(showSheet: () => void) {
  if (!(await Launcher.isSamsungDevice())) return;
  if (await Launcher.isIgnoringBatteryOptimizations()) return;
  const profile = await profileRepository.getProfile();
  if (profile?.samsungBatteryPromptShownAt) return;
  showSheet();
}

export async function markBatteryPromptShown() {
  await profileRepository.updateProfile({ samsungBatteryPromptShownAt: nowTs() });
}
