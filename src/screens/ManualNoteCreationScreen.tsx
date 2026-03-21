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
import type { MenuStackParamList } from '../navigation/types';
import {
  analyzeTranscript,
  generateADHDNote,
  isMeaningfulLectureAnalysis,
  type LectureAnalysis,
} from '../services/transcriptionService';
import { getSubjectByName } from '../db/queries/topics';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { markTopicsFromLecture } from '../services/transcription/matching';
import { getDb } from '../db/database';
import { showToast } from '../components/Toast';
import { resolveLectureSubjectRequirement } from '../services/lectureSubjectRequirement';
import { theme } from '../constants/theme';
import ConfidenceSelector from '../components/ConfidenceSelector';
import TopicPillRow from '../components/TopicPillRow';
import SubjectChip from '../components/SubjectChip';
import ScreenHeader from '../components/ScreenHeader';
import SubjectSelectionCard from '../components/SubjectSelectionCard';

export default function ManualNoteCreationScreen(
  _props: NativeStackScreenProps<MenuStackParamList, 'ManualNoteCreation'>,
) {
  const navigation = useNavigation();
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ analysis: LectureAnalysis; note: string } | null>(null);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [subjectSelectionRequired, setSubjectSelectionRequired] = useState(false);
  const [selectedSubjectName, setSelectedSubjectName] = useState<string | null>(null);

  const handleGenerate = async () => {
    const text = transcript.trim();
    if (!text) {
      Alert.alert('Error', 'Please paste a transcript to process.');
      return;
    }
    setIsProcessing(true);
    try {
      const analysis = await analyzeTranscript(text);
      const analysisWithTranscript = { ...analysis, transcript: text };
      if (!isMeaningfulLectureAnalysis(analysisWithTranscript)) {
        throw new Error('No usable lecture content was detected in this transcript.');
      }
      // Attach raw transcript so generateADHDNote has content to work with
      const note = await generateADHDNote(analysisWithTranscript);
      const resolution = await resolveLectureSubjectRequirement(analysis.subject);
      setResult({ analysis: analysisWithTranscript, note });
      setConfidence(analysis.estimatedConfidence as 1 | 2 | 3);
      setSubjectSelectionRequired(resolution.requiresSelection);
      setSelectedSubjectName(
        resolution.requiresSelection
          ? null
          : (resolution.matchedSubject?.name ?? resolution.normalizedSubjectName),
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    if (subjectSelectionRequired && !selectedSubjectName) {
      Alert.alert('Subject required', 'Choose the lecture subject before saving this note.');
      return;
    }
    setIsSaving(true);
    try {
      const finalConfidence = confidence ?? (result.analysis.estimatedConfidence as 1 | 2 | 3);
      const subjectName = selectedSubjectName ?? result.analysis.subject;
      const analysisToSave = {
        ...result.analysis,
        subject: subjectName,
        estimatedConfidence: finalConfidence,
      };
      const noteToSave =
        analysisToSave.subject === result.analysis.subject &&
        analysisToSave.estimatedConfidence === result.analysis.estimatedConfidence
          ? result.note
          : await generateADHDNote(analysisToSave);
      const sub = await getSubjectByName(subjectName);
      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        subjectName: subjectName,
        note: noteToSave,
        transcript: transcript.trim(),
        summary: analysisToSave.lectureSummary,
        topics: analysisToSave.topics,
        appName: 'Manual Paste',
        confidence: finalConfidence,
        embedding: undefined,
      });
      // Mark topics as studied (+ create new topics if unmatched)
      if (analysisToSave.topics?.length) {
        try {
          await markTopicsFromLecture(
            getDb(),
            analysisToSave.topics,
            finalConfidence,
            subjectName,
            analysisToSave.lectureSummary,
          );
        } catch (e) {
          console.warn('[ManualNote] markTopicsFromLecture failed:', e);
        }
      }
      showToast('Note saved and topics updated', 'success');
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
          {subjectSelectionRequired ? (
            <SubjectSelectionCard
              detectedSubjectName={analysis.subject}
              selectedSubjectName={selectedSubjectName}
              onSelectSubject={setSelectedSubjectName}
            />
          ) : (
            <SubjectChip subject={selectedSubjectName ?? analysis.subject} />
          )}

          {analysis.topics.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>TOPICS DETECTED</Text>
              <TopicPillRow topics={analysis.topics} wrap />
            </>
          )}

          <Text style={styles.sectionLabel}>YOUR CONFIDENCE LEVEL</Text>
          <ConfidenceSelector
            value={confidence ?? (analysis.estimatedConfidence as 1 | 2 | 3)}
            onChange={setConfidence}
          />

          <Text style={styles.sectionLabel}>GENERATED NOTES</Text>
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save to Notes Vault</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Input view ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.screenHeaderWrap}>
        <ScreenHeader
          title="Paste Transcript"
          subtitle="Turn copied lecture text into structured notes without leaving the app flow."
          onBackPress={() => navigation.navigate('NotesHub' as never)}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Paste your lecture transcript below:</Text>
        <Text style={styles.formatHint}>
          Works with any text — lecture transcripts, recorded audio text, textbook paragraphs,
          notes, or copied slides. Guru will extract topics, summarise, and rate your confidence.
        </Text>
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
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Generate Notes</Text>
          )}
        </TouchableOpacity>
        {isProcessing && (
          <Text style={styles.processingText}>Analyzing transcript and building notes...</Text>
        )}
        <TouchableOpacity
          onPress={() => navigation.navigate('NotesHub' as never)}
          style={styles.cancelInlineBtn}
          disabled={isProcessing}
        >
          <Text style={styles.cancelInlineText}>Cancel</Text>
        </TouchableOpacity>
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
  content: { padding: 16, paddingBottom: 120, gap: 4 },
  screenHeaderWrap: { paddingHorizontal: 16, paddingTop: 8 },
  label: { color: '#FFF', fontSize: 15, marginBottom: 6 },
  formatHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
    fontStyle: 'italic',
  },
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
  btn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  processingText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
  cancelInlineBtn: { marginTop: 16, alignItems: 'center', padding: 12 },
  cancelInlineText: { color: theme.colors.textSecondary, fontSize: 15, fontWeight: '600' },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 16,
    marginBottom: 8,
  },
  noteCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  noteText: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 22 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.divider },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
