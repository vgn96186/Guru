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

const MAX_SHA256_FILE_BYTES = 500_000_000; // 500MB — prevent OOM on multi-GB model files

export async function computeLocalModelFileSha256(filePath: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(filePath);
  if (info.exists && (info.size ?? 0) > MAX_SHA256_FILE_BYTES) {
    throw new Error(
      `File too large for in-memory SHA-256 (${info.size} bytes). Skipping integrity check.`,
    );
  }
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
  let size = info.exists ? info.size ?? 0 : 0;

  // Fix for Android 32-bit integer overflow on files > 2GB (Expo FileSystem bug)
  if (size < 0) {
    size += 4294967296; // 2^32
  }

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

// ── Download with mirror fallback ───────────────────────────────
// If the primary URL fails with a network error, try the mirror once.
// No silent multi-retry loops — fail fast so the user sees the error
// and can tap "Download" again when their network is back.

const HF_MIRRORS = [{ from: 'https://huggingface.co/', to: 'https://hf-mirror.com/' }];

export function getHfMirrorUrl(url: string): string | null {
  for (const m of HF_MIRRORS) {
    if (url.startsWith(m.from)) {
      return url.replace(m.from, m.to);
    }
  }
  return null;
}

function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /unable to resolve host|no address associated|timeout|timed out|econnrefused|econnreset|enetunreach|network|socket|connection.*(reset|refused|abort)/i.test(
    msg,
  );
}

/**
 * Try downloading from `url`. If it fails with a network error and
 * a mirror is available, retry once from the mirror.
 */
export async function createDownloadWithMirrorFallback(
  url: string,
  fileUri: string,
  options: FileSystem.DownloadOptions,
  onProgress: (dp: FileSystem.DownloadProgressData) => void,
): Promise<{ task: FileSystem.DownloadResumable; result: FileSystem.FileSystemDownloadResult }> {
  const task = FileSystem.createDownloadResumable(url, fileUri, options, onProgress);
  try {
    const result = await task.downloadAsync();
    if (result) return { task, result };
    throw new Error('Download returned null');
  } catch (err) {
    const mirror = getHfMirrorUrl(url);
    if (mirror && isNetworkError(err)) {
      console.warn(`[Download] Primary failed (${(err as Error).message}), trying mirror`);
      await deleteLocalModelFile(fileUri);
      const mirrorTask = FileSystem.createDownloadResumable(mirror, fileUri, options, onProgress);
      const mirrorResult = await mirrorTask.downloadAsync();
      if (mirrorResult) return { task: mirrorTask, result: mirrorResult };
      throw new Error('Mirror download also failed', { cause: err });
    }
    throw err;
  }
}
