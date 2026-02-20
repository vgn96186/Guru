/**
 * LectureReturnSheet
 *
 * Shown when the user returns to Guru from a lecture app.
 * Flow:
 *   1. "Back from Marrow! 47 min recorded"
 *   2. Transcribing... (spinner)
 *   3. Results: subject chip, topic pills, 2-line summary
 *   4. [Mark as Studied] [Skip]
 *   On confirm → marks topics in DB, deletes recording file, awards tap XP
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { transcribeWithGemini, transcribeWithOpenAI, markTopicsFromLecture, type LectureAnalysis } from '../services/transcriptionService';
import { deleteRecording } from '../../modules/app-launcher';
import { getDb } from '../db/database';
import { addXp } from '../db/queries/progress';

interface Props {
  visible: boolean;
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
  geminiKey: string;
  openaiKey: string;
  transcriptionEngine: 'gemini' | 'openai';
  onDone: () => void;
}

type Phase = 'intro' | 'transcribing' | 'results' | 'error';

export default function LectureReturnSheet({
  visible, appName, durationMinutes, recordingPath,
  geminiKey, openaiKey, transcriptionEngine, onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [analysis, setAnalysis] = useState<LectureAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-start transcription when sheet opens with a recording
  useEffect(() => {
    if (visible && recordingPath) {
      const delay = setTimeout(() => runTranscription(), 800);
      return () => clearTimeout(delay);
    }
  }, [visible, recordingPath]);

  // Reset when closed
  useEffect(() => {
    if (!visible) {
      setPhase('intro');
      setAnalysis(null);
      setErrorMsg('');
    }
  }, [visible]);

  async function runTranscription() {
    setPhase('transcribing');
    try {
      let result: LectureAnalysis;
      if (transcriptionEngine === 'openai' && openaiKey) {
        result = await transcribeWithOpenAI(recordingPath!, openaiKey, geminiKey);
      } else {
        result = await transcribeWithGemini(recordingPath!, geminiKey);
      }
      setAnalysis(result);
      setPhase('results');
    } catch (e: any) {
      console.error('[Transcription] Error:', e);
      setErrorMsg(e?.message ?? 'Transcription failed');
      setPhase('error');
    }
  }

  function handleMarkStudied() {
    if (!analysis) return;
    try {
      const db = getDb();
      markTopicsFromLecture(db, analysis.topics, analysis.estimatedConfidence, analysis.subject);
      // Bonus XP: 8 XP per detected topic
      if (analysis.topics.length > 0) addXp(analysis.topics.length * 8);
    } catch (e) {
      console.warn('[LectureReturn] markTopics error:', e);
    }
    cleanupAndClose();
  }

  function cleanupAndClose() {
    if (recordingPath) {
      deleteRecording(recordingPath).catch(() => {});
    }
    onDone();
  }

  function handleSkip() {
    cleanupAndClose();
  }

  const SUBJECT_COLORS: Record<string, string> = {
    Anatomy: '#E91E63', Physiology: '#9C27B0', Biochemistry: '#3F51B5',
    Pathology: '#F44336', Microbiology: '#009688', Pharmacology: '#FF9800',
    Medicine: '#2196F3', Surgery: '#795548', OBG: '#E91E63',
    Pediatrics: '#4CAF50', Ophthalmology: '#00BCD4', ENT: '#8BC34A',
    Psychiatry: '#673AB7', Radiology: '#607D8B', Anesthesia: '#FF5722',
    Dermatology: '#CDDC39', Orthopedics: '#FF5722', 'Forensic Medicine': '#455A64', SPM: '#388E3C',
  };
  const subjectColor = SUBJECT_COLORS[analysis?.subject ?? ''] ?? '#6C63FF';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleSkip}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Handle */}
          <View style={styles.handle} />

          {/* Phase: intro / transcribing */}
          {(phase === 'intro' || phase === 'transcribing') && (
            <View style={styles.centeredBlock}>
              <Text style={styles.returnEmoji}>🎧</Text>
              <Text style={styles.returnTitle}>Back from {appName}!</Text>
              <Text style={styles.returnSub}>
                {durationMinutes > 0
                  ? `${durationMinutes} min recorded`
                  : 'Session logged'}
              </Text>
              {phase === 'transcribing' && (
                <View style={styles.spinnerRow}>
                  <ActivityIndicator color="#6C63FF" size="small" />
                  <Text style={styles.spinnerText}>Analysing your lecture…</Text>
                </View>
              )}
            </View>
          )}

          {/* Phase: results */}
          {phase === 'results' && analysis && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.resultsHeader}>
                <View style={[styles.subjectChip, { backgroundColor: subjectColor + '22', borderColor: subjectColor + '66' }]}>
                  <Text style={[styles.subjectChipText, { color: subjectColor }]}>{analysis.subject}</Text>
                </View>
                <Text style={styles.summaryText}>{analysis.lectureSummary}</Text>
              </View>

              {analysis.topics.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>TOPICS DETECTED</Text>
                  <View style={styles.topicRow}>
                    {analysis.topics.map(t => (
                      <View key={t} style={styles.topicPill}>
                        <Text style={styles.topicPillText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {analysis.keyConcepts.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>KEY CONCEPTS</Text>
                  {analysis.keyConcepts.map((c, i) => (
                    <Text key={i} style={styles.conceptItem}>• {c}</Text>
                  ))}
                </View>
              )}

              <View style={styles.confidenceBadgeRow}>
                <Text style={styles.confidenceLabel}>Confidence detected: </Text>
                <Text style={styles.confidenceVal}>
                  {analysis.estimatedConfidence === 1 ? 'Introduced 🌱' : analysis.estimatedConfidence === 2 ? 'Understood 🌿' : 'Can explain 🌳'}
                </Text>
              </View>

              {analysis.topics.length === 0 && (
                <Text style={styles.noContentNote}>No medical topics detected — audio may have been inaudible or mostly silent.</Text>
              )}
            </ScrollView>
          )}

          {/* Phase: error */}
          {phase === 'error' && (
            <View style={styles.centeredBlock}>
              <Text style={styles.returnEmoji}>⚠️</Text>
              <Text style={styles.returnTitle}>Transcription failed</Text>
              <Text style={styles.errorDetail}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={runTranscription}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {phase === 'results' && analysis && analysis.topics.length > 0 ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={handleMarkStudied} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>✓ Mark as Studied (+{analysis.topics.length * 8} XP)</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.secondaryBtn, (phase === 'transcribing') && { opacity: 0.4 }]}
              onPress={handleSkip}
              disabled={phase === 'transcribing'}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>
                {phase === 'results' ? 'Skip' : 'Dismiss'}
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000077' },
  sheet: {
    backgroundColor: '#1A1A24',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: '#2A2A38',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#3A3A48',
    alignSelf: 'center', marginBottom: 18,
  },
  centeredBlock: { alignItems: 'center', paddingVertical: 12 },
  returnEmoji: { fontSize: 44, marginBottom: 10 },
  returnTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  returnSub: { color: '#9E9E9E', fontSize: 14, marginTop: 4 },
  spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  spinnerText: { color: '#6C63FF', fontSize: 13 },
  resultsHeader: { marginBottom: 14 },
  subjectChip: {
    alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    marginBottom: 8,
  },
  subjectChipText: { fontSize: 13, fontWeight: '800' },
  summaryText: { color: '#C5C5D2', fontSize: 13, lineHeight: 19 },
  section: { marginBottom: 14 },
  sectionLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicPill: {
    backgroundColor: '#6C63FF22', borderWidth: 1, borderColor: '#6C63FF55',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  topicPillText: { color: '#A09CF7', fontSize: 13, fontWeight: '600' },
  conceptItem: { color: '#C5C5D2', fontSize: 12, lineHeight: 20 },
  confidenceBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 16 },
  confidenceLabel: { color: '#777', fontSize: 12 },
  confidenceVal: { color: '#fff', fontSize: 12, fontWeight: '700' },
  noContentNote: { color: '#666', fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginVertical: 12 },
  errorDetail: { color: '#F44336', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  retryBtn: {
    backgroundColor: '#6C63FF22', borderWidth: 1, borderColor: '#6C63FF',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, marginTop: 8,
  },
  retryBtnText: { color: '#6C63FF', fontWeight: '700' },
  actions: { marginTop: 12, gap: 8 },
  primaryBtn: {
    backgroundColor: '#6C63FF', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { color: '#777', fontSize: 14, fontWeight: '600' },
});
