import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Request necessary permissions for the app launcher (Media Projection / Recording).
 */
export async function requestRecordingPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    ]);

    return (
      granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (err) {
    console.warn('[Permissions] Failed to request recording permissions:', err);
    return false;
  }
}
