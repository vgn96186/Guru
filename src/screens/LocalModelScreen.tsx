import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppStore } from '../store/useAppStore';
import { ResponsiveContainer } from '../hooks/useResponsive';

const RECOMMENDED_MODELS = [
  {
    id: 'qwen-3b',
    name: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    desc: 'Recommended. 3B parameter model with strong medical reasoning and reliable JSON output (~2.0 GB).',
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
    id: 'whisper-tiny',
    name: 'ggml-tiny.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    desc: 'Tiny English model (~75 MB). Fast but low accuracy — only works with clear, close-mic audio.',
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
    desc: 'Medium English model (~1.5 GB). Best accuracy for mic-captured lectures. Recommended.',
  },
];

export default function LocalModelScreen() {
  const navigation = useNavigation();
  const { profile, setUseLocalModel, setLocalModelPath, setUseLocalWhisper, setLocalWhisperPath } = useAppStore();
  
  // LLM State
  const [downloadingLlm, setDownloadingLlm] = useState(false);
  const [progressLlm, setProgressLlm] = useState(0);
  const [taskLlm, setTaskLlm] = useState<FileSystem.DownloadResumable | null>(null);

  // Whisper State
  const [downloadingWhisper, setDownloadingWhisper] = useState(false);
  const [progressWhisper, setProgressWhisper] = useState(0);
  const [taskWhisper, setTaskWhisper] = useState<FileSystem.DownloadResumable | null>(null);

  const localModelPath = profile?.localModelPath;
  const useLocalModel = profile?.useLocalModel ?? false;
  const isLlmDownloaded = !!localModelPath;

  const localWhisperPath = profile?.localWhisperPath;
  const useLocalWhisper = profile?.useLocalWhisper ?? false;
  const isWhisperDownloaded = !!localWhisperPath;

  useEffect(() => {
    if (localModelPath) {
      FileSystem.getInfoAsync(localModelPath).then(info => {
        if (!info.exists) { setLocalModelPath(null); setUseLocalModel(false); }
      });
    }
    if (localWhisperPath) {
      FileSystem.getInfoAsync(localWhisperPath).then(info => {
        if (!info.exists) { setLocalWhisperPath(null); setUseLocalWhisper(false); }
      });
    }
  }, [localModelPath, localWhisperPath]);

  const handleDownload = async (model: any, type: 'llm' | 'whisper') => {
    try {
      const isLlm = type === 'llm';
      isLlm ? setDownloadingLlm(true) : setDownloadingWhisper(true);
      isLlm ? setProgressLlm(0) : setProgressWhisper(0);

      const targetUri = FileSystem.documentDirectory + model.name;
      const fileInfo = await FileSystem.getInfoAsync(targetUri);
      
      if (fileInfo.exists) {
        if (isLlm) setLocalModelPath(targetUri);
        else setLocalWhisperPath(targetUri);
        isLlm ? setDownloadingLlm(false) : setDownloadingWhisper(false);
        return;
      }

      const task = FileSystem.createDownloadResumable(
        model.url,
        targetUri,
        {},
        (dp) => {
          const pc = dp.totalBytesWritten / dp.totalBytesExpectedToWrite;
          isLlm ? setProgressLlm(pc) : setProgressWhisper(pc);
        }
      );
      
      isLlm ? setTaskLlm(task) : setTaskWhisper(task);
      const res = await task.downloadAsync();
      
      if (res && res.status === 200) {
        if (isLlm) setLocalModelPath(res.uri);
        else setLocalWhisperPath(res.uri);
        Alert.alert('Success', `${model.name} downloaded successfully!`);
      } else {
        throw new Error('Download failed');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to download model');
    } finally {
      if (type === 'llm') { setDownloadingLlm(false); setTaskLlm(null); }
      else { setDownloadingWhisper(false); setTaskWhisper(null); }
    }
  };

  const cancelDownload = async (type: 'llm' | 'whisper') => {
    if (type === 'llm' && taskLlm) {
      await taskLlm.cancelAsync();
      setDownloadingLlm(false); setTaskLlm(null); setProgressLlm(0);
    } else if (type === 'whisper' && taskWhisper) {
      await taskWhisper.cancelAsync();
      setDownloadingWhisper(false); setTaskWhisper(null); setProgressWhisper(0);
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
              await FileSystem.deleteAsync(localModelPath, { idempotent: true });
              setLocalModelPath(null); setUseLocalModel(false);
            } else if (type === 'whisper' && localWhisperPath) {
              await FileSystem.deleteAsync(localWhisperPath, { idempotent: true });
              setLocalWhisperPath(null); setUseLocalWhisper(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>On-Device AI Setup</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ResponsiveContainer>
          <Text style={styles.sectionHeader}>🧠 Study AI (Text Model)</Text>
        <Text style={styles.desc}>
          Powers flashcards, summaries, and quizzes offline. 
        </Text>

        {isLlmDownloaded ? (
          <View style={styles.card}>
            <View style={styles.statusBox}>
              <Text style={styles.statusText}>✅ Model is downloaded and ready</Text>
              <Text style={styles.modelName}>{localModelPath.split('/').pop()}</Text>
              <TouchableOpacity
                style={[styles.toggleBtn, useLocalModel && styles.toggleBtnActive]}
                onPress={() => setUseLocalModel(!useLocalModel)}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleBtnText, useLocalModel && styles.toggleBtnTextActive]}>
                  {useLocalModel ? 'Local Text AI Enabled' : 'Enable Local Text AI'}
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
              <Text style={styles.progressText}>Downloading: {Math.round(progressLlm * 100)}%</Text>
              <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${progressLlm * 100}%` }]} /></View>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelDownload('llm')}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          RECOMMENDED_MODELS.map(model => (
            <View key={model.id} style={[styles.card, { marginBottom: 16 }]}>
              <Text style={styles.modelName}>{model.name}</Text>
              <Text style={styles.modelDesc}>{model.desc}</Text>
              <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownload(model, 'llm')} activeOpacity={0.8}>
                <Text style={styles.downloadBtnText}>⬇️ Download</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionHeader}>🎙️ Transcriber (Whisper Model)</Text>
        <Text style={styles.desc}>
          Powers offline audio transcription for Hostage Mode automatically.
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
                <Text style={[styles.toggleBtnText, useLocalWhisper && styles.toggleBtnTextActive]}>
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
              <Text style={styles.progressText}>Downloading: {Math.round(progressWhisper * 100)}%</Text>
              <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${progressWhisper * 100}%` }]} /></View>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelDownload('whisper')}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          WHISPER_MODELS.map(model => (
            <View key={model.id} style={[styles.card, { marginBottom: 16 }]}>
              <Text style={styles.modelName}>{model.name}</Text>
              <Text style={styles.modelDesc}>{model.desc}</Text>
              <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownload(model, 'whisper')} activeOpacity={0.8}>
                <Text style={styles.downloadBtnText}>⬇️ Download</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
  backBtn: { marginRight: 20 },
  backBtnText: { color: '#6C63FF', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  content: { padding: 20, paddingBottom: 60 },
  sectionHeader: { color: '#FFF', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#2A2A38', marginVertical: 30 },
  desc: { color: '#AAA', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  card: { backgroundColor: '#1A1A22', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#333' },
  modelName: { fontSize: 18, fontWeight: '600', color: '#FFF', marginBottom: 6 },
  modelDesc: { fontSize: 14, color: '#888', marginBottom: 20 },
  downloadBtn: { backgroundColor: '#4CAF50', padding: 14, borderRadius: 8, alignItems: 'center' },
  downloadBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  downloadBox: { marginTop: 10 },
  progressText: { color: '#FFF', marginBottom: 8, fontSize: 14, fontWeight: '500' },
  progressBarBg: { height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50' },
  cancelBtn: { padding: 10, alignItems: 'center' },
  cancelBtnText: { color: '#FF5252', fontWeight: '600' },
  statusBox: { marginTop: 10 },
  statusText: { color: '#4CAF50', fontWeight: '600', marginBottom: 20 },
  toggleBtn: { padding: 14, borderRadius: 8, borderWidth: 2, borderColor: '#555', alignItems: 'center', marginBottom: 8 },
  toggleBtnActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  toggleBtnText: { color: '#888', fontWeight: '700', fontSize: 16 },
  toggleBtnTextActive: { color: '#FFF' },
  deleteBtn: { padding: 12, alignItems: 'center' },
  deleteBtnText: { color: '#FF5252', fontWeight: '600', fontSize: 14 },
});
