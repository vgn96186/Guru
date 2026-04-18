import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { useProfileQuery, useProfileActions } from '../hooks/queries/useProfile';
import ScreenHeader from '../components/ScreenHeader';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { linearTheme as n } from '../theme/linearTheme';
import LinearButton from '../components/primitives/LinearButton';
import LinearDivider from '../components/primitives/LinearDivider';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import {
  createDownloadWithMirrorFallback,
  deleteLocalModelFile,
  getLocalModelFilePath,
  validateLocalModelFile,
} from '../services/localModelFiles';
import {
  showInfo,
  showSuccess,
  showWarning,
  showError,
  confirmDestructive,
} from '../components/dialogService';
import {
  cancelBootstrapDownload,
  isBootstrapDownloadingModel,
} from '../services/localModelBootstrap';
import {
  clearLocalModelDownload,
  getLocalModelDownloadSnapshot,
  subscribeToLocalModelDownload,
  updateLocalModelDownload,
} from '../services/localModelDownloadState';

const RECOMMENDED_MODELS = [
  {
    id: 'gemma-4-e4b',
    name: 'gemma-4-E4B-it.litertlm',
    url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm',
    desc: 'Recommended. Gemma 4 4B with 128K context, native function calling, and advanced multi-step reasoning (~3.6 GB).',
  },
  {
    id: 'gemma-4-e2b',
    name: 'gemma-4-E2B-it.litertlm',
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm',
    desc: 'Lighter Gemma 4 2B model. Faster inference with native structured output (~2.6 GB).',
  },
];

const WHISPER_MODELS = [
  {
    id: 'whisper-large-v3-turbo',
    name: 'ggml-large-v3-turbo.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    desc: 'Recommended. Whisper large-v3-turbo for the best local accuracy, but it is very large (~1.6 GB).',
  },
  {
    id: 'whisper-tiny',
    name: 'ggml-tiny.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    desc: 'Tiny English model (~75 MB). Fast but low accuracy — only works with clear, close-mic audio.',
  },
  {
    id: 'whisper-base',
    name: 'ggml-base.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    desc: 'Base English model (~141 MB). Better than tiny without the storage hit of small.',
  },
  {
    id: 'whisper-small',
    name: 'ggml-small.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    desc: 'Small English model (~466 MB). Good balance of speed and accuracy for speaker audio.',
  },
  {
    id: 'whisper-medium',
    name: 'ggml-medium.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    desc: 'Medium English model (~1.5 GB). Strong local accuracy with lower memory demand than large-v3-turbo.',
  },
];

const MODEL_MIN_BYTES: Record<string, number> = {
  'gemma-4-E4B-it.litertlm': 3_400_000_000,
  'gemma-4-E2B-it.litertlm': 2_400_000_000,
  'ggml-large-v3-turbo.bin': 750_000_000,
  'ggml-tiny.en.bin': 70_000_000,
  'ggml-base.en.bin': 120_000_000,
  'ggml-small.en.bin': 380_000_000,
  'ggml-medium.en.bin': 1_200_000_000,
};

const IMPORT_MIN_BYTES = {
  llm: 1_000_000_000, // Accepts current 2B/4B LiteRT models while rejecting tiny/bad files
  whisper: 70_000_000, // Smallest supported whisper.cpp model in app list
} as const;

function getModelMinBytes(modelName: string): number | undefined {
  return MODEL_MIN_BYTES[modelName];
}

function getMinBytesForPath(path: string): number | undefined {
  const modelName = path.split('/').pop() ?? '';
  return getModelMinBytes(modelName);
}

function formatInstallBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  const mb = bytes / 1_000_000;
  return `${Math.round(mb)} MB`;
}

export default function LocalModelScreen() {
  const { data: profile } = useProfileQuery();
  const { setUseLocalModel, setLocalModelPath, setUseLocalWhisper, setLocalWhisperPath } =
    useProfileActions();
  const localLlmWarning = getLocalLlmRamWarning();
  const localLlmBlocked = !isLocalLlmAllowedOnThisDevice();

  // LLM State
  const [downloadingLlm, setDownloadingLlm] = useState(false);
  const [progressLlm, setProgressLlm] = useState(0);
  const [taskLlm, setTaskLlm] = useState<FileSystem.DownloadResumable | null>(null);

  // Whisper State
  const [downloadingWhisper, setDownloadingWhisper] = useState(false);
  const [progressWhisper, setProgressWhisper] = useState(0);
  const [taskWhisper, setTaskWhisper] = useState<FileSystem.DownloadResumable | null>(null);

  // Track which model files already exist on disk (even if profile path is null)
  const [existingLlmFiles, setExistingLlmFiles] = useState<Set<string>>(new Set());
  const [existingWhisperFiles, setExistingWhisperFiles] = useState<Set<string>>(new Set());

  const localModelPath = profile?.localModelPath;
  const useLocalModel = profile?.useLocalModel ?? false;
  const isLlmDownloaded = !!localModelPath;

  const localWhisperPath = profile?.localWhisperPath;
  const useLocalWhisper = profile?.useLocalWhisper ?? false;
  const isWhisperDownloaded = !!localWhisperPath;

  // On mount: scan filesystem for already-downloaded model files
  // This catches models downloaded by bootstrap or previous sessions
  useEffect(() => {
    async function scanForExistingFiles() {
      const llmFound = new Set<string>();
      const whisperFound = new Set<string>();
      let registeredLlmPath = localModelPath;
      let registeredWhisperPath = localWhisperPath;

      for (const model of RECOMMENDED_MODELS) {
        const path = getLocalModelFilePath(model.name);
        const info = await validateLocalModelFile({ path, minBytes: getModelMinBytes(model.name) });
        if (info.exists && info.isValid) {
          llmFound.add(model.id);
          if (!registeredLlmPath) {
            await setLocalModelPath(path);
            registeredLlmPath = path;
          }
        }
      }

      for (const model of WHISPER_MODELS) {
        const path = getLocalModelFilePath(model.name);
        const info = await validateLocalModelFile({ path, minBytes: getModelMinBytes(model.name) });
        if (info.exists && info.isValid) {
          whisperFound.add(model.id);
          if (!registeredWhisperPath) {
            await setLocalWhisperPath(path);
            registeredWhisperPath = path;
          }
        }
      }

      setExistingLlmFiles(llmFound);
      setExistingWhisperFiles(whisperFound);
    }
    scanForExistingFiles();
  }, [localModelPath, localWhisperPath, setLocalModelPath, setLocalWhisperPath]);

  // Validate that stored paths still point to real files
  useEffect(() => {
    if (localModelPath) {
      validateLocalModelFile({
        path: localModelPath,
        minBytes: getMinBytesForPath(localModelPath),
      }).then((info) => {
        if (!info.exists || !info.isValid) {
          setLocalModelPath(null);
          setUseLocalModel(false);
        }
      });
    }
    if (localWhisperPath) {
      validateLocalModelFile({
        path: localWhisperPath,
        minBytes: getMinBytesForPath(localWhisperPath),
      }).then((info) => {
        if (!info.exists || !info.isValid) {
          setLocalWhisperPath(null);
          setUseLocalWhisper(false);
        }
      });
    }
  }, [
    localModelPath,
    localWhisperPath,
    setLocalModelPath,
    setLocalWhisperPath,
    setUseLocalModel,
    setUseLocalWhisper,
  ]);

  const [installSnap, setInstallSnap] = useState(getLocalModelDownloadSnapshot);
  useEffect(() => subscribeToLocalModelDownload(setInstallSnap), []);

  const isGlobalInstalling = (t: 'llm' | 'whisper') => {
    const s = installSnap;
    if (!s?.visible || s.type !== t) return false;
    return s.stage === 'preparing' || s.stage === 'downloading' || s.stage === 'verifying';
  };

  const progressPercentFor = (
    t: 'llm' | 'whisper',
    localFrac: number,
    downloadingLocal: boolean,
  ) => {
    const s = installSnap;
    if (
      s?.visible &&
      s.type === t &&
      (s.stage === 'preparing' || s.stage === 'downloading' || s.stage === 'verifying')
    ) {
      return Math.min(100, Math.max(0, Math.round(s.progress)));
    }
    if (downloadingLocal) return Math.round(localFrac * 100);
    return 0;
  };

  const handleDownload = async (
    model: { id: string; name: string; url: string; desc: string },
    type: 'llm' | 'whisper',
  ) => {
    try {
      const dlSnap = getLocalModelDownloadSnapshot();
      const bootstrapBusySameFile =
        dlSnap?.visible &&
        dlSnap.source === 'bootstrap' &&
        dlSnap.type === type &&
        dlSnap.modelName === model.name &&
        (dlSnap.stage === 'preparing' || dlSnap.stage === 'downloading');

      if (bootstrapBusySameFile || isBootstrapDownloadingModel(model.name, type)) {
        void showInfo(
          'Already downloading',
          `${model.name} is downloading from startup. Use the progress banner or wait here — starting again would restart from the beginning.`,
        );
        return;
      }

      // Stop any background bootstrap download for another artifact so we don't race paths.
      await cancelBootstrapDownload();
      clearLocalModelDownload();

      const isLlm = type === 'llm';
      const minBytes = getModelMinBytes(model.name);
      if (isLlm) {
        setDownloadingLlm(true);
        setProgressLlm(0);
      } else {
        setDownloadingWhisper(true);
        setProgressWhisper(0);
      }

      updateLocalModelDownload({
        visible: true,
        source: 'manual',
        type,
        stage: 'preparing',
        modelName: model.name,
        progress: 2,
        message:
          type === 'whisper' ? 'Preparing offline transcription' : 'Preparing offline study AI',
      });

      const targetUri = getLocalModelFilePath(model.name);
      const partialUri = `${targetUri}.partial`;
      const fileInfo = await validateLocalModelFile({ path: targetUri, minBytes });

      if (fileInfo.exists && fileInfo.isValid) {
        if (isLlm) {
          setLocalModelPath(targetUri);
          if (!localLlmBlocked) {
            await setUseLocalModel(true);
          }
        } else {
          setLocalWhisperPath(targetUri);
        }
        if (isLlm) setDownloadingLlm(false);
        else setDownloadingWhisper(false);
        clearLocalModelDownload();
        void showInfo('Already Downloaded', `${model.name} is already on your device.`);
        return;
      }

      if (fileInfo.exists && !fileInfo.isValid) {
        await deleteLocalModelFile(targetUri);
      }

      // Recovery path for interrupted bootstrap downloads:
      // if a valid `.partial` artifact exists, finalize it instead of re-downloading.
      const partialInfo = await validateLocalModelFile({ path: partialUri, minBytes });
      if (partialInfo.exists && partialInfo.isValid) {
        await FileSystem.moveAsync({ from: partialUri, to: targetUri });
        if (isLlm) {
          setLocalModelPath(targetUri);
          if (!localLlmBlocked) {
            await setUseLocalModel(true);
          }
          setExistingLlmFiles((prev) => new Set([...prev, model.id]));
        } else {
          setLocalWhisperPath(targetUri);
          setExistingWhisperFiles((prev) => new Set([...prev, model.id]));
        }
        if (isLlm) setDownloadingLlm(false);
        else setDownloadingWhisper(false);
        updateLocalModelDownload({
          visible: true,
          source: 'manual',
          type,
          stage: 'complete',
          modelName: model.name,
          progress: 100,
          downloadedBytes: partialInfo.size,
          totalBytes: partialInfo.size,
        });
        void showSuccess('Recovered', `${model.name} was recovered from an interrupted download.`);
        return;
      }

      // Clean up any leftover .partial / .partial.chunkN files from
      // previous attempts (bootstrap parallel chunks, interrupted downloads).
      if (partialInfo.exists) {
        await deleteLocalModelFile(partialUri);
      }
      for (let i = 0; i < 8; i++) {
        await deleteLocalModelFile(`${partialUri}.chunk${i}`);
      }

      const progressCb = (dp: FileSystem.DownloadProgressData) => {
        if (dp.totalBytesExpectedToWrite > 0) {
          const pc = dp.totalBytesWritten / dp.totalBytesExpectedToWrite;
          if (isLlm) setProgressLlm(pc);
          else setProgressWhisper(pc);
          updateLocalModelDownload({
            visible: true,
            source: 'manual',
            type,
            stage: 'downloading',
            modelName: model.name,
            progress: Math.round(pc * 100),
            downloadedBytes: dp.totalBytesWritten,
            totalBytes: dp.totalBytesExpectedToWrite,
          });
        }
      };

      const { task, result: res } = await createDownloadWithMirrorFallback(
        model.url,
        partialUri,
        { headers: { 'Accept-Encoding': 'identity' } },
        progressCb,
      );

      if (isLlm) setTaskLlm(task);
      else setTaskWhisper(task);

      if (res.status === 200) {
        updateLocalModelDownload({
          visible: true,
          source: 'manual',
          type,
          stage: 'verifying',
          modelName: model.name,
          progress: 100,
          message: 'Verifying model integrity',
        });
        const downloaded = await validateLocalModelFile({ path: partialUri, minBytes });
        if (!downloaded.isValid) {
          throw new Error(
            `${model.name} appears incomplete (${downloaded.size} bytes). Please retry the download.`,
          );
        }
        await FileSystem.moveAsync({ from: partialUri, to: targetUri });
        if (isLlm) {
          setLocalModelPath(targetUri);
          if (!localLlmBlocked) {
            await setUseLocalModel(true);
          }
          setExistingLlmFiles((prev) => new Set([...prev, model.id]));
        } else {
          setLocalWhisperPath(targetUri);
          setExistingWhisperFiles((prev) => new Set([...prev, model.id]));
        }
        updateLocalModelDownload({
          visible: true,
          source: 'manual',
          type,
          stage: 'complete',
          modelName: model.name,
          progress: 100,
          downloadedBytes: downloaded.size,
          totalBytes: downloaded.size,
        });
        void showSuccess('Success', `${model.name} downloaded successfully!`);
      } else {
        throw new Error('Download failed');
      }
    } catch (e: unknown) {
      updateLocalModelDownload({
        visible: true,
        source: 'manual',
        type,
        stage: 'error',
        modelName: model.name,
        progress: 0,
        message: 'Download failed',
      });
      void showError(e, 'Failed to download model');
    } finally {
      if (type === 'llm') {
        setDownloadingLlm(false);
        setTaskLlm(null);
      } else {
        setDownloadingWhisper(false);
        setTaskWhisper(null);
      }
    }
  };

  const handleImportModel = async (type: 'llm' | 'whisper') => {
    try {
      await cancelBootstrapDownload();
      clearLocalModelDownload();

      const picker = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picker.canceled || !picker.assets?.[0]) return;

      const asset = picker.assets[0];
      const originalName = asset.name?.trim() || `${type}-model`;
      const lowerName = originalName.toLowerCase();

      if (type === 'llm' && !lowerName.endsWith('.litertlm')) {
        void showWarning('Wrong File Type', 'For local LLM, choose a `.litertlm` file.');
        return;
      }
      if (type === 'whisper' && !lowerName.endsWith('.bin')) {
        void showWarning('Wrong File Type', 'For local Whisper, choose a `ggml-*.bin` file.');
        return;
      }

      const targetUri = getLocalModelFilePath(originalName);
      await deleteLocalModelFile(targetUri);
      await FileSystem.copyAsync({ from: asset.uri, to: targetUri });

      const validation = await validateLocalModelFile({
        path: targetUri,
        minBytes: IMPORT_MIN_BYTES[type],
      });
      if (!validation.isValid) {
        await deleteLocalModelFile(targetUri);
        void showWarning(
          'File Looks Incomplete',
          `Imported file is too small (${validation.size} bytes). Please pick a full model file.`,
        );
        return;
      }

      if (type === 'llm') {
        await setLocalModelPath(targetUri);
        if (!localLlmBlocked) {
          await setUseLocalModel(true);
        }
      } else {
        await setLocalWhisperPath(targetUri);
        await setUseLocalWhisper(true);
      }

      void showSuccess('Model Imported', `${originalName} is now available on this device.`);
    } catch (e: unknown) {
      void showError(e, 'Failed to import model file');
    }
  };

  const cancelDownload = async (type: 'llm' | 'whisper') => {
    const snap = getLocalModelDownloadSnapshot();
    const globalActive =
      snap?.visible &&
      snap.type === type &&
      (snap.stage === 'preparing' || snap.stage === 'downloading' || snap.stage === 'verifying');

    if (globalActive && snap.source === 'bootstrap') {
      await cancelBootstrapDownload();
    }

    const resumable = type === 'llm' ? taskLlm : taskWhisper;
    if (resumable) {
      try {
        await resumable.cancelAsync();
      } catch {
        // ignore
      }
    }

    if (type === 'llm') {
      setTaskLlm(null);
      setDownloadingLlm(false);
      setProgressLlm(0);
    } else {
      setTaskWhisper(null);
      setDownloadingWhisper(false);
      setProgressWhisper(0);
    }

    if (globalActive || resumable) {
      clearLocalModelDownload();
    }
  };

  const handleDelete = async (type: 'llm' | 'whisper') => {
    const ok = await confirmDestructive(
      'Delete Model',
      'Are you sure you want to delete this model? Free up storage but requires re-download to use.',
    );
    if (!ok) return;
    if (type === 'llm' && localModelPath) {
      await deleteLocalModelFile(localModelPath);
      setLocalModelPath(null);
      setUseLocalModel(false);
    } else if (type === 'whisper' && localWhisperPath) {
      await deleteLocalModelFile(localWhisperPath);
      setLocalWhisperPath(null);
      setUseLocalWhisper(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <ResponsiveContainer>
          <ScreenHeader title="On-Device AI Setup" showSettings />
          <LinearText variant="title" style={styles.sectionHeader}>
            Study AI (Text Model)
          </LinearText>
          <LinearText variant="body" tone="secondary" style={styles.desc}>
            Powers flashcards, summaries, and quizzes offline.
          </LinearText>
          <LinearButton
            label={
              isLlmDownloaded
                ? 'Replace with Another .litertlm File'
                : 'Import Existing .litertlm File'
            }
            variant="glass"
            style={styles.importBtn}
            onPress={() => handleImportModel('llm')}
            leftIcon={
              <Ionicons name="folder-open-outline" size={18} color={n.colors.textPrimary} />
            }
          />
          {localLlmWarning ? (
            <LinearSurface padded={false} style={styles.warningCard}>
              <LinearText variant="label" tone="warning" style={styles.warningTitle}>
                Low-RAM guardrail active
              </LinearText>
              <LinearText variant="bodySmall" tone="secondary" style={styles.warningText}>
                {localLlmWarning}
              </LinearText>
            </LinearSurface>
          ) : null}

          {isLlmDownloaded ? (
            <LinearSurface padded={false} style={styles.card}>
              <View style={styles.statusBox}>
                <LinearText variant="label" tone="success" style={styles.statusText}>
                  Model is downloaded and ready
                </LinearText>
                <LinearText variant="sectionTitle" style={styles.modelName}>
                  {localModelPath.split('/').pop()}
                </LinearText>
                <LinearButton
                  label={
                    localLlmBlocked
                      ? 'Needs >= 4 GB RAM'
                      : useLocalModel
                        ? 'Local Text AI Enabled'
                        : 'Enable Local Text AI'
                  }
                  variant={useLocalModel && !localLlmBlocked ? 'primary' : 'glass'}
                  style={[styles.toggleBtn, localLlmBlocked && styles.toggleBtnDisabled]}
                  textStyle={[localLlmBlocked && styles.toggleBtnTextDisabled]}
                  onPress={async () => {
                    if (localLlmBlocked) {
                      void showWarning(
                        'Requires More RAM',
                        localLlmWarning ?? 'This device cannot safely run the local text model.',
                      );
                      return;
                    }
                    setUseLocalModel(!useLocalModel);
                  }}
                />
                <LinearButton
                  label="Delete LLM"
                  variant="ghost"
                  style={styles.deleteBtn}
                  textStyle={styles.deleteBtnText}
                  onPress={() => handleDelete('llm')}
                />
                <LinearButton
                  label="Replace LLM File"
                  variant="glass"
                  style={styles.importBtn}
                  onPress={() => handleImportModel('llm')}
                  leftIcon={
                    <Ionicons
                      name="swap-horizontal-outline"
                      size={18}
                      color={n.colors.textPrimary}
                    />
                  }
                />
              </View>
            </LinearSurface>
          ) : downloadingLlm || isGlobalInstalling('llm') ? (
            <LinearSurface padded={false} style={styles.card}>
              <View style={styles.downloadBox}>
                {(() => {
                  const llmInstall =
                    installSnap?.visible && installSnap.type === 'llm' ? installSnap : null;
                  const llmPct = progressPercentFor('llm', progressLlm, downloadingLlm);
                  const llmPrimary =
                    llmInstall?.stage === 'verifying'
                      ? (llmInstall.message ?? 'Verifying model integrity')
                      : llmInstall?.stage === 'preparing'
                        ? (llmInstall.message ?? 'Preparing download')
                        : `Downloading: ${llmPct}%`;
                  const dl = llmInstall?.downloadedBytes;
                  const tl = llmInstall?.totalBytes;
                  const llmSub =
                    llmInstall?.stage === 'downloading' && dl && tl
                      ? `${formatInstallBytes(dl)} / ${formatInstallBytes(tl)}`
                      : null;
                  return (
                    <>
                      <LinearText variant="bodySmall" style={styles.progressText}>
                        {llmPrimary}
                      </LinearText>
                      {llmSub ? (
                        <LinearText
                          variant="bodySmall"
                          tone="secondary"
                          style={styles.progressSubText}
                        >
                          {llmSub}
                        </LinearText>
                      ) : null}
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${llmPct}%` }]} />
                      </View>
                      <LinearText variant="bodySmall" tone="secondary" style={styles.progressHint}>
                        Matches the install banner (startup + this screen share one status).
                      </LinearText>
                    </>
                  );
                })()}
                <LinearButton
                  label="Cancel"
                  variant="ghost"
                  style={styles.cancelBtn}
                  textStyle={styles.cancelBtnText}
                  onPress={() => cancelDownload('llm')}
                />
              </View>
            </LinearSurface>
          ) : (
            RECOMMENDED_MODELS.map((model) => (
              <LinearSurface key={model.id} padded={false} style={[styles.card, styles.modelCard]}>
                <LinearText variant="sectionTitle" style={styles.modelName}>
                  {model.name}
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.modelDesc}>
                  {model.desc}
                </LinearText>
                {existingLlmFiles.has(model.id) ? (
                  <LinearButton
                    label="On Device - Use This"
                    variant="glassTinted"
                    style={styles.downloadBtn}
                    onPress={() => handleDownload(model, 'llm')}
                    leftIcon={
                      <Ionicons name="checkmark-circle" size={18} color={n.colors.success} />
                    }
                  />
                ) : (
                  <LinearButton
                    label="Download"
                    style={styles.downloadBtn}
                    variant="primary"
                    onPress={() => handleDownload(model, 'llm')}
                    leftIcon={<Ionicons name="arrow-down-outline" size={18} color="#fff" />}
                  />
                )}
              </LinearSurface>
            ))
          )}

          <LinearDivider style={styles.divider} />

          <LinearText variant="title" style={styles.sectionHeader}>
            Transcriber (Whisper Model)
          </LinearText>
          <LinearText variant="body" tone="secondary" style={styles.desc}>
            Powers offline audio transcription for Hostage Mode automatically. Only
            `whisper.cpp`-compatible files work here; Hugging Face Whisper Turbo is available as a
            cloud provider in Settings.
          </LinearText>
          {!isWhisperDownloaded ? (
            <LinearButton
              label="Import Existing Whisper .bin File"
              variant="glass"
              style={styles.importBtn}
              onPress={() => handleImportModel('whisper')}
              leftIcon={
                <Ionicons name="folder-open-outline" size={18} color={n.colors.textPrimary} />
              }
            />
          ) : null}

          {isWhisperDownloaded ? (
            <LinearSurface padded={false} style={styles.card}>
              <View style={styles.statusBox}>
                <LinearText variant="label" tone="success" style={styles.statusText}>
                  Whisper is downloaded
                </LinearText>
                <LinearText variant="sectionTitle" style={styles.modelName}>
                  {localWhisperPath.split('/').pop()}
                </LinearText>
                <LinearButton
                  label={
                    useLocalWhisper ? 'Local Transcription Enabled' : 'Enable Local Transcription'
                  }
                  variant={useLocalWhisper ? 'primary' : 'glass'}
                  style={styles.toggleBtn}
                  onPress={() => setUseLocalWhisper(!useLocalWhisper)}
                />
                <LinearButton
                  label="Delete Whisper"
                  variant="ghost"
                  style={styles.deleteBtn}
                  textStyle={styles.deleteBtnText}
                  onPress={() => handleDelete('whisper')}
                />
              </View>
            </LinearSurface>
          ) : downloadingWhisper || isGlobalInstalling('whisper') ? (
            <LinearSurface padded={false} style={styles.card}>
              <View style={styles.downloadBox}>
                {(() => {
                  const wInstall =
                    installSnap?.visible && installSnap.type === 'whisper' ? installSnap : null;
                  const wPct = progressPercentFor('whisper', progressWhisper, downloadingWhisper);
                  const wPrimary =
                    wInstall?.stage === 'verifying'
                      ? (wInstall.message ?? 'Verifying model integrity')
                      : wInstall?.stage === 'preparing'
                        ? (wInstall.message ?? 'Preparing download')
                        : `Downloading: ${wPct}%`;
                  const dl = wInstall?.downloadedBytes;
                  const tl = wInstall?.totalBytes;
                  const wSub =
                    wInstall?.stage === 'downloading' && dl && tl
                      ? `${formatInstallBytes(dl)} / ${formatInstallBytes(tl)}`
                      : null;
                  return (
                    <>
                      <LinearText variant="bodySmall" style={styles.progressText}>
                        {wPrimary}
                      </LinearText>
                      {wSub ? (
                        <LinearText
                          variant="bodySmall"
                          tone="secondary"
                          style={styles.progressSubText}
                        >
                          {wSub}
                        </LinearText>
                      ) : null}
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${wPct}%` }]} />
                      </View>
                      <LinearText variant="bodySmall" tone="secondary" style={styles.progressHint}>
                        Matches the install banner (startup + this screen share one status).
                      </LinearText>
                    </>
                  );
                })()}
                <LinearButton
                  label="Cancel"
                  variant="ghost"
                  style={styles.cancelBtn}
                  textStyle={styles.cancelBtnText}
                  onPress={() => cancelDownload('whisper')}
                />
              </View>
            </LinearSurface>
          ) : (
            WHISPER_MODELS.map((model) => (
              <LinearSurface key={model.id} padded={false} style={[styles.card, styles.modelCard]}>
                <LinearText variant="sectionTitle" style={styles.modelName}>
                  {model.name}
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.modelDesc}>
                  {model.desc}
                </LinearText>
                {existingWhisperFiles.has(model.id) ? (
                  <LinearButton
                    label="On Device - Use This"
                    variant="glassTinted"
                    style={styles.downloadBtn}
                    onPress={() => handleDownload(model, 'whisper')}
                    leftIcon={
                      <Ionicons name="checkmark-circle" size={18} color={n.colors.success} />
                    }
                  />
                ) : (
                  <LinearButton
                    label="Download"
                    style={styles.downloadBtn}
                    variant="primary"
                    onPress={() => handleDownload(model, 'whisper')}
                    leftIcon={<Ionicons name="arrow-down-outline" size={18} color="#fff" />}
                  />
                )}
              </LinearSurface>
            ))
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  content: { padding: 20, paddingBottom: 60 },
  screenHeader: { marginBottom: 24 },
  screenHeaderTitle: { fontSize: 24, fontWeight: '800' },
  sectionHeader: { marginBottom: 8 },
  divider: { marginVertical: 30 },
  desc: { lineHeight: 22, marginBottom: 20 },
  importBtn: { marginBottom: 12 },
  warningCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  warningTitle: { marginBottom: 6 },
  warningText: { lineHeight: 19 },
  card: {
    borderRadius: 12,
    padding: 20,
  },
  modelCard: { marginBottom: 16 },
  modelName: { marginBottom: 6 },
  modelDesc: { marginBottom: 20 },
  downloadBtn: { borderRadius: 10 },
  downloadBox: { marginTop: 10 },
  progressText: { marginBottom: 8 },
  progressSubText: { marginTop: -4, marginBottom: 8 },
  progressHint: { marginTop: 4, marginBottom: 4, lineHeight: 18 },
  progressBarBg: {
    height: 8,
    backgroundColor: n.colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: { height: '100%', backgroundColor: n.colors.success },
  cancelBtn: {},
  cancelBtnText: { color: n.colors.error },
  statusBox: { marginTop: 10 },
  statusText: { marginBottom: 20 },
  toggleBtn: {
    marginBottom: 8,
  },
  toggleBtnDisabled: { opacity: 0.6 },
  toggleBtnTextDisabled: { color: '#B79C72' },
  deleteBtn: {},
  deleteBtnText: { color: n.colors.error },
});
