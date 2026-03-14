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

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../constants/theme';
import { type LecturePipelineStage } from '../services/lectureSessionMonitor';
import { useLecturePipeline } from '../hooks/useLecturePipeline';

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

export default function LectureReturnSheet(props: Props) {
  const { visible, appName, durationMinutes, logId } = props;
  const {
    phase,
    analysis,
    setAnalysis,
    errorMsg,
    isExpanded,
    setIsExpanded,
    activeStage,
    stageMessage,
    transcriptionCompleted,
    sessionSaved,
    isSaving,
    userConfidence,
    setUserConfidence,
    quizQuestions,
    quizLoading,
    currentQ,
    selected,
    showExpl,
    score,
    canTranscribe,
    runTranscription,
    handleCancelTranscription,
    handleMarkStudied,
    handleMarkAndQuiz,
    handleSaveAndClose,
    handleSelectAnswer,
    handleNextQuestion,
    handleSkip,
    cleanupAndClose,
  } = useLecturePipeline(props);

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
    Pathology: theme.colors.error,
    Microbiology: '#009688',
    Pharmacology: theme.colors.warning,
    Medicine: theme.colors.info,
    Surgery: '#795548',
    OBG: '#E91E63',
    Pediatrics: theme.colors.success,
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
  const subjectColor = SUBJECT_COLORS[analysis?.subject ?? ''] ?? theme.colors.primary;
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
                <ActivityIndicator color={theme.colors.primary} size="small" />
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
                    <ActivityIndicator color={theme.colors.primary} size="small" />
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
                    <ActivityIndicator color={theme.colors.primary} size="small" />
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
                      const colors = {
                        1: theme.colors.error,
                        2: theme.colors.warning,
                        3: theme.colors.success,
                      };
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
                    <ActivityIndicator color={theme.colors.primary} size="large" />
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
                        let bgColor = theme.colors.inputBg;
                        let borderColor = theme.colors.border;
                        if (selected !== null) {
                          if (idx === q.correctIndex) {
                            bgColor = theme.colors.successSurface;
                            borderColor = theme.colors.success;
                          } else if (idx === selected) {
                            bgColor = theme.colors.errorSurface;
                            borderColor = theme.colors.error;
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
                          {
                            borderColor:
                              selected === q.correctIndex ? theme.colors.success : theme.colors.error,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.explLabel,
                            {
                              color:
                                selected === q.correctIndex
                                  ? theme.colors.success
                                  : theme.colors.error,
                            },
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
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderColor: theme.colors.success + '88',
    backgroundColor: theme.colors.successSurface,
  },
  compactCardError: {
    borderColor: theme.colors.error + '88',
    backgroundColor: theme.colors.errorSurface,
  },
  compactTextWrap: { flex: 1 },
  compactEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  compactTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  compactSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  compactMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  compactChevron: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.divider,
    alignSelf: 'center',
  },
  minimizeBtn: {
    position: 'absolute',
    right: 0,
    top: -8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  minimizeBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  centeredBlock: { alignItems: 'center', paddingVertical: 12 },
  returnEmoji: { fontSize: 44, marginBottom: 10 },
  returnTitle: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  returnSub: { color: theme.colors.textMuted, fontSize: 14, marginTop: 4, textAlign: 'center' },
  spinnerText: { color: theme.colors.primary, fontSize: 13, flexShrink: 1 },
  processingCard: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    gap: 8,
  },
  processingTitle: {
    color: theme.colors.textPrimary,
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
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.panel,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stagePillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryTintSoft,
  },
  stagePillDone: {
    borderColor: theme.colors.successDark || theme.colors.success,
    backgroundColor: theme.colors.successSurface,
  },
  stagePillText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  stagePillTextActive: {
    color: theme.colors.primaryLight,
  },
  stagePillTextDone: {
    color: theme.colors.success,
  },
  processingHint: {
    color: theme.colors.textSecondary,
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
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.errorSurface,
  },
  cancelProcessingBtnText: {
    color: theme.colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineStatusCard: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  inlineStatusTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  inlineStatusHint: {
    color: theme.colors.textSecondary,
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
  summaryText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  section: { marginBottom: 14 },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicPill: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  topicPillEditable: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topicRemoveIcon: { color: theme.colors.primary, fontSize: 16, fontWeight: '700' },
  topicHint: { color: theme.colors.textMuted, fontSize: 10, marginTop: 6, fontStyle: 'italic' },
  topicPillText: { color: theme.colors.primaryLight, fontSize: 13, fontWeight: '600' },
  conceptItem: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 20 },
  confidenceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  confidenceLabel: { color: theme.colors.textMuted, fontSize: 12 },
  confidenceVal: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: '700' },
  confidenceSection: { marginBottom: 16 },
  confidenceSelector: { flexDirection: 'row', gap: 8, marginTop: 4 },
  confidenceOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  confidenceOptionText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  confidenceOverrideNote: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 8,
    fontStyle: 'italic',
  },
  noContentNote: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  errorDetail: {
    color: theme.colors.error,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  retryBtnText: { color: theme.colors.primary, fontWeight: '700' },

  // Quiz
  quizProgress: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  questionText: {
    color: theme.colors.textPrimary,
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
  optionText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  explBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: theme.colors.panel,
  },
  explLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  explText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },

  // XP bonus
  xpBonusBox: {
    marginTop: 16,
    backgroundColor: theme.colors.successTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.success + '55',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  xpBonusText: { color: theme.colors.success, fontWeight: '800', fontSize: 15 },

  // Actions
  actions: { marginTop: 12, gap: 8 },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    flexShrink: 1,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    flexShrink: 1,
  },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },
});
