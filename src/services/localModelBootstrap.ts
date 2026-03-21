/**
 * localModelBootstrap.ts
 *
 * Auto-downloads local AI models (Llama + Whisper) on first launch.
 * Runs in the background — does not block app startup.
 * Downloads automatically when no model path is set yet.
 * This makes local LLM + Whisper "just work" on first launch,
 * while still allowing users to delete models from Settings.
 *
 * Downloads Whisper first (75MB) since it's needed for transcription,
 * then MedGemma 4B (~2.5GB) for topic extraction and content generation.
 *
 * Supports pause/resume — partial downloads are kept across app restarts.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from './deviceMemory';
import { showToast } from '../components/Toast';
import { updateLocalModelDownload } from './localModelDownloadState';
import {
  deleteLocalModelFile,
  getLocalModelFilePath,
  validateLocalModelFile,
} from './localModelFiles';

const LLM_MODEL = {
  name: 'medgemma-4b-it-q4_k_m.gguf',
  url: 'https://huggingface.co/hungqbui/medgemma-4b-it-Q4_K_M-GGUF/resolve/main/medgemma-4b-it-q4_k_m.gguf',
};

const WHISPER_MODEL = {
  name: 'ggml-large-v3-turbo.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
};

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

// Active download handles — exposed for pause/resume from UI
let activeDownload: FileSystem.DownloadResumable | null = null;
let activeDownloadType: 'llm' | 'whisper' | null = null;
let isPaused = false;

async function refreshProfileSafely() {
  await useAppStore.getState()?.refreshProfile?.();
}

/**
 * Pause the active download. The partial file is kept for resume.
 */
export async function pauseDownload(): Promise<void> {
  if (!activeDownload || isPaused) return;
  try {
    const savable = await activeDownload.pauseAsync();
    isPaused = true;
    // Persist the resume data so we can resume after app restart
    if (savable && activeDownloadType) {
      const resumeDataPath = getResumeDataPath(activeDownloadType);
      await FileSystem.writeAsStringAsync(resumeDataPath, JSON.stringify(savable));
    }
    updateLocalModelDownload({
      visible: true,
      source: 'bootstrap',
      type: activeDownloadType!,
      stage: 'error',
      modelName: activeDownloadType === 'whisper' ? WHISPER_MODEL.name : LLM_MODEL.name,
      progress: 0,
      message: 'Download paused',
    });
    if (isDev) console.log(`[Bootstrap] ${activeDownloadType} download paused`);
  } catch (e) {
    console.warn('[Bootstrap] Pause failed:', e);
  }
}

/**
 * Resume a paused download.
 */
export async function resumeDownload(): Promise<void> {
  if (!activeDownload || !isPaused) return;
  isPaused = false;
  try {
    const result = await activeDownload.resumeAsync();
    if (result && result.status === 200) {
      await handleDownloadComplete(activeDownloadType!);
    }
  } catch (e) {
    console.warn(`[Bootstrap] Resume failed:`, e);
    isPaused = true;
  }
}

export function isDownloadPaused(): boolean {
  return isPaused;
}

export function getActiveDownloadType(): 'llm' | 'whisper' | null {
  return activeDownloadType;
}

function getResumeDataPath(type: 'llm' | 'whisper'): string {
  return `${FileSystem.documentDirectory}${type}-download-resume.json`;
}

/**
 * Check if local models need downloading and start background downloads.
 * Downloads Whisper first (small, needed for transcription), then LLM.
 * Safe to call multiple times — idempotent.
 */
export async function bootstrapLocalModels(): Promise<void> {
  const profile = await profileRepository.getProfile();

  const llmAllowed = isLocalLlmAllowedOnThisDevice();
  const needsLlm = !profile.localModelPath;
  const needsWhisper = !profile.localWhisperPath;

  if (!needsLlm && !needsWhisper) return;

  if (!llmAllowed && !profile.localModelPath) {
    const warning = getLocalLlmRamWarning();
    if (warning) {
      showToast(warning, 'warning');
    }
  }

  // Download Whisper first — it's critical for transcription
  if (needsWhisper) {
    await downloadModel(WHISPER_MODEL, 'whisper');
  }

  // Then download LLM (~2.5GB) — used for topic extraction and content generation
  if (needsLlm) {
    await downloadModel(LLM_MODEL, 'llm', { autoEnable: llmAllowed });
  }
}

// Expected minimum sizes to validate downloads aren't partial
const MIN_MODEL_SIZES: Record<string, number> = {
  llm: 2_200_000_000, // ~2.5GB for MedGemma 4B Q4_K_M
  whisper: 750_000_000, // ~809MB for ggml-large-v3-turbo.bin
};

async function handleDownloadComplete(type: 'llm' | 'whisper'): Promise<void> {
  const model = type === 'llm' ? LLM_MODEL : WHISPER_MODEL;
  const targetUri = getLocalModelFilePath(model.name);
  const partialUri = `${targetUri}.partial`;
  const minSize = MIN_MODEL_SIZES[type] ?? 1000;

  const downloadedValidation = await validateLocalModelFile({
    path: partialUri,
    minBytes: minSize,
  });
  if (!downloadedValidation.exists || !downloadedValidation.isValid) {
    console.warn(
      `[Bootstrap] ${type} download too small: ${downloadedValidation.size} bytes, expected >= ${minSize}`,
    );
    await deleteLocalModelFile(partialUri);
    return;
  }

  await FileSystem.moveAsync({ from: partialUri, to: targetUri });

  if (type === 'llm') {
    await profileRepository.updateProfile({
      localModelPath: targetUri,
      useLocalModel: isLocalLlmAllowedOnThisDevice(),
    });
  } else {
    await profileRepository.updateProfile({
      localWhisperPath: targetUri,
      useLocalWhisper: true,
    });
  }
  await refreshProfileSafely();
  updateLocalModelDownload({
    visible: true,
    source: 'bootstrap',
    type,
    stage: 'complete',
    modelName: model.name,
    progress: 100,
    downloadedBytes: downloadedValidation.size,
    totalBytes: downloadedValidation.size,
  });

  // Clean up resume data
  try {
    await FileSystem.deleteAsync(getResumeDataPath(type), { idempotent: true });
  } catch {}

  activeDownload = null;
  activeDownloadType = null;
  isPaused = false;
  if (isDev) console.log(`[Bootstrap] ${type} model downloaded successfully`);
}

function makeProgressCallback(type: 'llm' | 'whisper', modelName: string) {
  return (progress: FileSystem.DownloadProgressData) => {
    if (progress.totalBytesExpectedToWrite > 0) {
      const pct = Math.round(
        (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100,
      );
      updateLocalModelDownload({
        visible: true,
        source: 'bootstrap',
        type,
        stage: 'downloading',
        modelName,
        progress: pct,
        downloadedBytes: progress.totalBytesWritten,
        totalBytes: progress.totalBytesExpectedToWrite,
      });
      if (pct % 10 === 0 && isDev) console.log(`[Bootstrap] ${type} download: ${pct}%`);
    }
  };
}

async function downloadModel(
  model: { name: string; url: string },
  type: 'llm' | 'whisper',
  options?: { autoEnable?: boolean },
): Promise<void> {
  const targetUri = getLocalModelFilePath(model.name);
  const partialUri = `${targetUri}.partial`;
  const minSize = MIN_MODEL_SIZES[type] ?? 1000;

  try {
    updateLocalModelDownload({
      visible: true,
      source: 'bootstrap',
      type,
      stage: 'preparing',
      modelName: model.name,
      progress: 2,
      message:
        type === 'whisper' ? 'Preparing offline transcription' : 'Preparing offline study AI',
    });

    // Check if fully-downloaded file already exists
    const existingValidation = await validateLocalModelFile({
      path: targetUri,
      minBytes: minSize,
    });
    if (existingValidation.exists && existingValidation.isValid) {
      updateLocalModelDownload({
        visible: true,
        source: 'bootstrap',
        type,
        stage: 'complete',
        modelName: model.name,
        progress: 100,
        downloadedBytes: existingValidation.size,
        totalBytes: existingValidation.size,
      });
      if (type === 'llm') {
        await profileRepository.updateProfile({
          localModelPath: targetUri,
          useLocalModel: options?.autoEnable ?? true,
        });
      } else {
        await profileRepository.updateProfile({
          localWhisperPath: targetUri,
          useLocalWhisper: true,
        });
      }
      await refreshProfileSafely();
      if (isDev) console.log(`[Bootstrap] ${type} model already available at ${targetUri}`);
      return;
    }

    // Clean up undersized final file (not the partial — we want to resume that)
    if (existingValidation.exists) {
      console.warn(
        `[Bootstrap] Removing invalid ${type} model at target path (size: ${existingValidation.size})`,
      );
      await deleteLocalModelFile(targetUri);
    }

    // Try to resume from saved resume data (persisted across app restarts)
    const resumeDataPath = getResumeDataPath(type);
    let resumed = false;
    try {
      const resumeJson = await FileSystem.readAsStringAsync(resumeDataPath);
      const resumeData = JSON.parse(resumeJson);
      if (resumeData?.url === model.url) {
        if (isDev) console.log(`[Bootstrap] Resuming ${type} download from saved state`);
        const downloadResumable = new FileSystem.DownloadResumable(
          resumeData.url,
          resumeData.fileUri,
          resumeData.options ?? {},
          makeProgressCallback(type, model.name),
          resumeData.resumeData,
        );
        activeDownload = downloadResumable;
        activeDownloadType = type;
        isPaused = false;

        const result = await downloadResumable.resumeAsync();
        if (result && result.status === 200) {
          await handleDownloadComplete(type);
          return;
        }
        resumed = true;
      }
    } catch {
      // No resume data or it's invalid — start fresh
    }

    if (!resumed) {
      // Check if partial file exists (download was interrupted without saving resume data)
      const partialInfo = await FileSystem.getInfoAsync(partialUri);
      if (partialInfo.exists) {
        if (isDev) console.log(`[Bootstrap] Found partial ${type} file, deleting to start fresh`);
        await deleteLocalModelFile(partialUri);
      }

      if (isDev) console.log(`[Bootstrap] Starting ${type} download: ${model.name}`);

      const downloadResumable = FileSystem.createDownloadResumable(
        model.url,
        partialUri,
        { headers: { 'Accept-Encoding': 'identity' } },
        makeProgressCallback(type, model.name),
      );

      activeDownload = downloadResumable;
      activeDownloadType = type;
      isPaused = false;

      const result = await downloadResumable.downloadAsync();

      if (result && result.status === 200) {
        await handleDownloadComplete(type);
      } else {
        console.warn(`[Bootstrap] ${type} download failed with status ${result?.status}`);
        await deleteLocalModelFile(partialUri);
        updateLocalModelDownload({
          visible: true,
          source: 'bootstrap',
          type,
          stage: 'error',
          modelName: model.name,
          progress: 0,
          message: 'Download failed',
        });
      }
    }
  } catch (e) {
    // Non-fatal — user can still use the app, just without local AI
    console.warn(`[Bootstrap] ${type} download error:`, e);
    // Don't delete partial — resume next time
    updateLocalModelDownload({
      visible: true,
      source: 'bootstrap',
      type,
      stage: 'error',
      modelName: model.name,
      progress: 0,
      message: 'Install paused',
    });
    activeDownload = null;
    activeDownloadType = null;
    isPaused = false;
  }
}
