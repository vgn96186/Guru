import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
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
import { resolveLectureSubjectRequirement } from '../services/lecture/lectureSubjectRequirement';
import { linearTheme as n } from '../theme/linearTheme';
import ConfidenceSelector from '../components/ConfidenceSelector';
import TopicPillRow from '../components/TopicPillRow';
import SubjectChip from '../components/SubjectChip';
import ScreenHeader from '../components/ScreenHeader';
import SubjectSelectionCard from '../components/SubjectSelectionCard';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import { showError, showWarning } from '../components/dialogService';

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
      showWarning('Error', 'Please paste a transcript to process.');
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
          : resolution.matchedSubject?.name ?? resolution.normalizedSubjectName,
      );
    } catch (e: unknown) {
      showError(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    if (subjectSelectionRequired && !selectedSubjectName) {
      showWarning('Subject required', 'Choose the lecture subject before saving this note.');
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
      showError(e);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Result view ────────────────────────────────────────────────────────────
  if (result) {
    const { analysis, note } = result;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setResult(null)} style={styles.backBtn}>
            <LinearText style={styles.backText}>← Edit</LinearText>
          </TouchableOpacity>
          <LinearText style={styles.title}>Review Notes</LinearText>
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
              <LinearText style={styles.sectionLabel}>TOPICS DETECTED</LinearText>
              <TopicPillRow topics={analysis.topics} wrap />
            </>
          )}

          <LinearText style={styles.sectionLabel}>YOUR CONFIDENCE LEVEL</LinearText>
          <ConfidenceSelector
            value={confidence ?? (analysis.estimatedConfidence as 1 | 2 | 3)}
            onChange={setConfidence}
          />

          <LinearText style={styles.sectionLabel}>GENERATED NOTES</LinearText>
          <LinearSurface padded={false} style={styles.noteCard}>
            <LinearText style={styles.noteText}>{note}</LinearText>
          </LinearSurface>
        </ScrollView>

        <View style={styles.footer}>
          <LinearButton
            variant="glassTinted"
            style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
            label={isSaving ? 'Saving…' : 'Save to Notes Vault'}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Input view ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <View style={styles.screenHeaderWrap}>
        <ScreenHeader
          title="Paste Transcript"
          onBackPress={() => navigation.goBack()}
          showSettings
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <LinearText style={styles.label}>Paste your lecture transcript below:</LinearText>
        <LinearText style={styles.formatHint}>
          Works with any text — lecture transcripts, recorded audio text, textbook paragraphs,
          notes, or copied slides. Guru will extract topics, summarise, and rate your confidence.
        </LinearText>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Paste transcript here..."
          placeholderTextColor={n.colors.textMuted}
          value={transcript}
          onChangeText={setTranscript}
          editable={!isProcessing}
        />
        <LinearButton
          variant="glassTinted"
          style={[styles.btn, (!transcript.trim() || isProcessing) && styles.btnDisabled]}
          onPress={handleGenerate}
          disabled={!transcript.trim() || isProcessing}
          label={isProcessing ? 'Generating Notes…' : 'Generate Notes'}
        />
        {isProcessing && (
          <LinearText style={styles.processingText}>
            Analyzing transcript and building notes...
          </LinearText>
        )}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.cancelInlineBtn}
          disabled={isProcessing}
        >
          <LinearText style={styles.cancelInlineText}>Cancel</LinearText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  backBtn: { marginRight: 16 },
  backText: { color: n.colors.accent, fontSize: 16 },
  title: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 120, gap: 4 },
  screenHeaderWrap: { paddingHorizontal: 16, paddingTop: 8 },
  label: { color: n.colors.textPrimary, fontSize: 15, marginBottom: 6 },
  formatHint: {
    color: n.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: n.colors.surface,
    color: n.colors.textPrimary,
    borderRadius: 10,
    padding: 16,
    height: 280,
    textAlignVertical: 'top',
    fontSize: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  btn: {
    minHeight: 56,
  },
  btnDisabled: { opacity: 0.5 },
  processingText: {
    color: n.colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
  cancelInlineBtn: { marginTop: 16, alignItems: 'center', padding: 12 },
  cancelInlineText: { color: n.colors.textSecondary, fontSize: 15, fontWeight: '600' },
  sectionLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 16,
    marginBottom: 8,
  },
  noteCard: {
    padding: 16,
  },
  noteText: { color: n.colors.textPrimary, fontSize: 14, lineHeight: 22 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: n.colors.border },
  saveBtn: {
    minHeight: 56,
  },
});
