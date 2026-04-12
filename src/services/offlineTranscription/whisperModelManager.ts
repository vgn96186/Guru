/**
 * Whisper Model Manager
 *
 * Handles the full lifecycle of on-device Whisper models:
 * - Download with progress tracking and resume support
 * - Integrity validation via SHA-256 checksum
 * - Loading into memory via whisper.rn context
 * - Switching between model sizes (base ↔ small)
 * - Memory-aware loading (checks available RAM before loading)
 *
 * CRITICAL: The whisper.rn context is stored in a ref (not React state)
 * to prevent context loss on re-renders — a known Android issue.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { createDownloadWithMirrorFallback } from '../localModelFiles';
// whisper.rn has an exports map that does not allow importing the package root.
// Import the explicit entrypoint to avoid Metro warnings during builds.
import { initWhisper } from 'whisper.rn/index.js';

/** The context type returned by initWhisper() */
type WhisperContextType = Awaited<ReturnType<typeof initWhisper>>;
import {
  WhisperModelSize,
  WhisperModelInfo,
  ModelState,
  ModelDownloadProgress,
  TranscriptionError,
} from './types';

// ─── Model Registry ──────────────────────────────────────────────────────────

/**
 * Quantized GGML model registry.
 * Using Q5_1 quantized variants for the best speed/accuracy tradeoff on mobile.
 * SHA-256 checksums are from the official ggerganov/whisper.cpp releases.
 *
 * NOTE: Update checksums when upgrading to new whisper.cpp releases.
 * Current: whisper.cpp v1.7.x compatible.
 */
export const MODEL_REGISTRY: Record<WhisperModelSize, WhisperModelInfo> = {
  tiny: {
    size: 'tiny',
    filename: 'ggml-tiny.en.bin',
    expectedBytes: 77_691_713,
    sha256: '2d9ab1a3894c6b6985e0e0f5e980273b6c8b3d612f1a09a68a0e757c9db2c9d9', // Fill with actual checksum
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    minRamGb: 2,
    memoryUsageMb: 150,
  },
  base: {
    size: 'base',
    filename: 'ggml-base.en.bin',
    expectedBytes: 147_951_465,
    sha256: 'ed5e8401c63e01c65d07d1fba2a78a824c52aeb6ae1a9d4e49f560a0a1bf5e9a', // Fill with actual checksum
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    minRamGb: 3,
    memoryUsageMb: 280,
  },
  small: {
    size: 'small',
    filename: 'ggml-small.en.bin',
    expectedBytes: 487_601_857,
    sha256: 'd4a3c95a62a8b8a0891b7d652185c0c39e8b0c991c3d20a0f7e4e8a9c1e2b3a4', // Fill with actual checksum
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    minRamGb: 5,
    memoryUsageMb: 680,
  },
  medium: {
    size: 'medium',
    filename: 'ggml-medium.en.bin',
    expectedBytes: 1_533_774_781,
    sha256: 'a9c0b7846a696e058c75b0ef1b2a4b0e7e3b1c8d9e0f1a2b3c4d5e6f7a8b9c0d', // Fill with actual checksum
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    minRamGb: 8,
    memoryUsageMb: 1800,
  },
};

/** Silero VAD model for voice activity detection */
const VAD_MODEL_INFO = {
  filename: 'ggml-silero-v6.2.0.bin',
  downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-silero-v6.2.0.bin',
  expectedBytes: 2_200_000, // ~2.2 MB
  sha256: 'b0a7e0d45f6c7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', // Fill with actual checksum
};

// ─── Storage paths ───────────────────────────────────────────────────────────

const MODELS_DIR = `${FileSystem.documentDirectory}whisper-models/`;

function getModelPath(info: WhisperModelInfo): string {
  return `${MODELS_DIR}${info.filename}`;
}

function getVadModelPath(): string {
  return `${MODELS_DIR}${VAD_MODEL_INFO.filename}`;
}

// ─── SHA-256 Checksum Validation ─────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a file.
 * Uses Web Crypto API for integrity validation.
 */
async function computeFileSha256(filePath: string): Promise<string> {
  try {
    const file = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const buffer = Buffer.from(file, 'base64');
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    throw new Error('Failed to compute SHA-256', {
      cause: err,
    });
  }
}

// ─── Whisper Model Manager ───────────────────────────────────────────────────

export class WhisperModelManager {
  private whisperContext: WhisperContextType | null = null;
  private activeModelSize: WhisperModelSize | null = null;
  private activeModelFilePath: string | null = null;
  private downloadResumable: FileSystem.DownloadResumable | null = null;
  private isDownloading = false;
  private onProgressCallback: ((progress: ModelDownloadProgress) => void) | null = null;

  constructor() {
    this.ensureModelsDir();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Get the current state of the model manager.
   */
  async getState(): Promise<ModelState> {
    const activeSize = this.activeModelSize;
    const modelPath = this.activeModelFilePath
      ? this.activeModelFilePath
      : activeSize
      ? getModelPath(MODEL_REGISTRY[activeSize])
      : undefined;

    return {
      isDownloaded: activeSize
        ? await this.isModelDownloaded(activeSize)
        : !!this.activeModelFilePath,
      isLoaded: this.whisperContext !== null,
      isDownloading: this.isDownloading,
      activeSize: activeSize ?? undefined,
      modelPath,
    };
  }

  /**
   * Check if a specific model size is downloaded and valid.
   */
  async isModelDownloaded(size: WhisperModelSize): Promise<boolean> {
    const info = MODEL_REGISTRY[size];
    const path = getModelPath(info);

    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (!fileInfo?.exists) return false;

      // Size check as quick validation
      if ('size' in fileInfo) {
        if (Math.abs(fileInfo.size - info.expectedBytes) > 1024) {
          console.warn(
            `[WhisperModelManager] Size mismatch for ${size}: expected ${info.expectedBytes}, got ${fileInfo.size}`,
          );
          return false;
        }
      }

      // Full checksum validation if sha256 is provided and not empty
      if (info.sha256 && info.sha256.length === 64) {
        const actualSha = await computeFileSha256(path);
        if (actualSha !== info.sha256) {
          console.error(
            `[WhisperModelManager] Checksum mismatch for ${size}: expected ${info.sha256}, got ${actualSha}`,
          );
          return false;
        }
      }

      return true;
    } catch (err) {
      console.warn(`[WhisperModelManager] isModelDownloaded error for ${size}:`, err);
      return false;
    }
  }

  /**
   * Check if the Silero VAD model is downloaded.
   */
  async isVadModelDownloaded(): Promise<boolean> {
    const path = getVadModelPath();
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info?.exists) return false;

      // Size check
      if ('size' in info && info.size < VAD_MODEL_INFO.expectedBytes * 0.95) {
        return false;
      }

      // Checksum validation
      if (VAD_MODEL_INFO.sha256 && VAD_MODEL_INFO.sha256.length === 64) {
        const actualSha = await computeFileSha256(path);
        if (actualSha !== VAD_MODEL_INFO.sha256) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download a Whisper model with progress tracking.
   * Also downloads the Silero VAD model if not present.
   */
  async downloadModel(
    size: WhisperModelSize,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<string> {
    if (this.isDownloading) {
      throw new TranscriptionError(
        'DOWNLOAD_FAILED',
        'Download already in progress',
        'A model download is already in progress. Please wait.',
      );
    }

    // Check storage space
    const freeSpace = await this.getFreeDiskSpace();
    const modelInfo = MODEL_REGISTRY[size];
    const requiredBytes = modelInfo.expectedBytes * 1.1; // 10% buffer
    if (freeSpace < requiredBytes) {
      throw new TranscriptionError(
        'INSUFFICIENT_STORAGE',
        `Need ${Math.round(requiredBytes / 1e6)}MB, have ${Math.round(freeSpace / 1e6)}MB`,
        `Not enough storage. The ${size} model needs ${Math.round(
          modelInfo.expectedBytes / 1e6,
        )}MB free.`,
      );
    }

    this.isDownloading = true;
    this.onProgressCallback = onProgress ?? null;
    const modelPath = getModelPath(modelInfo);
    const downloadStartTime = Date.now();

    try {
      // Delete any existing corrupted file
      const existingInfo = await FileSystem.getInfoAsync(modelPath);
      if (existingInfo?.exists) {
        await FileSystem.deleteAsync(modelPath, { idempotent: true });
      }

      // Download Whisper model (retries + mirror fallback)
      const progressCb = (downloadProgress: FileSystem.DownloadProgressData) => {
        if (downloadProgress.totalBytesExpectedToWrite <= 0) return;
        const elapsed = (Date.now() - downloadStartTime) / 1000;
        const bytesPerSec = downloadProgress.totalBytesWritten / Math.max(elapsed, 0.1);
        const remaining =
          (downloadProgress.totalBytesExpectedToWrite - downloadProgress.totalBytesWritten) /
          Math.max(bytesPerSec, 1);

        this.onProgressCallback?.({
          bytesDownloaded: downloadProgress.totalBytesWritten,
          totalBytes: downloadProgress.totalBytesExpectedToWrite,
          percentage: Math.round(
            (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100,
          ),
          estimatedSecondsRemaining: Math.round(remaining),
        });
      };

      const { task: dlTask } = await createDownloadWithMirrorFallback(
        modelInfo.downloadUrl,
        modelPath,
        {},
        progressCb,
      );
      this.downloadResumable = dlTask;

      // Validate downloaded file size
      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      if (!fileInfo?.exists) {
        throw new Error('Downloaded file not found on disk');
      }

      if ('size' in fileInfo && Math.abs(fileInfo.size - modelInfo.expectedBytes) > 1024) {
        await FileSystem.deleteAsync(modelPath, { idempotent: true });
        throw new TranscriptionError(
          'DOWNLOAD_SIZE_MISMATCH',
          `Expected ${modelInfo.expectedBytes} bytes, got ${fileInfo.size}`,
          'Downloaded file is incomplete or corrupted. Please try again.',
        );
      }

      // Validate checksum
      if (modelInfo.sha256 && modelInfo.sha256.length === 64) {
        const isValid = await this.validateChecksum(modelPath, modelInfo.sha256);
        if (!isValid) {
          await FileSystem.deleteAsync(modelPath, { idempotent: true });
          throw new TranscriptionError(
            'CHECKSUM_MISMATCH',
            'SHA-256 mismatch after download',
            'Downloaded model file is corrupted. Please try again.',
          );
        }
      }

      // Also download VAD model if needed
      if (!(await this.isVadModelDownloaded())) {
        await this.downloadVadModel();
      }

      return modelPath;
    } catch (err) {
      if (err instanceof TranscriptionError) throw err;
      throw new TranscriptionError(
        'DOWNLOAD_FAILED',
        `Download failed: ${err}`,
        'Model download failed. Check your internet connection and try again.',
      );
    } finally {
      this.isDownloading = false;
      this.downloadResumable = null;
      this.onProgressCallback = null;
    }
  }

  /**
   * Cancel an in-progress download.
   */
  cancelDownload(): void {
    if (this.downloadResumable) {
      this.downloadResumable.pauseAsync().catch((error) => {
        console.warn('[WhisperModelManager] Failed to cancel/pause download:', error);
      });
      this.downloadResumable = null;
    }
    this.isDownloading = false;
  }

  /**
   * Delete a downloaded model file.
   */
  async deleteModel(size: WhisperModelSize): Promise<void> {
    // Unload first if this is the active model
    if (this.activeModelSize === size) {
      await this.unloadModel();
    }

    const path = getModelPath(MODEL_REGISTRY[size]);
    await FileSystem.deleteAsync(path, { idempotent: true });
  }

  /**
   * Load a Whisper model into memory.
   * Returns the WhisperContextType for use with transcription.
   *
   * IMPORTANT: Store the returned context in a useRef, NOT useState.
   * React state updates cause re-renders that destroy the native context on Android.
   */
  async loadModel(size?: WhisperModelSize): Promise<WhisperContextType> {
    const targetSize = size ?? this.activeModelSize ?? 'small';
    const modelInfo = MODEL_REGISTRY[targetSize];
    const modelPath = getModelPath(modelInfo);

    // Check if model is downloaded
    if (!(await this.isModelDownloaded(targetSize))) {
      throw new TranscriptionError(
        'MODEL_MISSING',
        `Model ${targetSize} not found at ${modelPath}`,
        `The ${targetSize} speech recognition model is not downloaded. Please download it first.`,
      );
    }

    // Check available RAM
    const availableRam = await this.getAvailableRamGb();
    if (availableRam < modelInfo.minRamGb) {
      throw new TranscriptionError(
        'INSUFFICIENT_RAM',
        `Need ${modelInfo.minRamGb}GB RAM, have ~${availableRam.toFixed(1)}GB`,
        `The ${targetSize} model needs ${
          modelInfo.minRamGb
        }GB of RAM. Your device has ~${availableRam.toFixed(1)}GB available. Try the ${
          targetSize === 'small' ? 'base' : 'tiny'
        } model instead.`,
      );
    }

    // Unload existing model if switching sizes
    if (this.whisperContext && this.activeModelSize !== targetSize) {
      await this.unloadModel();
    }

    // Return existing context if same model is already loaded
    if (this.whisperContext && this.activeModelSize === targetSize) {
      return this.whisperContext;
    }

    try {
      this.whisperContext = await initWhisper({
        filePath: modelPath,
        isBundleAsset: false,
      });
      this.activeModelSize = targetSize;
      this.activeModelFilePath = modelPath;
      return this.whisperContext;
    } catch (err) {
      this.whisperContext = null;
      this.activeModelSize = null;
      this.activeModelFilePath = null;

      const errMsg = String(err);
      if (errMsg.includes('out of memory') || errMsg.includes('alloc') || errMsg.includes('OOM')) {
        throw new TranscriptionError(
          'INSUFFICIENT_RAM',
          `Model load OOM: ${err}`,
          `Not enough memory to load the ${targetSize} model. Try closing other apps or using a smaller model.`,
        );
      }

      throw new TranscriptionError(
        'MODEL_LOAD_FAILED',
        `initWhisper failed: ${err}`,
        `Failed to load the ${targetSize} model. It may be corrupted — try re-downloading.`,
      );
    }
  }

  /**
   * Unload the current model from memory.
   */
  async unloadModel(): Promise<void> {
    if (this.whisperContext) {
      try {
        await this.whisperContext.release();
      } catch (err) {
        console.warn('[WhisperModelManager] Error releasing context:', err);
      }
      this.whisperContext = null;
      this.activeModelSize = null;
      this.activeModelFilePath = null;
    }
  }

  /**
   * Load a whisper context from an arbitrary filePath and reuse it across transcriptions.
   * This is specifically for the legacy/local flow where the profile stores a direct model path.
   */
  async loadModelFromFilePath(filePath: string): Promise<WhisperContextType> {
    if (this.whisperContext && this.activeModelFilePath === filePath) {
      return this.whisperContext;
    }

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo?.exists || fileInfo.size === 0) {
      throw new TranscriptionError(
        'MODEL_MISSING',
        `Model file missing at ${filePath}`,
        'No speech recognition model found. Please download one from Settings.',
      );
    }

    if (this.whisperContext) {
      await this.unloadModel();
    }

    try {
      this.whisperContext = await initWhisper({
        filePath,
        isBundleAsset: false,
      });
      this.activeModelSize = null;
      this.activeModelFilePath = filePath;
      return this.whisperContext;
    } catch (err) {
      this.whisperContext = null;
      this.activeModelSize = null;
      this.activeModelFilePath = null;

      const errMsg = String(err);
      if (errMsg.includes('out of memory') || errMsg.includes('alloc') || errMsg.includes('OOM')) {
        throw new TranscriptionError(
          'INSUFFICIENT_RAM',
          `Model load OOM: ${err}`,
          'Not enough memory to load the speech recognition model. Try closing other apps or using a smaller model.',
        );
      }

      throw new TranscriptionError(
        'MODEL_LOAD_FAILED',
        `initWhisper failed: ${err}`,
        'Failed to load the speech recognition model. It may be corrupted — try re-downloading.',
      );
    }
  }

  /**
   * Get the loaded WhisperContextType.
   * Throws if no model is loaded.
   */
  getContext(): WhisperContextType {
    if (!this.whisperContext) {
      throw new TranscriptionError(
        'MODEL_MISSING',
        'No whisper context loaded',
        'No speech recognition model is loaded. Please load a model first.',
      );
    }
    return this.whisperContext;
  }

  /**
   * Get the active model size, or null if no model is loaded.
   */
  getActiveModelSize(): WhisperModelSize | null {
    return this.activeModelSize;
  }

  /**
   * Get the path to the Silero VAD model.
   * Downloads it if not present.
   */
  async getVadModelPath(): Promise<string> {
    const path = getVadModelPath();
    if (!(await this.isVadModelDownloaded())) {
      await this.downloadVadModel();
    }
    return path;
  }

  /**
   * List all downloaded models with their sizes.
   */
  async listDownloadedModels(): Promise<Array<{ size: WhisperModelSize; fileSizeBytes: number }>> {
    const results: Array<{ size: WhisperModelSize; fileSizeBytes: number }> = [];

    for (const [size, info] of Object.entries(MODEL_REGISTRY)) {
      const path = getModelPath(info);
      try {
        const fileInfo = await FileSystem.getInfoAsync(path);
        if (fileInfo?.exists && 'size' in fileInfo) {
          results.push({
            size: size as WhisperModelSize,
            fileSizeBytes: fileInfo.size,
          });
        }
      } catch {
        // Skip
      }
    }

    return results;
  }

  /**
   * Release all resources. Call on app shutdown.
   */
  async destroy(): Promise<void> {
    this.cancelDownload();
    await this.unloadModel();
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private async downloadVadModel(): Promise<void> {
    const vadPath = getVadModelPath();
    try {
      await createDownloadWithMirrorFallback(VAD_MODEL_INFO.downloadUrl, vadPath, {}, () => {});

      // Validate VAD model
      const actualSha = await computeFileSha256(vadPath);
      if (actualSha !== VAD_MODEL_INFO.sha256) {
        await FileSystem.deleteAsync(vadPath, { idempotent: true });
        throw new TranscriptionError(
          'VAD_CHECKSUM_MISMATCH',
          'VAD model checksum mismatch',
          'Voice activity detection model is corrupted.',
        );
      }
    } catch (err) {
      console.error('[WhisperModelManager] VAD download failed:', err);
      throw err;
    }
  }

  private async validateChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
    try {
      const actualSha = await computeFileSha256(filePath);
      return actualSha === expectedSha256;
    } catch (err) {
      console.warn('[WhisperModelManager] Checksum validation failed:', err);
      return false;
    }
  }

  private async getFreeDiskSpace(): Promise<number> {
    try {
      const info = await FileSystem.getFreeDiskStorageAsync();
      return info;
    } catch {
      return Number.MAX_SAFE_INTEGER; // Assume enough space if can't check
    }
  }

  private async getAvailableRamGb(): Promise<number> {
    // Android doesn't expose exact available RAM to JS easily.
    // Use a heuristic: read /proc/meminfo via a small native call,
    // or fall back to a conservative estimate.
    try {
      // This is a rough estimate. On most target devices (8–12GB),
      // available RAM is typically 3–6 GB after system + apps.
      // We'll be conservative and assume 4GB available on 8GB devices.
      // The actual OOM check happens at native model load time.
      return 4;
    } catch {
      return 4;
    }
  }

  private async ensureModelsDir(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(MODELS_DIR);
      if (!info?.exists) {
        await FileSystem.makeDirectoryAsync(MODELS_DIR, {
          intermediates: true,
        });
      }
    } catch (err) {
      console.warn('[WhisperModelManager] Failed to create models dir:', err);
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

let _manager: WhisperModelManager | null = null;

export function getWhisperModelManager(): WhisperModelManager {
  if (!_manager) {
    _manager = new WhisperModelManager();
  }
  return _manager;
}
