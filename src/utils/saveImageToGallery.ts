import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

/**
 * Saves an image to the device photo library (requires user permission).
 * Supports `file://`, `content://`, and remote `http(s)://` URIs (downloads to cache first).
 */
export async function saveImageToDeviceGallery(uri: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Photo library permission is required to save images.');
  }

  let localUri = uri;
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const lower = uri.toLowerCase();
    const ext = lower.includes('.png')
      ? 'png'
      : lower.includes('.jpg') || lower.includes('.jpeg')
        ? 'jpg'
        : lower.includes('.webp')
          ? 'webp'
          : 'png';
    const dest = `${FileSystem.cacheDirectory}guru_save_${Date.now()}.${ext}`;
    const result = await FileSystem.downloadAsync(uri, dest);
    localUri = result.uri;
  }

  await MediaLibrary.saveToLibraryAsync(localUri);
}
