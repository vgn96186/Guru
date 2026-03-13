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
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { type LectureAnalysis } from '../services/transcriptionService';
import {
  saveLectureAnalysisQuick,
  transcribeLectureWithRecovery,
  type LecturePipelineProgress,
  type LecturePipelineStage,
} from '../services/lectureSessionMonitor';
import { catalyzeTranscript } from '../services/aiService';
import { profileRepository } from '../db/repositories';
import { updateSessionTranscriptionStatus } from '../db/queries/externalLogs';
import { useAppStore } from '../store/useAppStore';

interface Props {
  visible: boolean;
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
  logId: number;
  groqKey: string;
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
  visible,
  appName,
  durationMinutes,
  recordingPath,
  logId,
  groqKey,
  onDone,
}: Props) {
  const profile = useAppStore((s) => s.profile);
  const [phase, setPhase] = useState<Phase>('intro');
  const [analysis, setAnalysis] = useState<LectureAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeStage, setActiveStage] = useState<LecturePipelineStage | null>(null);
  const [stageMessage, setStageMessage] = useState('');
  const [transcriptionCompleted, setTranscriptionCompleted] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // User override for confidence level
  const [userConfidence, setUserConfidence] = useState<1 | 2 | 3 | null>(null);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExpl, setShowExpl] = useState(false);
  const [score, setScore] = useState(0);

  // Auto-start transcription when sheet opens with a recording
  const hasLocalWhisper = !!(profile?.useLocalWhisper && profile?.localWhisperPath);
  const canTranscribe = !!(recordingPath && (groqKey || hasLocalWhisper));
  const transcriptionStartedRef = React.useRef(false);
  const cancelRequestedRef = React.useRef(false);
  const transcriptionRunIdRef = React.useRef(0);
  useEffect(() => {
    if (visible && canTranscribe && !transcriptionStartedRef.current) {
      transcriptionStartedRef.current = true;
      setIsExpanded(false);
      const delay = setTimeout(() => runTranscription(), 150);
      return () => clearTimeout(delay);
    } else if (visible && !recordingPath) {
      setIsExpanded(true);
      setErrorMsg(
        'No lecture audio was captured for this session. Please retry with microphone permission enabled.',
      );
      void updateSessionTranscriptionStatus(logId, 'no_audio', 'No recording file captured');
      setPhase('error');
    } else if (visible && recordingPath && !groqKey && !hasLocalWhisper) {
      setIsExpanded(true);
      setErrorMsg(
        'Local Whisper is unavailable. Enable Local Transcription or add a Groq API key in Settings.',
      );
      void updateSessionTranscriptionStatus(logId, 'failed', 'No transcription engine configured');
      setPhase('error');
    }
  }, [visible, recordingPath, groqKey, hasLocalWhisper, canTranscribe, logId]);

  // Reset when closed
  useEffect(() => {
    if (!visible) {
      setPhase('intro');
      setAnalysis(null);
      setErrorMsg('');
      setIsExpanded(false);
      setActiveStage(null);
      setStageMessage('');
      setTranscriptionCompleted(false);
      setSessionSaved(false);
      setIsSaving(false);
      setUserConfidence(null);
      setQuizQuestions([]);
      setQuizLoading(false);
      setCurrentQ(0);
      setSelected(null);
      setShowExpl(false);
      setScore(0);
      transcriptionStartedRef.current = false;
      cancelRequestedRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (phase === 'results' || phase === 'quiz' || phase === 'quiz_done' || phase === 'error') {
      setIsExpanded(true);
    }
  }, [phase, visible]);

  function handlePipelineProgress(progress: LecturePipelineProgress) {
    if (cancelRequestedRef.current) return;
    if (progress.stage === 'enhancing') {
      return;
    }
    setActiveStage(progress.stage);
    setStageMessage(progress.message);
  }

  async function runTranscription() {
    const runId = ++transcriptionRunIdRef.current;
    cancelRequestedRef.current = false;
    setPhase('transcribing');
    setIsExpanded(false);
    setActiveStage('transcribing');
    setStageMessage('Transcribing lecture audio');
    try {
      await updateSessionTranscriptionStatus(logId, 'transcribing');
      const result = await transcribeLectureWithRecovery({
        recordingPath: recordingPath!,
        groqKey: groqKey || undefined,
        useLocalWhisper: !!(profile?.useLocalWhisper && profile?.localWhisperPath),
        localWhisperPath: profile?.localWhisperPath || undefined,
        maxRetries: 1,
        logId,
        onProgress: handlePipelineProgress,
      });
      if (cancelRequestedRef.current || runId !== transcriptionRunIdRef.current) {
        await updateSessionTranscriptionStatus(logId, 'pending', 'Transcription cancelled by user');
        return;
      }
      if (!result.transcript?.trim()) {
        setActiveStage(null);
        setStageMessage('');
        setErrorMsg(
          "In-app audio wasn't captured (this app may block it). Next time we'll use the microphone — keep device speaker on when you open the lecture app.",
        );
        await updateSessionTranscriptionStatus(
          logId,
          'no_audio',
          'No speech detected in recording',
        );
        setPhase('error');
        return;
      }
      setAnalysis(result);
      setTranscriptionCompleted(true);
      setSessionSaved(false);
      setActiveStage(null);
      setStageMessage('');
      await updateSessionTranscriptionStatus(logId, 'pending');
      setPhase('results');
      // Fire quiz generation in background while user reads results
      if (result.topics.length > 0) {
        generateQuiz(result);
      }
    } catch (e: any) {
      if (cancelRequestedRef.current || runId !== transcriptionRunIdRef.current) {
        await updateSessionTranscriptionStatus(logId, 'pending', 'Transcription cancelled by user');
        return;
      }
      console.error('[Transcription] Error:', e);
      const message = e?.message ?? 'Transcription failed';
      setActiveStage(null);
      setStageMessage('');
      setErrorMsg(`${message}. Audio has been preserved for auto-retry on next launch.`);
      await updateSessionTranscriptionStatus(logId, 'failed', message);
      setPhase('error');
    }
  }

  function handleCancelTranscription() {
    Alert.alert(
      'Cancel transcription?',
      'Processing will stop in the UI. Audio is preserved and can be retried later.',
      [
        { text: 'Keep processing', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: () => {
            cancelRequestedRef.current = true;
            setActiveStage(null);
            setStageMessage('');
            setPhase('intro');
            void updateSessionTranscriptionStatus(
              logId,
              'pending',
              'Transcription cancelled by user',
            );
            void cleanupAndClose();
          },
        },
      ],
    );
  }

  async function generateQuiz(result: LectureAnalysis) {
    setQuizLoading(true);
    try {
      const pseudoTranscript = `Subject: ${result.subject}
Topics: ${result.topics.join(', ')}
Key concepts:
${result.keyConcepts.map((c) => `- ${c}`).join('\n')}
Summary: ${result.lectureSummary}`;
      const catalyst = await catalyzeTranscript(pseudoTranscript);
      if (Array.isArray(catalyst.quiz?.questions) && catalyst.quiz.questions.length > 0) {
        setQuizQuestions(catalyst.quiz.questions);
      }
    } catch (e) {
      console.warn('[LectureReturn] Quiz generation failed:', e);
    } finally {
      setQuizLoading(false);
    }
  }

  async function saveSessionQuickly(): Promise<boolean> {
    if (!analysis || !recordingPath) return false;

    try {
      setIsSaving(true);
      setActiveStage('saving');
      setStageMessage('Saving lecture summary');
      const finalConfidence = userConfidence ?? analysis.estimatedConfidence;
      const analysisToSave =
        finalConfidence === analysis.estimatedConfidence
          ? analysis
          : { ...analysis, estimatedConfidence: finalConfidence };

      await saveLectureAnalysisQuick({
        analysis: analysisToSave,
        appName,
        durationMinutes,
        logId,
        recordingPath,
        onProgress: handlePipelineProgress,
      });

      setAnalysis(analysisToSave);
      setSessionSaved(true);
      setActiveStage(null);
      setStageMessage('');
      return true;
    } catch (e: any) {
      console.warn('[LectureReturn] save error:', e);
      setActiveStage(null);
      setStageMessage('');
      setErrorMsg(
        `${e?.message ?? 'Failed while saving lecture note'}. Audio has been preserved for retry.`,
      );
      setPhase('error');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMarkStudied() {
    const saved = await saveSessionQuickly();
    if (saved) {
      await cleanupAndClose();
    }
  }

  async function handleMarkAndQuiz() {
    const saved = await saveSessionQuickly();
    if (saved) {
      setCurrentQ(0);
      setSelected(null);
      setShowExpl(false);
      setScore(0);
      setPhase('quiz');
    }
  }

  async function handleSaveAndClose() {
    const saved = await saveSessionQuickly();
    if (saved) {
      await cleanupAndClose();
    }
  }

  function handleSelectAnswer(idx: number) {
    if (selected !== null) return;
    const q = quizQuestions[currentQ];
    if (!q) return;
    setSelected(idx);
    setShowExpl(true);
    if (idx === q.correctIndex) {
      setScore((s) => s + 1);
    }
  }

  async function handleNextQuestion() {
    if (currentQ < quizQuestions.length - 1) {
      setCurrentQ((c) => c + 1);
      setSelected(null);
      setShowExpl(false);
    } else {
      const bonusXp = score * 15;
      if (bonusXp > 0) await profileRepository.addXp(bonusXp);
      setPhase('quiz_done');
    }
  }

  async function cleanupAndClose() {
    if (!sessionSaved && transcriptionCompleted) {
      await updateSessionTranscriptionStatus(logId, 'pending');
    }
    onDone();
  }

  function handleSkip() {
    if (phase === 'intro' || phase === 'transcribing') {
      setIsExpanded(false);
      return;
    }
    void cleanupAndClose();
  }

  function getCompactTitle() {
    if (activeStage === 'transcribing') return 'Transcribing lecture audio';
    if (activeStage === 'analyzing') return 'Analyzing transcript';
    if (activeStage === 'saving') return 'Saving lecture summary';
    if (phase === 'error') return 'Lecture processing needs attention';
    if (phase === 'results') return 'Lecture summary is ready';
    if (phase === 'quiz') return 'Quick quiz is ready';
    if (phase === 'quiz_done') return 'Lecture recap completed';
    return 'Analyzing your lecture';
  }

  function getCompactSubtitle() {
    if (activeStage) return stageMessage || 'Processing lecture pipeline';
    if (phase === 'error') return 'Tap to retry or review the failure.';
    if (phase === 'results') return 'Tap to review topics and save the session.';
    if (phase === 'quiz') return 'Tap to answer the quiz and finish the session.';
    if (phase === 'quiz_done') return 'Tap to close this lecture session.';
    return `${durationMinutes > 0 ? `${durationMinutes} min` : 'Recent'} session from ${appName}. You can keep using Guru while this runs.`;
  }

  const SUBJECT_COLORS: Record<string, string> = {
    Anatomy: '#E91E63',
    Physiology: '#9C27B0',
    Biochemistry: '#3F51B5',
    Pathology: '#F44336',
    Microbiology: '#009688',
    Pharmacology: '#FF9800',
    Medicine: '#2196F3',
    Surgery: '#795548',
    OBG: '#E91E63',
    Pediatrics: '#4CAF50',
    Ophthalmology: '#00BCD4',
    ENT: '#8BC34A',
    Psychiatry: '#673AB7',
    Radiology: '#607D8B',
    Anesthesia: '#FF5722',
    Dermatology: '#CDDC39',
    Orthopedics: '#FF5722',
    'Forensic Medicine': '#455A64',
    SPM: '#388E3C',
    'Community Medicine': '#388E3C',
  };
  const subjectColor = SUBJECT_COLORS[analysis?.subject ?? ''] ?? '#6C63FF';
  const isProcessingPhase = phase === 'intro' || phase === 'transcribing' || activeStage !== null;
  const showCompactCard = !isExpanded;

  const q = quizQuestions[currentQ];

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      {showCompactCard ? (
        <View pointerEvents="box-none" style={styles.compactDock}>
          <TouchableOpacity
            style={[
              styles.compactCard,
              phase === 'error' && styles.compactCardError,
              phase === 'results' && styles.compactCardReady,
            ]}
            onPress={() => setIsExpanded(true)}
            activeOpacity={0.9}
          >
            <View style={styles.compactTextWrap}>
              <Text style={styles.compactEyebrow}>
                {isProcessingPhase
                  ? 'LECTURE PROCESSING'
                  : phase === 'error'
                    ? 'ACTION NEEDED'
                    : 'LECTURE READY'}
              </Text>
              <Text style={styles.compactTitle}>{getCompactTitle()}</Text>
              <Text style={styles.compactSubtitle}>{getCompactSubtitle()}</Text>
            </View>
            <View style={styles.compactMeta}>
              {isProcessingPhase ? (
                <ActivityIndicator color="#6C63FF" size="small" />
              ) : (
                <Text style={styles.compactChevron}>Open</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetTopRow}>
              <View style={styles.handle} />
              {isProcessingPhase && (
                <TouchableOpacity
                  style={styles.minimizeBtn}
                  onPress={() => setIsExpanded(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.minimizeBtnText}>Keep browsing</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Phase: intro / transcribing */}
            {(phase === 'intro' || phase === 'transcribing') && (
              <View style={styles.centeredBlock}>
                <Text style={styles.returnEmoji}>🎧</Text>
                <Text style={styles.returnTitle}>Back from {appName}!</Text>
                <Text style={styles.returnSub}>
                  {durationMinutes > 0 ? `${durationMinutes} min recorded` : 'Session logged'}
                </Text>
                {phase === 'transcribing' && (
                  <View style={styles.processingCard}>
                    <ActivityIndicator color="#6C63FF" size="small" />
                    <Text style={styles.processingTitle}>{getCompactTitle()}</Text>
                    <View style={styles.stageRow}>
                      {(['transcribing', 'analyzing', 'saving'] as LecturePipelineStage[]).map(
                        (stage) => {
                          const isActive = activeStage === stage;
                          const isDone =
                            (stage === 'transcribing' &&
                              (activeStage === 'analyzing' ||
                                activeStage === 'saving' ||
                                transcriptionCompleted)) ||
                            (stage === 'analyzing' &&
                              (activeStage === 'saving' || transcriptionCompleted)) ||
                            (stage === 'saving' && sessionSaved);
                          const label =
                            stage === 'transcribing'
                              ? 'Transcribe'
                              : stage === 'analyzing'
                                ? 'Analyze'
                                : 'Save';

                          return (
                            <View
                              key={stage}
                              style={[
                                styles.stagePill,
                                isActive && styles.stagePillActive,
                                isDone && styles.stagePillDone,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.stagePillText,
                                  isActive && styles.stagePillTextActive,
                                  isDone && styles.stagePillTextDone,
                                ]}
                              >
                                {label}
                              </Text>
                            </View>
                          );
                        },
                      )}
                    </View>
                    <Text style={styles.processingHint}>
                      {stageMessage ||
                        'This can take a few minutes for long recordings. You can keep using Guru while this runs.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.cancelProcessingBtn}
                      onPress={handleCancelTranscription}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelProcessingBtnText}>Cancel transcription</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Phase: results */}
            {phase === 'results' && analysis && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {isSaving && (
                  <View style={styles.inlineStatusCard}>
                    <ActivityIndicator color="#6C63FF" size="small" />
                    <Text style={styles.inlineStatusTitle}>Saving lecture summary</Text>
                    <Text style={styles.inlineStatusHint}>
                      Topics are being marked now. The detailed note will be enhanced in the
                      background.
                    </Text>
                  </View>
                )}
                <View style={styles.resultsHeader}>
                  <View
                    style={[
                      styles.subjectChip,
                      { backgroundColor: subjectColor + '22', borderColor: subjectColor + '66' },
                    ]}
                  >
                    <Text style={[styles.subjectChipText, { color: subjectColor }]}>
                      {analysis.subject}
                    </Text>
                  </View>
                  <Text style={styles.summaryText}>{analysis.lectureSummary}</Text>
                </View>

                {analysis.topics.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>TOPICS DETECTED</Text>
                    <View style={styles.topicRow}>
                      {analysis.topics.map((t, i) => (
                        <TouchableOpacity
                          key={`${t}-${i}`}
                          style={styles.topicPillEditable}
                          onPress={() => {
                            // Toggle topic removal/addition
                            if (!analysis) return;
                            const newTopics = analysis.topics.includes(t)
                              ? analysis.topics.filter((topic) => topic !== t)
                              : [...analysis.topics, t];
                            setAnalysis({ ...analysis, topics: newTopics });
                          }}
                          activeOpacity={0.6}
                        >
                          <Text style={styles.topicPillText}>{t}</Text>
                          <Text style={styles.topicRemoveIcon}>×</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.topicHint}>Tap a topic to remove it</Text>
                  </View>
                )}

                {analysis.keyConcepts.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>KEY CONCEPTS</Text>
                    {analysis.keyConcepts.map((c, i) => (
                      <Text key={i} style={styles.conceptItem}>
                        • {c}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.confidenceSection}>
                  <Text style={styles.sectionLabel}>YOUR CONFIDENCE LEVEL</Text>
                  <View style={styles.confidenceSelector}>
                    {([1, 2, 3] as const).map((level) => {
                      const isSelected = (userConfidence ?? analysis.estimatedConfidence) === level;
                      const labels = {
                        1: '🌱 Introduced',
                        2: '🌿 Understood',
                        3: '🌳 Can explain',
                      };
                      const colors = { 1: '#F44336', 2: '#FF9800', 3: '#4CAF50' };
                      return (
                        <TouchableOpacity
                          key={level}
                          style={[
                            styles.confidenceOption,
                            isSelected && {
                              backgroundColor: colors[level] + '33',
                              borderColor: colors[level],
                            },
                          ]}
                          onPress={() => setUserConfidence(level)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.confidenceOptionText,
                              isSelected && { color: colors[level] },
                            ]}
                          >
                            {labels[level]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {userConfidence && userConfidence !== analysis.estimatedConfidence && (
                    <Text style={styles.confidenceOverrideNote}>
                      AI detected "
                      {analysis.estimatedConfidence === 1
                        ? 'Introduced'
                        : analysis.estimatedConfidence === 2
                          ? 'Understood'
                          : 'Can explain'}
                      " — you're overriding to your selection
                    </Text>
                  )}
                </View>

                {analysis.topics.length === 0 && (
                  <Text style={styles.noContentNote}>
                    No medical topics detected — audio may have been inaudible or mostly silent.
                  </Text>
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
                    <Text style={styles.quizProgress}>
                      Q {currentQ + 1} / {quizQuestions.length}
                    </Text>
                    <Text style={styles.questionText}>{q.question}</Text>
                    <View style={styles.optionsContainer}>
                      {q.options.map((opt, idx) => {
                        let bgColor = '#12121A';
                        let borderColor = '#2A2A38';
                        if (selected !== null) {
                          if (idx === q.correctIndex) {
                            bgColor = '#0A1F0A';
                            borderColor = '#4CAF50';
                          } else if (idx === selected) {
                            bgColor = '#1F0A0A';
                            borderColor = '#F44336';
                          }
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
                      <View
                        style={[
                          styles.explBox,
                          { borderColor: selected === q.correctIndex ? '#4CAF50' : '#F44336' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.explLabel,
                            { color: selected === q.correctIndex ? '#4CAF50' : '#F44336' },
                          ]}
                        >
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
                  {score === quizQuestions.length
                    ? '🏆'
                    : score >= quizQuestions.length / 2
                      ? '🎯'
                      : '📚'}
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
                {canTranscribe ? (
                  <TouchableOpacity style={styles.retryBtn} onPress={runTranscription}>
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.retryBtn} onPress={cleanupAndClose}>
                    <Text style={styles.retryBtnText}>Close</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              {/* Results phase: simplified to 2 CTAs */}
              {phase === 'results' && analysis && analysis.topics.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleMarkAndQuiz}
                    disabled={isSaving}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryBtnText}>
                      {isSaving
                        ? 'Saving lecture summary…'
                        : quizLoading
                          ? '⏳ Loading Quiz…'
                          : '🧠 Mark as Studied + Quick Quiz'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.outlineBtn}
                    onPress={() => handleMarkStudied()}
                    disabled={isSaving}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.outlineBtnText}>
                      ✓ Just Mark as Studied (+{analysis.topics.length * 8} XP)
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Results phase: no topics detected */}
              {phase === 'results' && analysis && analysis.topics.length === 0 && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleSaveAndClose}
                  disabled={isSaving}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Save & Done</Text>
                </TouchableOpacity>
              )}

              {/* Quiz phase: next / finish */}
              {phase === 'quiz' && selected !== null && q && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleNextQuestion}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>
                    {currentQ < quizQuestions.length - 1 ? 'Next Question →' : 'See My Score'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Quiz phase: skip if no questions or stuck loading */}
              {phase === 'quiz' && !quizLoading && !q && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={cleanupAndClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Close</Text>
                </TouchableOpacity>
              )}

              {/* Quiz done */}
              {phase === 'quiz_done' && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={cleanupAndClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              )}

              {/* Dismiss / Skip always available (except quiz_done which has its own Done) */}
              {phase !== 'quiz_done' && (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={handleSkip}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryBtnText}>
                    {phase === 'results'
                      ? 'Skip'
                      : phase === 'quiz'
                        ? 'End Quiz'
                        : isProcessingPhase
                          ? 'Keep Browsing'
                          : 'Dismiss'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  compactDock: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#171A22',
    borderWidth: 1,
    borderColor: '#2C3240',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  compactCardReady: {
    borderColor: '#335C4C',
    backgroundColor: '#13211C',
  },
  compactCardError: {
    borderColor: '#6A3131',
    backgroundColor: '#261414',
  },
  compactTextWrap: { flex: 1 },
  compactEyebrow: {
    color: '#7E889C',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  compactTitle: {
    color: '#F5F7FB',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  compactSubtitle: {
    color: '#B4BDCF',
    fontSize: 12,
    lineHeight: 17,
  },
  compactMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  compactChevron: {
    color: '#90A0C0',
    fontSize: 12,
    fontWeight: '700',
  },
  sheet: {
    backgroundColor: '#1A1A24',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: '#2A2A38',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  sheetTopRow: {
    alignItems: 'center',
    marginBottom: 18,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A48',
    alignSelf: 'center',
  },
  minimizeBtn: {
    position: 'absolute',
    right: 0,
    top: -8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#202432',
    borderWidth: 1,
    borderColor: '#303649',
  },
  minimizeBtnText: {
    color: '#B9C0D1',
    fontSize: 12,
    fontWeight: '700',
  },
  centeredBlock: { alignItems: 'center', paddingVertical: 12 },
  returnEmoji: { fontSize: 44, marginBottom: 10 },
  returnTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  returnSub: { color: '#9E9E9E', fontSize: 14, marginTop: 4, textAlign: 'center' },
  spinnerText: { color: '#6C63FF', fontSize: 13, flexShrink: 1 },
  processingCard: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C3240',
    backgroundColor: '#151923',
    alignItems: 'center',
    gap: 8,
  },
  processingTitle: {
    color: '#F5F7FB',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  stageRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  stagePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#31384A',
    backgroundColor: '#1B2030',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stagePillActive: {
    borderColor: '#6C63FF',
    backgroundColor: '#6C63FF22',
  },
  stagePillDone: {
    borderColor: '#2E7D32',
    backgroundColor: '#17301D',
  },
  stagePillText: {
    color: '#9AA5BC',
    fontSize: 11,
    fontWeight: '700',
  },
  stagePillTextActive: {
    color: '#C8C2FF',
  },
  stagePillTextDone: {
    color: '#8FD39B',
  },
  processingHint: {
    color: '#A7B0C3',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  cancelProcessingBtn: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6A3131',
    backgroundColor: '#261414',
  },
  cancelProcessingBtnText: {
    color: '#F28B8B',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineStatusCard: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2C3240',
    backgroundColor: '#151923',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  inlineStatusTitle: {
    color: '#F5F7FB',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  inlineStatusHint: {
    color: '#A7B0C3',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  resultsHeader: { marginBottom: 14 },
  subjectChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  subjectChipText: { fontSize: 13, fontWeight: '800' },
  summaryText: { color: '#C5C5D2', fontSize: 13, lineHeight: 19 },
  section: { marginBottom: 14 },
  sectionLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicPill: {
    backgroundColor: '#6C63FF22',
    borderWidth: 1,
    borderColor: '#6C63FF55',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  topicPillEditable: {
    backgroundColor: '#6C63FF22',
    borderWidth: 1,
    borderColor: '#6C63FF55',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topicRemoveIcon: { color: '#6C63FF88', fontSize: 16, fontWeight: '700' },
  topicHint: { color: '#555', fontSize: 10, marginTop: 6, fontStyle: 'italic' },
  topicPillText: { color: '#A09CF7', fontSize: 13, fontWeight: '600' },
  conceptItem: { color: '#C5C5D2', fontSize: 12, lineHeight: 20 },
  confidenceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  confidenceLabel: { color: '#777', fontSize: 12 },
  confidenceVal: { color: '#fff', fontSize: 12, fontWeight: '700' },
  confidenceSection: { marginBottom: 16 },
  confidenceSelector: { flexDirection: 'row', gap: 8, marginTop: 4 },
  confidenceOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#333',
    backgroundColor: '#1A1A24',
    alignItems: 'center',
  },
  confidenceOptionText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  confidenceOverrideNote: {
    color: '#666',
    fontSize: 10,
    marginTop: 8,
    fontStyle: 'italic',
  },
  noContentNote: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  errorDetail: {
    color: '#F44336',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#6C63FF22',
    borderWidth: 1,
    borderColor: '#6C63FF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  retryBtnText: { color: '#6C63FF', fontWeight: '700' },

  // Quiz
  quizProgress: {
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  questionText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    marginBottom: 14,
  },
  optionsContainer: { gap: 8, marginBottom: 8 },
  optionBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
  },
  optionText: { color: '#C5C5D2', fontSize: 14, lineHeight: 20 },
  explBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#12121A',
  },
  explLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  explText: { color: '#9E9E9E', fontSize: 12, lineHeight: 18 },

  // XP bonus
  xpBonusBox: {
    marginTop: 16,
    backgroundColor: '#2E7D3222',
    borderWidth: 1,
    borderColor: '#4CAF5055',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  xpBonusText: { color: '#4CAF50', fontWeight: '800', fontSize: 15 },

  // Actions
  actions: { marginTop: 12, gap: 8 },
  primaryBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    flexShrink: 1,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: '#6C63FF',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    flexShrink: 1,
  },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { color: '#777', fontSize: 14, fontWeight: '600' },
});
