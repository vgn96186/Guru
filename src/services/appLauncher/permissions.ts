import { PermissionsAndroid, Platform } from 'react-native';

const RECORDING_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
] as const;

/**
 * Request necessary permissions for the app launcher (Media Projection / Recording).
 * Only requests permissions that are not already granted.
 */
export async function requestRecordingPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const toRequest: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS][] =
      [];
    for (const perm of RECORDING_PERMISSIONS) {
      const granted = await PermissionsAndroid.check(perm);
      if (!granted) toRequest.push(perm);
    }
    if (toRequest.length === 0) return true;

    const granted = await PermissionsAndroid.requestMultiple(toRequest);
    const recordAudioKey = 'android.permission.RECORD_AUDIO';
    const alreadyHadMic = !toRequest.includes(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return alreadyHadMic || granted[recordAudioKey] === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('[Permissions] Failed to request recording permissions:', err);
    return false;
  }
}
