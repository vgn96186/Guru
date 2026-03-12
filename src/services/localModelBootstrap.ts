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
 * then Qwen-2.5-3B (~2GB) for topic extraction and content generation.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from './deviceMemory';
import { showToast } from '../components/Toast';

const LLM_MODEL = {
  name: 'qwen2.5-3b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
};

const WHISPER_MODEL = {
  name: 'ggml-small.en.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
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

  // Download Whisper first (75MB) — it's critical for transcription
  if (needsWhisper) {
    await downloadModel(WHISPER_MODEL, 'whisper');
  }

  // Then download LLM (~2GB) — used for topic extraction and content generation
  if (needsLlm) {
    await downloadModel(LLM_MODEL, 'llm');
  }
}

// Expected minimum sizes to validate downloads aren't partial
const MIN_MODEL_SIZES: Record<string, number> = {
  'llm': 1_500_000_000,    // ~1.5GB for Qwen 3B Q4
  'whisper': 50_000_000,   // ~50MB for Whisper small.en
};

async function downloadModel(
  model: { name: string; url: string },
  type: 'llm' | 'whisper',
): Promise<void> {
  const targetUri = `${FileSystem.documentDirectory}${model.name}`;
  const partialUri = `${targetUri}.partial`;
  const minSize = MIN_MODEL_SIZES[type] ?? 1000;

  try {
    // Check if fully-downloaded file already exists
    const info = await FileSystem.getInfoAsync(targetUri);
    if (info.exists && (info as any).size >= minSize) {
      // File exists and meets minimum size threshold
      if (type === 'llm') {
        await profileRepository.updateProfile({ localModelPath: targetUri, useLocalModel: true });
      } else {
        await profileRepository.updateProfile({ localWhisperPath: targetUri, useLocalWhisper: true });
      }
      await useAppStore.getState().refreshProfile();
      console.log(`[Bootstrap] ${type} model already downloaded at ${targetUri}`);
      return;
    }

    // Clean up any existing partial or undersized file
    if (info.exists) {
      console.warn(`[Bootstrap] Removing invalid/partial ${type} model (size: ${(info as any).size})`);
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    }

    console.log(`[Bootstrap] Starting ${type} download: ${model.name}`);

    // Use createDownloadResumable for resume support
    const downloadResumable = FileSystem.createDownloadResumable(
      model.url,
      partialUri,
      {},
      (progress) => {
        if (progress.totalBytesExpectedToWrite > 0) {
          const pct = Math.round((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100);
          if (pct % 10 === 0) console.log(`[Bootstrap] ${type} download: ${pct}%`);
        }
      },
    );

    const result = await downloadResumable.downloadAsync();

    if (result && result.status === 200) {
      // Validate downloaded file size
      const downloadedInfo = await FileSystem.getInfoAsync(partialUri);
      if (!downloadedInfo.exists || (downloadedInfo as any).size < minSize) {
        console.warn(`[Bootstrap] ${type} download too small: ${(downloadedInfo as any).size} bytes, expected >= ${minSize}`);
        await FileSystem.deleteAsync(partialUri, { idempotent: true });
        return;
      }

      // Move from partial to final path
      await FileSystem.moveAsync({ from: partialUri, to: targetUri });

      if (type === 'llm') {
        await profileRepository.updateProfile({ localModelPath: targetUri, useLocalModel: true });
      } else {
        await profileRepository.updateProfile({ localWhisperPath: targetUri, useLocalWhisper: true });
      }
      await useAppStore.getState().refreshProfile();
      console.log(`[Bootstrap] ${type} model downloaded successfully`);
    } else {
      console.warn(`[Bootstrap] ${type} download failed with status ${result?.status}`);
      await FileSystem.deleteAsync(partialUri, { idempotent: true });
    }
  } catch (e) {
    // Non-fatal — user can still use the app, just without local AI
    console.warn(`[Bootstrap] ${type} download error:`, e);
    // Don’t delete partial — resume next time
  }
}
