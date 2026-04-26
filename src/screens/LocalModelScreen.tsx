import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, ScrollView, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { pickDocumentOnce } from '../services/documentPicker';
import { useProfileQuery, useProfileActions } from '../hooks/queries/useProfile';
import ScreenHeader from '../components/ScreenHeader';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { linearTheme as n } from '../theme/linearTheme';
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

      const picker = await pickDocumentOnce({
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

  const renderModelList = (
    models: typeof RECOMMENDED_MODELS,
    type: 'llm' | 'whisper',
    existingFiles: Set<string>,
  ) => (
    <View>
      {models.map((model, idx) => {
        const isDownloaded = existingFiles.has(model.id);
        const isCurrent =
          (type === 'llm' && localModelPath?.endsWith(model.name)) ||
          (type === 'whisper' && localWhisperPath?.endsWith(model.name));

        return (
          <View key={model.id}>
            <View style={styles.modelRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <LinearText variant="bodySmall" style={{ fontWeight: '700' }}>
                  {model.name}
                </LinearText>
                <LinearText
                  variant="caption"
                  tone="secondary"
                  numberOfLines={1}
                  style={{ fontSize: 11 }}
                >
                  {model.desc.split('.')[0]}
                </LinearText>
              </View>
              {isCurrent ? (
                <View style={styles.activeBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={n.colors.success} />
                  <LinearText
                    variant="caption"
                    style={{
                      color: n.colors.success,
                      fontWeight: '800',
                      marginLeft: 4,
                      fontSize: 11,
                    }}
                  >
                    Active
                  </LinearText>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.miniDownloadBtn, isDownloaded && styles.miniDownloadBtnOwned]}
                  onPress={() => handleDownload(model, type)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isDownloaded ? 'swap-horizontal' : 'download-outline'}
                    size={14}
                    color={isDownloaded ? n.colors.textPrimary : '#fff'}
                  />
                  <Text
                    style={[
                      styles.miniDownloadBtnText,
                      isDownloaded && styles.miniDownloadBtnTextOwned,
                    ]}
                  >
                    {isDownloaded ? 'Use' : 'Get'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {idx < models.length - 1 && <View style={styles.rowDivider} />}
          </View>
        );
      })}
    </View>
  );

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="On-Device Models" />

        <LinearSurface padded={false} style={styles.masterCard}>
          {/* ── SECTION: STUDY AI ── */}
          <View style={styles.sectionHeaderRow}>
            <LinearText variant="caption" style={{ fontWeight: '800', letterSpacing: 1 }}>
              STUDY AI (TEXT)
            </LinearText>
            {isLlmDownloaded && (
              <TouchableOpacity onPress={() => handleDelete('llm')}>
                <LinearText variant="caption" style={{ color: n.colors.error, fontSize: 11 }}>
                  Delete
                </LinearText>
              </TouchableOpacity>
            )}
          </View>

          {localLlmWarning ? (
            <View style={styles.compactWarning}>
              <Ionicons name="warning" size={14} color={n.colors.warning} />
              <LinearText variant="caption" tone="warning" style={{ flex: 1, fontSize: 11 }}>
                {localLlmWarning}
              </LinearText>
            </View>
          ) : null}

          {downloadingLlm || isGlobalInstalling('llm') ? (
            <View style={styles.compactProgress}>
              {(() => {
                const llmPct = progressPercentFor('llm', progressLlm, downloadingLlm);
                return (
                  <>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <LinearText variant="caption" style={{ fontWeight: '700', fontSize: 11 }}>
                        Downloading... {llmPct}%
                      </LinearText>
                      <TouchableOpacity onPress={() => cancelDownload('llm')}>
                        <Text style={{ color: n.colors.error, fontSize: 11 }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${llmPct}%` }]} />
                    </View>
                  </>
                );
              })()}
            </View>
          ) : (
            renderModelList(RECOMMENDED_MODELS, 'llm', existingLlmFiles)
          )}

          <TouchableOpacity
            style={styles.compactImportBtn}
            onPress={() => handleImportModel('llm')}
          >
            <Ionicons name="folder-open-outline" size={12} color={n.colors.textMuted} />
            <Text style={styles.compactImportBtnText}>Import custom .litertlm</Text>
          </TouchableOpacity>

          <View style={styles.sectionDivider} />

          {/* ── SECTION: TRANSCRIBER ── */}
          <View style={styles.sectionHeaderRow}>
            <LinearText variant="caption" style={{ fontWeight: '800', letterSpacing: 1 }}>
              TRANSCRIBER (AUDIO)
            </LinearText>
            {isWhisperDownloaded && (
              <TouchableOpacity onPress={() => handleDelete('whisper')}>
                <LinearText variant="caption" style={{ color: n.colors.error, fontSize: 11 }}>
                  Delete
                </LinearText>
              </TouchableOpacity>
            )}
          </View>

          {downloadingWhisper || isGlobalInstalling('whisper') ? (
            <View style={styles.compactProgress}>
              {(() => {
                const wPct = progressPercentFor('whisper', progressWhisper, downloadingWhisper);
                return (
                  <>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <LinearText variant="caption" style={{ fontWeight: '700', fontSize: 11 }}>
                        Downloading... {wPct}%
                      </LinearText>
                      <TouchableOpacity onPress={() => cancelDownload('whisper')}>
                        <Text style={{ color: n.colors.error, fontSize: 11 }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${wPct}%` }]} />
                    </View>
                  </>
                );
              })()}
            </View>
          ) : (
            renderModelList(WHISPER_MODELS, 'whisper', existingWhisperFiles)
          )}

          <TouchableOpacity
            style={styles.compactImportBtn}
            onPress={() => handleImportModel('whisper')}
          >
            <Ionicons name="folder-open-outline" size={12} color={n.colors.textMuted} />
            <Text style={styles.compactImportBtnText}>Import custom Whisper .bin</Text>
          </TouchableOpacity>
        </LinearSurface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  content: { padding: 12, paddingBottom: 30 },
  masterCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginHorizontal: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 8,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(63, 185, 80, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(63, 185, 80, 0.2)',
  },
  miniDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  miniDownloadBtnOwned: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  miniDownloadBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  miniDownloadBtnTextOwned: {
    color: n.colors.textPrimary,
  },
  compactImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  compactImportBtnText: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  compactWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 119, 6, 0.05)',
    marginHorizontal: 16,
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  compactProgress: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: n.colors.accent },
});
