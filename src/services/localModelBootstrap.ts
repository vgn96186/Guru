/**
 * localModelBootstrap.ts
 *
 * Auto-downloads local AI models (Llama + Whisper) on first launch.
 * Runs in the background — does not block app startup.
 * Downloads automatically when no model path is set yet.
 * This makes local LLM + Whisper \"just work\" on first launch,
 * while still allowing users to delete models from Settings.
 *
 * Downloads Whisper first (75MB) since it's needed for transcription,
 * then MedGemma 4B (~2.5GB) for topic extraction and content generation.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from './deviceMemory';
import { showToast } from '../components/Toast';
import { updateLocalModelDownload } from './localModelDownloadState';
import {
  computeLocalModelFileSha256,
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

// SHA-256 integrity for the exact files above (HF Git-LFS oid).
// Used to prevent corrupted-but-large downloads from being treated as valid.
const MODEL_SHA256: Record<'llm' | 'whisper', string> = {
  llm: '8bcb19d3e363f7d1ab27f364032436fd702e735a6f479d6bb7b1cf066e76b443',
  whisper: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69',
};

/**
 * Check if local models need downloading and start background downloads.
 * Downloads Whisper first (small, needed for transcription), then LLM.
 * Safe to call multiple times — idempotent.
 */
export async function bootstrapLocalModels(): Promise<void> {
  const profile = await profileRepository.getProfile();

  // Auto-enable models if no path is configured yet.
  // This means fresh installs will start downloading models in the background
  // without requiring the user to first toggle \"use local model\" in Settings.
  const llmAllowed = isLocalLlmAllowedOnThisDevice();
  const needsLlm = llmAllowed && !profile.localModelPath;
  const needsWhisper = !profile.localWhisperPath;

  if (!needsLlm && !needsWhisper) return;

  // If this is a fresh install on a low-RAM device, skip the heavy LLM download
  // and surface a one-time warning so the user understands why.
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
    await downloadModel(LLM_MODEL, 'llm');
  }
}

// Expected minimum sizes to validate downloads aren't partial
const MIN_MODEL_SIZES: Record<string, number> = {
  llm: 2_200_000_000, // ~2.5GB for MedGemma 4B Q4_K_M
  whisper: 750_000_000, // ~809MB for ggml-large-v3-turbo.bin
};

async function downloadModel(
  model: { name: string; url: string },
  type: 'llm' | 'whisper',
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
      message: type === 'whisper' ? 'Preparing offline transcription' : 'Preparing offline study AI',
    });

    // Check if fully-downloaded file already exists
    const existingValidation = await validateLocalModelFile({
      path: targetUri,
      minBytes: minSize,
    });
    if (existingValidation.exists && existingValidation.isValid) {
      // File exists and meets minimum size threshold; validate SHA-256 too.
      try {
        const expectedSha = MODEL_SHA256[type];
        const actualSha = await computeLocalModelFileSha256(targetUri);
        if (actualSha !== expectedSha) {
          console.warn(
            `[Bootstrap] ${type} model checksum mismatch (existing file). Re-downloading.`,
          );
          await deleteLocalModelFile(targetUri);
        } else {
          // Checksums passed — mark profile ready.
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
            await profileRepository.updateProfile({ localModelPath: targetUri, useLocalModel: true });
          } else {
            await profileRepository.updateProfile({
              localWhisperPath: targetUri,
              useLocalWhisper: true,
            });
          }
          await useAppStore.getState().refreshProfile();
          if (__DEV__) console.log(`[Bootstrap] ${type} model already downloaded and verified at ${targetUri}`);
          return;
        }
      } catch (shaErr) {
        console.warn(`[Bootstrap] ${type} sha256 validation failed. Re-downloading.`, shaErr);
        await deleteLocalModelFile(targetUri);
      }

      // If we got here, the file was deleted due to checksum problems.
    }

    // Clean up any existing partial or undersized file
    if (existingValidation.exists) {
      console.warn(
        `[Bootstrap] Removing invalid/partial ${type} model (size: ${existingValidation.size})`,
      );
      await deleteLocalModelFile(targetUri);
    }

    if (__DEV__) console.log(`[Bootstrap] Starting ${type} download: ${model.name}`);

    // Use createDownloadResumable for resume support
    const downloadResumable = FileSystem.createDownloadResumable(
      model.url,
      partialUri,
      {},
      (progress) => {
        if (progress.totalBytesExpectedToWrite > 0) {
          const pct = Math.round(
            (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100,
          );
          updateLocalModelDownload({
            visible: true,
            source: 'bootstrap',
            type,
            stage: 'downloading',
            modelName: model.name,
            progress: pct,
            downloadedBytes: progress.totalBytesWritten,
            totalBytes: progress.totalBytesExpectedToWrite,
          });
          if (pct % 10 === 0 && __DEV__) console.log(`[Bootstrap] ${type} download: ${pct}%`);
        }
      },
    );

    const result = await downloadResumable.downloadAsync();

    if (result && result.status === 200) {
      // Validate downloaded file size
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

      // Validate SHA-256 to catch corrupted downloads that still meet size thresholds.
      updateLocalModelDownload({
        visible: true,
        source: 'bootstrap',
        type,
        stage: 'verifying',
        modelName: model.name,
        progress: 98,
        downloadedBytes: downloadedValidation.size,
        totalBytes: downloadedValidation.size,
      });
      const expectedSha = MODEL_SHA256[type];
      const actualSha = await computeLocalModelFileSha256(partialUri);
      if (actualSha !== expectedSha) {
        console.warn(`[Bootstrap] ${type} checksum mismatch after download. Re-downloading.`);
        await deleteLocalModelFile(partialUri);
        return;
      }

      // Move from partial to final path (only after checksums pass)
      await FileSystem.moveAsync({ from: partialUri, to: targetUri });

      if (type === 'llm') {
        await profileRepository.updateProfile({ localModelPath: targetUri, useLocalModel: true });
      } else {
        await profileRepository.updateProfile({
          localWhisperPath: targetUri,
          useLocalWhisper: true,
        });
      }
      await useAppStore.getState().refreshProfile();
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
      if (__DEV__) console.log(`[Bootstrap] ${type} model downloaded successfully`);
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
        message: 'Install paused',
      });
    }
  } catch (e) {
    // Non-fatal — user can still use the app, just without local AI
    console.warn(`[Bootstrap] ${type} download error:`, e);
    // Don’t delete partial — resume next time
    updateLocalModelDownload({
      visible: true,
      source: 'bootstrap',
      type,
      stage: 'error',
      modelName: model.name,
      progress: 0,
      message: 'Install paused',
    });
  }
}
