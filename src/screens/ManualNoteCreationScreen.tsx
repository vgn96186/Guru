import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { analyzeTranscript, generateADHDNote, type LectureAnalysis } from '../services/transcriptionService';
import { getSubjectByName } from '../db/queries/topics';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { theme } from '../constants/theme';

const CONFIDENCE_LABELS: Record<1 | 2 | 3, string> = { 1: 'Introduced', 2: 'Understood', 3: 'Confident' };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ManualNoteCreationScreen(_props: NativeStackScreenProps<RootStackParamList, 'ManualNoteCreation'>) {
  const navigation = useNavigation();
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ analysis: LectureAnalysis; note: string } | null>(null);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async () => {
    const text = transcript.trim();
    if (!text) {
      Alert.alert('Error', 'Please paste a transcript to process.');
      return;
    }
    setIsProcessing(true);
    try {
      const analysis = await analyzeTranscript(text);
      const note = await generateADHDNote(analysis);
      setResult({ analysis, note });
      setConfidence(analysis.estimatedConfidence as 1 | 2 | 3);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const finalConfidence = confidence ?? (result.analysis.estimatedConfidence as 1 | 2 | 3);
      const sub = await getSubjectByName(result.analysis.subject);
      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        note: result.note,
        transcript: transcript.trim(),
        summary: result.analysis.lectureSummary,
        topics: result.analysis.topics,
        appName: 'Manual Paste',
        confidence: finalConfidence,
        embedding: undefined,
      });
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Result view ────────────────────────────────────────────────────────────
  if (result) {
    const { analysis, note } = result;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setResult(null)} style={styles.backBtn}>
            <Text style={styles.backText}>← Edit</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Review Notes</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Subject + topics */}
          <View style={styles.subjectRow}>
            <View style={styles.subjectChip}>
              <Text style={styles.subjectChipText}>{analysis.subject}</Text>
            </View>
          </View>

          {analysis.topics.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>TOPICS DETECTED</Text>
              <View style={styles.topicRow}>
                {analysis.topics.map((t, i) => (
                  <View key={i} style={styles.topicPill}>
                    <Text style={styles.topicPillText}>{t}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Confidence selector */}
          <Text style={styles.sectionLabel}>YOUR CONFIDENCE LEVEL</Text>
          <View style={styles.confidenceRow}>
            {([1, 2, 3] as const).map((lvl) => {
              const colors = { 1: theme.colors.error, 2: theme.colors.warning, 3: theme.colors.success };
              const selected = (confidence ?? analysis.estimatedConfidence) === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.confOption, selected && { borderColor: colors[lvl], backgroundColor: colors[lvl] + '22' }]}
                  onPress={() => setConfidence(lvl)}
                >
                  <Text style={[styles.confOptionText, selected && { color: colors[lvl] }]}>
                    {CONFIDENCE_LABELS[lvl]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Generated note */}
          <Text style={styles.sectionLabel}>GENERATED NOTES</Text>
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save to Notes Vault</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Input view ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={isProcessing}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Paste Transcript</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Paste your lecture transcript below:</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Paste transcript here..."
          placeholderTextColor={theme.colors.textMuted}
          value={transcript}
          onChangeText={setTranscript}
          editable={!isProcessing}
        />
        <TouchableOpacity
          style={[styles.btn, (!transcript.trim() || isProcessing) && styles.btnDisabled]}
          onPress={handleGenerate}
          disabled={!transcript.trim() || isProcessing}
        >
          {isProcessing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Generate Notes</Text>}
        </TouchableOpacity>
        {isProcessing && (
          <Text style={styles.processingText}>Analyzing transcript and building notes...</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  backBtn: { marginRight: 16 },
  backText: { color: theme.colors.primary, fontSize: 16 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 120 },
  label: { color: '#FFF', fontSize: 15, marginBottom: 12 },
  input: {
    backgroundColor: theme.colors.surface,
    color: '#FFF',
    borderRadius: 10,
    padding: 16,
    height: 280,
    textAlignVertical: 'top',
    fontSize: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btn: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: 10, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  processingText: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 16, fontSize: 14 },
  // result view
  subjectRow: { marginBottom: 12 },
  subjectChip: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '22',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary + '66',
  },
  subjectChipText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  sectionLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 16, marginBottom: 8 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  topicPill: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  topicPillText: { color: theme.colors.textPrimary, fontSize: 13 },
  confidenceRow: { flexDirection: 'row', gap: 8 },
  confOption: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, alignItems: 'center' },
  confOptionText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  noteCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  noteText: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 22 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.divider },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
