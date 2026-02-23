/**
 * LectureReturnSheet
 *
 * Shown when the user returns to Guru from a lecture app.
 * Flow:
 *   1. "Back from Marrow! 47 min recorded"
 *   2. Transcribing... (spinner)
 *   3. Results: subject chip, topic pills, 2-line summary
 *   4. [Mark as Studied] [Mark + Take Quiz] [Skip]
 *   5. Quiz: 3 MCQs generated from lecture content
 *   6. Score + bonus XP
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { transcribeWithGemini, transcribeWithOpenAI, markTopicsFromLecture, type LectureAnalysis } from '../services/transcriptionService';
import { catalyzeTranscript } from '../services/aiService';
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
  onStudyNow?: () => void;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

type Phase = 'intro' | 'transcribing' | 'results' | 'quiz' | 'quiz_done' | 'error';

export default function LectureReturnSheet({
  visible, appName, durationMinutes, recordingPath,
  geminiKey, openaiKey, transcriptionEngine, onDone,
  onStudyNow,
}: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [phase, setPhase] = useState<Phase>('intro');
  const [analysis, setAnalysis] = useState<LectureAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExpl, setShowExpl] = useState(false);
  const [score, setScore] = useState(0);

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
      setQuizQuestions([]);
      setQuizLoading(false);
      setCurrentQ(0);
      setSelected(null);
      setShowExpl(false);
      setScore(0);
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
      // Fire quiz generation in background while user reads results
      if (result.topics.length > 0) {
        generateQuiz(result);
      }
    } catch (e: any) {
      console.error('[Transcription] Error:', e);
      setErrorMsg(e?.message ?? 'Transcription failed');
      setPhase('error');
    }
  }

  async function generateQuiz(result: LectureAnalysis) {
    setQuizLoading(true);
    try {
      const pseudoTranscript = `Subject: ${result.subject}
Topics: ${result.topics.join(', ')}
Key concepts:
${result.keyConcepts.map(c => `- ${c}`).join('\n')}
Summary: ${result.lectureSummary}`;
      const catalyst = await catalyzeTranscript(pseudoTranscript, geminiKey);
      if (Array.isArray(catalyst.quiz?.questions) && catalyst.quiz.questions.length > 0) {
        setQuizQuestions(catalyst.quiz.questions);
      }
    } catch (e) {
      console.warn('[LectureReturn] Quiz generation failed:', e);
    } finally {
      setQuizLoading(false);
    }
  }

  function doMarkTopics() {
    if (!analysis) return;
    try {
      const db = getDb();
      markTopicsFromLecture(db, analysis.topics, analysis.estimatedConfidence, analysis.subject);
      if (analysis.topics.length > 0) addXp(analysis.topics.length * 8);
    } catch (e) {
      console.warn('[LectureReturn] markTopics error:', e);
    }
  }

  function handleMarkStudied() {
    doMarkTopics();
    cleanupAndClose();
  }

  function handleMarkAndQuiz() {
    doMarkTopics();
    setCurrentQ(0);
    setSelected(null);
    setShowExpl(false);
    setScore(0);
    setPhase('quiz');
  }

  function handleSelectAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    setShowExpl(true);
    if (idx === quizQuestions[currentQ].correctIndex) {
      setScore(s => s + 1);
    }
  }

  function handleNextQuestion() {
    if (currentQ < quizQuestions.length - 1) {
      setCurrentQ(c => c + 1);
      setSelected(null);
      setShowExpl(false);
    } else {
      const bonusXp = score * 15;
      if (bonusXp > 0) addXp(bonusXp);
      setPhase('quiz_done');
    }
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
    Dermatology: '#CDDC39', Orthopedics: '#FF5722', 'Forensic Medicine': '#455A64', SPM: '#388E3C', 'Community Medicine': '#388E3C',
  };
  const subjectColor = SUBJECT_COLORS[analysis?.subject ?? ''] ?? '#6C63FF';

  const q = quizQuestions[currentQ];

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

          {/* Phase: quiz */}
          {phase === 'quiz' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {quizLoading && !q ? (
                <View style={styles.centeredBlock}>
                  <ActivityIndicator color="#6C63FF" size="large" />
                  <Text style={[styles.spinnerText, { marginTop: 12 }]}>Generating quiz…</Text>
                </View>
              ) : q ? (
                <View>
                  <Text style={styles.quizProgress}>Q {currentQ + 1} / {quizQuestions.length}</Text>
                  <Text style={styles.questionText}>{q.question}</Text>
                  <View style={styles.optionsContainer}>
                    {q.options.map((opt, idx) => {
                      let bgColor = '#12121A';
                      let borderColor = '#2A2A38';
                      if (selected !== null) {
                        if (idx === q.correctIndex) { bgColor = '#0A1F0A'; borderColor = '#4CAF50'; }
                        else if (idx === selected) { bgColor = '#1F0A0A'; borderColor = '#F44336'; }
                      }
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]}
                          onPress={() => handleSelectAnswer(idx)}
                          activeOpacity={0.8}
                          disabled={selected !== null}
                        >
                          <Text style={styles.optionText}>{opt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {showExpl && (
                    <View style={[styles.explBox, { borderColor: selected === q.correctIndex ? '#4CAF50' : '#F44336' }]}>
                      <Text style={[styles.explLabel, { color: selected === q.correctIndex ? '#4CAF50' : '#F44336' }]}>
                        {selected === q.correctIndex ? '✅ Correct!' : '❌ Incorrect'}
                      </Text>
                      <Text style={styles.explText}>{q.explanation}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.centeredBlock}>
                  <Text style={styles.returnEmoji}>😅</Text>
                  <Text style={styles.returnTitle}>No quiz available</Text>
                  <Text style={styles.returnSub}>Not enough content to generate questions.</Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Phase: quiz_done */}
          {phase === 'quiz_done' && (
            <View style={styles.centeredBlock}>
              <Text style={styles.returnEmoji}>
                {score === quizQuestions.length ? '🏆' : score >= quizQuestions.length / 2 ? '🎯' : '📚'}
              </Text>
              <Text style={styles.returnTitle}>
                {score} / {quizQuestions.length} correct
              </Text>
              <Text style={styles.returnSub}>
                {score === quizQuestions.length
                  ? 'Perfect! You nailed it.'
                  : score >= quizQuestions.length / 2
                  ? 'Good effort. Review the misses.'
                  : 'Rewatch this section soon.'}
              </Text>
              {score > 0 && (
                <View style={styles.xpBonusBox}>
                  <Text style={styles.xpBonusText}>+{score * 15} XP bonus earned 🎉</Text>
                </View>
              )}
            </View>
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

            {/* Results phase: mark + quiz / mark only */}
            {phase === 'results' && analysis && analysis.topics.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => {
                    handleMarkStudied();
                    if (onStudyNow) {
                      onStudyNow();
                      return;
                    }
                    try {
                      navigation.getParent?.()?.navigate?.('SyllabusTab');
                    } catch {
                      // no-op
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>📖 Study Now (Syllabus)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#2A2A38' }]}
                  onPress={handleMarkAndQuiz}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>
                    {quizLoading ? '⏳ Test Yourself (loading…)' : '🧠 Mark + Test Yourself'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={handleMarkStudied}
                  activeOpacity={0.85}
                >
                  <Text style={styles.outlineBtnText}>✓ Mark as Studied (+{analysis.topics.length * 8} XP)</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Quiz phase: next / finish */}
            {phase === 'quiz' && selected !== null && q && (
              <TouchableOpacity style={styles.primaryBtn} onPress={handleNextQuestion} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>
                  {currentQ < quizQuestions.length - 1 ? 'Next Question →' : 'See My Score'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Quiz phase: skip if no questions or stuck loading */}
            {phase === 'quiz' && !quizLoading && !q && (
              <TouchableOpacity style={styles.primaryBtn} onPress={cleanupAndClose} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            )}

            {/* Quiz done */}
            {phase === 'quiz_done' && (
              <TouchableOpacity style={styles.primaryBtn} onPress={cleanupAndClose} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            )}

            {/* Dismiss / Skip always available (except quiz_done which has its own Done) */}
            {phase !== 'quiz_done' && (
              <TouchableOpacity
                style={[styles.secondaryBtn, phase === 'transcribing' && { opacity: 0.4 }]}
                onPress={handleSkip}
                disabled={phase === 'transcribing'}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>
                  {phase === 'results' ? 'Skip' : phase === 'quiz' ? 'End Quiz' : 'Dismiss'}
                </Text>
              </TouchableOpacity>
            )}

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
  returnSub: { color: '#9E9E9E', fontSize: 14, marginTop: 4, textAlign: 'center' },
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

  // Quiz
  quizProgress: { color: '#555', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  questionText: { color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '600', marginBottom: 14 },
  optionsContainer: { gap: 8, marginBottom: 8 },
  optionBtn: {
    borderWidth: 1.5, borderRadius: 10, padding: 12,
  },
  optionText: { color: '#C5C5D2', fontSize: 14, lineHeight: 20 },
  explBox: {
    borderWidth: 1, borderRadius: 10,
    padding: 12, marginTop: 8, marginBottom: 4,
    backgroundColor: '#12121A',
  },
  explLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  explText: { color: '#9E9E9E', fontSize: 12, lineHeight: 18 },

  // XP bonus
  xpBonusBox: {
    marginTop: 16, backgroundColor: '#2E7D3222',
    borderWidth: 1, borderColor: '#4CAF5055',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10,
  },
  xpBonusText: { color: '#4CAF50', fontWeight: '800', fontSize: 15 },

  // Actions
  actions: { marginTop: 12, gap: 8 },
  primaryBtn: {
    backgroundColor: '#6C63FF', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1.5, borderColor: '#6C63FF', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  outlineBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { color: '#777', fontSize: 14, fontWeight: '600' },
});
