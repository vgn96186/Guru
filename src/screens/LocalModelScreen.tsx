import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppStore } from '../store/useAppStore';
import ScreenHeader from '../components/ScreenHeader';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { linearTheme as n } from '../theme/linearTheme';
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
  const { profile, setUseLocalModel, setLocalModelPath, setUseLocalWhisper, setLocalWhisperPath } =
    useAppStore();
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
  }, [localModelPath, localWhisperPath]);

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
  }, [localModelPath, localWhisperPath]);

  const handleDownload = async (model: any, type: 'llm' | 'whisper') => {
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
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to download model');
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
          <Text style={styles.sectionHeader}>🧠 Study AI (Text Model)</Text>
          <Text style={styles.desc}>Powers flashcards, summaries, and quizzes offline.</Text>
          {localLlmWarning ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Low-RAM guardrail active</Text>
              <Text style={styles.warningText}>{localLlmWarning}</Text>
            </View>
          ) : null}

          {isLlmDownloaded ? (
            <View style={styles.card}>
              <View style={styles.statusBox}>
                <Text style={styles.statusText}>✅ Model is downloaded and ready</Text>
                <Text style={styles.modelName}>{localModelPath.split('/').pop()}</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    useLocalModel && styles.toggleBtnActive,
                    localLlmBlocked && styles.toggleBtnDisabled,
                  ]}
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
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      useLocalModel && styles.toggleBtnTextActive,
                      localLlmBlocked && styles.toggleBtnTextDisabled,
                    ]}
                  >
                    {localLlmBlocked
                      ? 'Needs >= 4 GB RAM'
                      : useLocalModel
                        ? 'Local Text AI Enabled'
                        : 'Enable Local Text AI'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('llm')}>
                  <Text style={styles.deleteBtnText}>Delete LLM</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : downloadingLlm ? (
            <View style={styles.card}>
              <View style={styles.downloadBox}>
                <Text style={styles.progressText}>
                  Downloading: {Math.round(progressLlm * 100)}%
                </Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressLlm * 100}%` }]} />
                </View>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelDownload('llm')}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            RECOMMENDED_MODELS.map((model) => (
              <View key={model.id} style={[styles.card, { marginBottom: 16 }]}>
                <Text style={styles.modelName}>{model.name}</Text>
                <Text style={styles.modelDesc}>{model.desc}</Text>
                {existingLlmFiles.has(model.id) ? (
                  <TouchableOpacity
                    style={[styles.downloadBtn, { backgroundColor: '#2196F3' }]}
                    onPress={() => handleDownload(model, 'llm')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.downloadBtnText}>✅ On Device — Use This</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => handleDownload(model, 'llm')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.downloadBtnText}>⬇️ Download</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}

          <View style={styles.divider} />

          <Text style={styles.sectionHeader}>🎙️ Transcriber (Whisper Model)</Text>
          <Text style={styles.desc}>
            Powers offline audio transcription for Hostage Mode automatically. Only
            `whisper.cpp`-compatible files work here; Hugging Face Whisper Turbo is available as a
            cloud provider in Settings.
          </Text>

          {isWhisperDownloaded ? (
            <View style={styles.card}>
              <View style={styles.statusBox}>
                <Text style={styles.statusText}>✅ Whisper is downloaded</Text>
                <Text style={styles.modelName}>{localWhisperPath.split('/').pop()}</Text>
                <TouchableOpacity
                  style={[styles.toggleBtn, useLocalWhisper && styles.toggleBtnActive]}
                  onPress={() => setUseLocalWhisper(!useLocalWhisper)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.toggleBtnText, useLocalWhisper && styles.toggleBtnTextActive]}
                  >
                    {useLocalWhisper ? 'Local Transcription Enabled' : 'Enable Local Transcription'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('whisper')}>
                  <Text style={styles.deleteBtnText}>Delete Whisper</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : downloadingWhisper ? (
            <View style={styles.card}>
              <View style={styles.downloadBox}>
                <Text style={styles.progressText}>
                  Downloading: {Math.round(progressWhisper * 100)}%
                </Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressWhisper * 100}%` }]} />
                </View>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => cancelDownload('whisper')}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            WHISPER_MODELS.map((model) => (
              <View key={model.id} style={[styles.card, { marginBottom: 16 }]}>
                <Text style={styles.modelName}>{model.name}</Text>
                <Text style={styles.modelDesc}>{model.desc}</Text>
                {existingWhisperFiles.has(model.id) ? (
                  <TouchableOpacity
                    style={[styles.downloadBtn, { backgroundColor: '#2196F3' }]}
                    onPress={() => handleDownload(model, 'whisper')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.downloadBtnText}>✅ On Device — Use This</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => handleDownload(model, 'whisper')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.downloadBtnText}>⬇️ Download</Text>
                  </TouchableOpacity>
                )}
              </View>
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
  sectionHeader: { color: '#FFF', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#2A2A38', marginVertical: 30 },
  desc: { color: '#AAA', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  warningCard: {
    backgroundColor: '#2A1F10',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#A56D1F',
    marginBottom: 16,
  },
  warningTitle: { color: '#FFD58A', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  warningText: { color: '#F6D7A8', fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: '#1A1A22',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  modelName: { fontSize: 18, fontWeight: '600', color: '#FFF', marginBottom: 6 },
  modelDesc: { fontSize: 14, color: '#888', marginBottom: 20 },
  downloadBtn: { backgroundColor: '#4CAF50', padding: 14, borderRadius: 8, alignItems: 'center' },
  downloadBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  downloadBox: { marginTop: 10 },
  progressText: { color: '#FFF', marginBottom: 8, fontSize: 14, fontWeight: '500' },
  progressBarBg: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50' },
  cancelBtn: { padding: 10, alignItems: 'center' },
  cancelBtnText: { color: '#FF5252', fontWeight: '600' },
  statusBox: { marginTop: 10 },
  statusText: { color: '#4CAF50', fontWeight: '600', marginBottom: 20 },
  toggleBtn: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#555',
    alignItems: 'center',
    marginBottom: 8,
  },
  toggleBtnActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  toggleBtnDisabled: { backgroundColor: '#2F2F35', borderColor: '#3A3A3F' },
  toggleBtnText: { color: '#888', fontWeight: '700', fontSize: 16 },
  toggleBtnTextActive: { color: '#FFF' },
  toggleBtnTextDisabled: { color: '#B79C72' },
  deleteBtn: { padding: 12, alignItems: 'center' },
  deleteBtnText: { color: '#FF5252', fontWeight: '600', fontSize: 14 },
});
