import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppStore } from '../store/useAppStore';
import ScreenHeader from '../components/ScreenHeader';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { linearTheme as n } from '../theme/linearTheme';
import LinearButton from '../components/primitives/LinearButton';
import LinearDivider from '../components/primitives/LinearDivider';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import {
  deleteLocalModelFile,
  getLocalModelFilePath,
  validateLocalModelFile,
} from '../services/localModelFiles';

const RECOMMENDED_MODELS = [
  {
    id: 'medgemma-4b',
    name: 'medgemma-4b-it-q4_k_m.gguf',
    url: 'https://huggingface.co/hungqbui/medgemma-4b-it-Q4_K_M-GGUF/resolve/main/medgemma-4b-it-q4_k_m.gguf',
    desc: 'Recommended. MedGemma 4B instruction model tuned for medical tasks with stronger domain fit (~2.5 GB).',
  },
  {
    id: 'qwen-3b',
    name: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    desc: 'Solid fallback. Strong JSON reliability and generally good reasoning (~2.0 GB).',
  },
  {
    id: 'llama-1b',
    name: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    desc: 'Lightweight 1B model. Faster but less accurate for complex tasks (~850 MB).',
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

export default function LocalModelScreen() {
  const profile = useAppStore((s) => s.profile);
  const setUseLocalModel = useAppStore((s) => s.setUseLocalModel);
  const setLocalModelPath = useAppStore((s) => s.setLocalModelPath);
  const setUseLocalWhisper = useAppStore((s) => s.setUseLocalWhisper);
  const setLocalWhisperPath = useAppStore((s) => s.setLocalWhisperPath);
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

      for (const model of RECOMMENDED_MODELS) {
        const path = getLocalModelFilePath(model.name);
        const info = await validateLocalModelFile({ path });
        if (info.exists) {
          llmFound.add(model.id);
          // If profile path is null but file exists, auto-register it
          if (!localModelPath) {
            setLocalModelPath(path);
          }
        }
      }

      for (const model of WHISPER_MODELS) {
        const path = getLocalModelFilePath(model.name);
        const info = await validateLocalModelFile({ path });
        if (info.exists) {
          whisperFound.add(model.id);
          if (!localWhisperPath) {
            setLocalWhisperPath(path);
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
      validateLocalModelFile({ path: localModelPath }).then((info) => {
        if (!info.exists) {
          setLocalModelPath(null);
          setUseLocalModel(false);
        }
      });
    }
    if (localWhisperPath) {
      validateLocalModelFile({ path: localWhisperPath }).then((info) => {
        if (!info.exists) {
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

  const handleDownload = async (
    model: { id: string; name: string; url: string; desc: string },
    type: 'llm' | 'whisper',
  ) => {
    try {
      const isLlm = type === 'llm';
      if (isLlm) {
        setDownloadingLlm(true);
        setProgressLlm(0);
      } else {
        setDownloadingWhisper(true);
        setProgressWhisper(0);
      }

      const targetUri = getLocalModelFilePath(model.name);
      const fileInfo = await validateLocalModelFile({ path: targetUri });

      if (fileInfo.exists) {
        if (isLlm) setLocalModelPath(targetUri);
        else setLocalWhisperPath(targetUri);
        if (isLlm) setDownloadingLlm(false);
        else setDownloadingWhisper(false);
        Alert.alert('Already Downloaded', `${model.name} is already on your device.`);
        return;
      }

      const task = FileSystem.createDownloadResumable(model.url, targetUri, {}, (dp) => {
        const pc = dp.totalBytesWritten / dp.totalBytesExpectedToWrite;
        if (isLlm) setProgressLlm(pc);
        else setProgressWhisper(pc);
      });

      if (isLlm) setTaskLlm(task);
      else setTaskWhisper(task);
      const res = await task.downloadAsync();

      if (res && res.status === 200) {
        if (isLlm) {
          setLocalModelPath(res.uri);
          setExistingLlmFiles((prev) => new Set([...prev, model.id]));
        } else {
          setLocalWhisperPath(res.uri);
          setExistingWhisperFiles((prev) => new Set([...prev, model.id]));
        }
        Alert.alert('Success', `${model.name} downloaded successfully!`);
      } else {
        throw new Error('Download failed');
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to download model');
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

  const cancelDownload = async (type: 'llm' | 'whisper') => {
    if (type === 'llm' && taskLlm) {
      await taskLlm.cancelAsync();
      setDownloadingLlm(false);
      setTaskLlm(null);
      setProgressLlm(0);
    } else if (type === 'whisper' && taskWhisper) {
      await taskWhisper.cancelAsync();
      setDownloadingWhisper(false);
      setTaskWhisper(null);
      setProgressWhisper(0);
    }
  };

  const handleDelete = async (type: 'llm' | 'whisper') => {
    Alert.alert(
      'Delete Model',
      'Are you sure you want to delete this model? Free up storage but requires re-download to use.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (type === 'llm' && localModelPath) {
              await deleteLocalModelFile(localModelPath);
              setLocalModelPath(null);
              setUseLocalModel(false);
            } else if (type === 'whisper' && localWhisperPath) {
              await deleteLocalModelFile(localWhisperPath);
              setLocalWhisperPath(null);
              setUseLocalWhisper(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <ResponsiveContainer>
          <ScreenHeader
            title="On-Device AI Setup"
            subtitle="Download and manage offline text and transcription models."
            containerStyle={styles.screenHeader}
            titleStyle={styles.screenHeaderTitle}
          />
          <LinearText variant="title" style={styles.sectionHeader}>
            Study AI (Text Model)
          </LinearText>
          <LinearText variant="body" tone="secondary" style={styles.desc}>
            Powers flashcards, summaries, and quizzes offline.
          </LinearText>
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
                  onPress={() => {
                    if (localLlmBlocked) {
                      Alert.alert(
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
              </View>
            </LinearSurface>
          ) : downloadingLlm ? (
            <LinearSurface padded={false} style={styles.card}>
              <View style={styles.downloadBox}>
                <LinearText variant="bodySmall" style={styles.progressText}>
                  Downloading: {Math.round(progressLlm * 100)}%
                </LinearText>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressLlm * 100}%` }]} />
                </View>
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
                    leftIcon={<LinearText style={styles.buttonEmoji}>✅</LinearText>}
                  />
                ) : (
                  <LinearButton
                    label="Download"
                    style={styles.downloadBtn}
                    variant="primary"
                    onPress={() => handleDownload(model, 'llm')}
                    leftIcon={<LinearText style={styles.buttonEmoji}>⬇️</LinearText>}
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
          ) : downloadingWhisper ? (
            <LinearSurface padded={false} style={styles.card}>
              <View style={styles.downloadBox}>
                <LinearText variant="bodySmall" style={styles.progressText}>
                  Downloading: {Math.round(progressWhisper * 100)}%
                </LinearText>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressWhisper * 100}%` }]} />
                </View>
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
                    leftIcon={<LinearText style={styles.buttonEmoji}>✅</LinearText>}
                  />
                ) : (
                  <LinearButton
                    label="Download"
                    style={styles.downloadBtn}
                    variant="primary"
                    onPress={() => handleDownload(model, 'whisper')}
                    leftIcon={<LinearText style={styles.buttonEmoji}>⬇️</LinearText>}
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
  buttonEmoji: { fontSize: 14 },
  downloadBox: { marginTop: 10 },
  progressText: { marginBottom: 8 },
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
