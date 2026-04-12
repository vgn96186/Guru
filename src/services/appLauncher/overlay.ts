import { Platform } from 'react-native';
import { canDrawOverlays, requestOverlayPermission } from '../../../modules/app-launcher';

/**
 * Check and request draw-over-apps overlay permissions on Android.
 */
export async function ensureOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const hasPerm = await canDrawOverlays();
  if (hasPerm) return true;

  try {
    await requestOverlayPermission();
    // Usually requires manual user action in the opened settings
    return false;
  } catch (err) {
    console.warn('[Overlay] Failed to request overlay permission:', err);
    return false;
  }
}

export { canDrawOverlays, requestOverlayPermission };
