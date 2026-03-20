import * as FileSystem from 'expo-file-system/legacy';

export interface LocalModelFileValidationOptions {
  path: string;
  minBytes?: number;
  sha256?: string;
}

export interface LocalModelFileValidationResult {
  exists: boolean;
  size: number;
  isValid: boolean;
}

export function getLocalModelFilePath(fileName: string): string {
  return `${FileSystem.documentDirectory}${fileName}`;
}

export async function computeLocalModelFileSha256(filePath: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(filePath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const buffer = Buffer.from(base64, 'base64');
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function validateLocalModelFile(
  options: LocalModelFileValidationOptions,
): Promise<LocalModelFileValidationResult> {
  const info = await FileSystem.getInfoAsync(options.path);
  const size = info.exists ? info.size ?? 0 : 0;

  if (!info.exists) {
    return { exists: false, size: 0, isValid: false };
  }

  if (options.minBytes && size < options.minBytes) {
    return { exists: true, size, isValid: false };
  }

  if (options.sha256) {
    const actualSha = await computeLocalModelFileSha256(options.path);
    return {
      exists: true,
      size,
      isValid: actualSha === options.sha256,
    };
  }

  return { exists: true, size, isValid: true };
}

export async function deleteLocalModelFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await FileSystem.deleteAsync(path, { idempotent: true });
}
