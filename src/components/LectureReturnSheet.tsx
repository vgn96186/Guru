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
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../theme/linearTheme';
import { CONFIDENCE_LABELS, CONFIDENCE_LABELS_WITH_EMOJI } from '../constants/gamification';
import { type LecturePipelineStage } from '../services/lecture/lectureSessionMonitor';
import { useLecturePipeline } from '../hooks/useLecturePipeline';
import { MarkdownRender } from './MarkdownRender';
import SubjectSelectionCard from './SubjectSelectionCard';

interface Props {
  visible: boolean;
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
  logId: number;
  groqKey: string;
  bottomOffset?: number;
  onDone: () => void;
  onStudyNow?: () => void;
}

export default function LectureReturnSheet(props: Props) {
  const { visible, appName, durationMinutes, bottomOffset = 92 } = props;
  const {
    phase,
    analysis,
    setAnalysis,
    errorMsg,
    isExpanded,
    setIsExpanded,
    activeStage,
    stageMessage,
    stageDetail,
    progressPercent,
    progressStep,
    progressTotalSteps,
    progressAttempt,
    progressMaxAttempts,
    progressProvider,
    stageStartedAt,
    progressHistory,
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
    subjectSelectionRequired,
    selectedSubjectName,
    setSelectedSubjectName,
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
  const [nowTick, setNowTick] = React.useState(() => Date.now());
  const [generatingTopics, setGeneratingTopics] = React.useState(false);

  async function handleGenerateTopics() {
    if (!analysis || !analysis.transcript) return;
    setGeneratingTopics(true);
    try {
      const { analyzeTranscript } = await import('../services/transcription/analysis');
      const newAnalysis = await analyzeTranscript(analysis.transcript);
      if (newAnalysis.topics.length > 0) {
        setAnalysis({ ...analysis, topics: newAnalysis.topics });
      }
    } catch (e) {
      console.warn('[LectureReturnSheet] Generate topics failed:', e);
    } finally {
      setGeneratingTopics(false);
    }
  }

  React.useEffect(() => {
    if (!activeStage || !stageStartedAt) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeStage, stageStartedAt]);

  function formatElapsed(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function getCompactTitle() {
    if (activeStage === 'transcribing') return 'Transcribing';
    if (activeStage === 'analyzing') return 'Analyzing';
    if (activeStage === 'saving') return 'Saving';
    if (phase === 'error') return 'Needs attention';
    if (phase === 'results') return 'Summary ready';
    if (phase === 'quiz') return 'Quiz ready';
    if (phase === 'quiz_done') return 'Recap done';
    return appName;
  }

  function getCompactSubtitle() {
    if (activeStage) {
      if (progressLabel) {
        return progressProvider ? `${progressLabel} via ${progressProvider}` : progressLabel;
      }
      return durationMinutes > 0 ? `${durationMinutes} min recorded` : 'Lecture in progress';
    }
    if (phase === 'error') return errorMsg || 'Tap to retry or review the failure.';
    if (phase === 'results') {
      const subject = selectedSubjectName ?? analysis?.subject ?? 'Lecture';
      const topicCount = analysis?.topics.length ?? 0;
      return `${subject}${topicCount > 0 ? ` • ${topicCount} topic${topicCount === 1 ? '' : 's'} detected` : ''}`;
    }
    if (phase === 'quiz') {
      return `${quizQuestions.length} question${quizQuestions.length === 1 ? '' : 's'} ready`;
    }
    if (phase === 'quiz_done') {
      return `${score} / ${quizQuestions.length} correct`;
    }
    return durationMinutes > 0 ? `${durationMinutes} min recorded` : 'Lecture captured';
  }

  const SUBJECT_COLORS: Record<string, string> = {
    Anatomy: '#E91E63',
    Physiology: '#9C27B0',
    Biochemistry: '#3F51B5',
    Pathology: n.colors.error,
    Microbiology: '#009688',
    Pharmacology: n.colors.warning,
    Medicine: n.colors.accent,
    Surgery: '#795548',
    OBG: '#E91E63',
    Pediatrics: n.colors.success,
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
  const subjectColor =
    SUBJECT_COLORS[selectedSubjectName ?? analysis?.subject ?? ''] ?? n.colors.accent;
  const isWorkingPhase = phase === 'transcribing' || activeStage !== null;
  const isIntroPhase = phase === 'intro';
  const showCompactCard = !isExpanded;
  const elapsedLabel =
    activeStage && stageStartedAt ? formatElapsed(nowTick - stageStartedAt) : null;
  const progressLabel =
    progressPercent > 0 ? `${Math.max(1, Math.min(100, Math.round(progressPercent)))}%` : null;
  const progressFacts = [
    progressProvider ? progressProvider.toUpperCase() : null,
    progressStep && progressTotalSteps ? `STEP ${progressStep}/${progressTotalSteps}` : null,
    progressAttempt && progressMaxAttempts
      ? `ATTEMPT ${progressAttempt}/${progressMaxAttempts}`
      : null,
    elapsedLabel ? `ELAPSED ${elapsedLabel}` : null,
  ].filter(Boolean);

  const q = quizQuestions[currentQ];

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      {showCompactCard ? (
        <View pointerEvents="box-none" style={styles.bubbleDock}>
          <View style={[styles.bubblePositioner, { paddingBottom: bottomOffset }]}>
            <TouchableOpacity
              style={[
                styles.bubbleRow,
                phase === 'error' && styles.bubbleError,
                phase === 'results' && styles.bubbleReady,
              ]}
              onPress={() => setIsExpanded(true)}
              activeOpacity={0.85}
            >
              <View style={styles.bubbleIconWrap}>
                <Ionicons
                  name={
                    phase === 'error'
                      ? 'alert-circle'
                      : phase === 'results' || phase === 'quiz' || phase === 'quiz_done'
                        ? 'checkmark-circle'
                        : 'mic'
                  }
                  size={18}
                  color={
                    phase === 'error'
                      ? n.colors.error
                      : phase === 'results' || phase === 'quiz' || phase === 'quiz_done'
                        ? n.colors.success
                        : n.colors.accent
                  }
                />
                {isWorkingPhase ? (
                  <ActivityIndicator
                    style={styles.bubbleSpinner}
                    color={n.colors.accent}
                    size="small"
                  />
                ) : null}
              </View>
              <View style={styles.bubbleTextWrap}>
                <Text style={styles.bubbleTitle}>
                  {isWorkingPhase ? stageMessage || getCompactTitle() : getCompactTitle()}
                </Text>
                <Text style={styles.bubbleSub}>
                  {isWorkingPhase && progressLabel
                    ? `${progressLabel}${progressProvider ? ` · ${progressProvider}` : ''}`
                    : isIntroPhase
                      ? 'Tap to start transcription'
                      : getCompactSubtitle()}
                </Text>
              </View>
              {!isWorkingPhase && (
                <TouchableOpacity
                  style={styles.bubbleDismiss}
                  onPress={() => void cleanupAndClose()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.bubbleDismissText}>{'×'}</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetTopRow}>
              <View style={styles.handle} />
              <TouchableOpacity
                style={styles.minimizeBtn}
                onPress={() => setIsExpanded(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.minimizeBtnText}>Minimize</Text>
              </TouchableOpacity>
            </View>

            {/* Phase: intro / transcribing */}
            {(phase === 'intro' || phase === 'transcribing') && (
              <View style={styles.centeredBlock}>
                <Ionicons
                  name="mic-outline"
                  size={40}
                  color={n.colors.accent}
                  style={styles.returnIcon}
                />
                <Text style={styles.returnTitle}>Back from {appName}!</Text>
                <Text style={styles.returnSub}>
                  {durationMinutes > 0 ? `${durationMinutes} min recorded` : 'Session logged'}
                </Text>
                {phase === 'intro' && canTranscribe && (
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={runTranscription}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Start lecture transcription"
                  >
                    <Text style={styles.retryBtnText}>Start transcription</Text>
                  </TouchableOpacity>
                )}
                {phase === 'transcribing' && (
                  <View style={styles.processingCard}>
                    <View style={styles.progressHeaderRow}>
                      <Text style={styles.processingTitle}>{getCompactTitle()}</Text>
                      {progressLabel ? (
                        <Text style={styles.progressPercentText}>{progressLabel}</Text>
                      ) : null}
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${Math.max(8, Math.min(100, progressPercent || 10))}%` },
                        ]}
                      />
                    </View>
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
                    {stageDetail ? <Text style={styles.processingMeta}>{stageDetail}</Text> : null}
                    {progressFacts.length > 0 ? (
                      <View style={styles.progressFactsRow}>
                        {progressFacts.map((fact) => (
                          <View key={fact} style={styles.progressFactPill}>
                            <Text style={styles.progressFactText}>{fact}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {progressHistory.length > 0 ? (
                      <View style={styles.timelineCard}>
                        <Text style={styles.timelineLabel}>LIVE ACTIVITY</Text>
                        {progressHistory
                          .slice()
                          .reverse()
                          .map((event) => (
                            <View key={event.id} style={styles.timelineRow}>
                              <View style={styles.timelineDot} />
                              <View style={styles.timelineTextWrap}>
                                <Text style={styles.timelineTitle}>{event.message}</Text>
                                {event.detail ? (
                                  <Text style={styles.timelineDetail}>{event.detail}</Text>
                                ) : null}
                              </View>
                            </View>
                          ))}
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.cancelProcessingBtn}
                      onPress={handleCancelTranscription}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel transcription"
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
                    <ActivityIndicator color={n.colors.accent} size="small" />
                    <Text style={styles.inlineStatusTitle}>Saving lecture summary</Text>
                    <Text style={styles.inlineStatusHint}>
                      Topics are being marked now. The detailed note will be enhanced in the
                      background.
                    </Text>
                  </View>
                )}
                {analysis.topics.length > 0 && (
                  <View style={styles.resultsHeader}>
                    <View
                      style={[
                        styles.subjectChip,
                        { backgroundColor: subjectColor + '22', borderColor: subjectColor + '66' },
                      ]}
                    >
                      <Text style={[styles.subjectChipText, { color: subjectColor }]}>
                        {selectedSubjectName ?? analysis.subject}
                      </Text>
                    </View>
                    <Text style={styles.summaryText}>{analysis.lectureSummary}</Text>
                  </View>
                )}

                {subjectSelectionRequired && (
                  <SubjectSelectionCard
                    detectedSubjectName={analysis.subject}
                    selectedSubjectName={selectedSubjectName}
                    onSelectSubject={setSelectedSubjectName}
                  />
                )}

                {analysis.topics.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>TOPICS DETECTED</Text>
                    <View style={styles.topicRow}>
                      {analysis.topics.map((t: string, i: number) => (
                        <TouchableOpacity
                          key={`${t}-${i}`}
                          style={styles.topicPillEditable}
                          onPress={() => {
                            // Toggle topic removal/addition
                            if (!analysis) return;
                            const newTopics = analysis.topics.includes(t)
                              ? analysis.topics.filter((topic: string) => topic !== t)
                              : [...analysis.topics, t];
                            setAnalysis({ ...analysis, topics: newTopics });
                          }}
                          activeOpacity={0.6}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove topic: ${t}`}
                        >
                          <Text style={styles.topicPillText}>{t}</Text>
                          <Text style={styles.topicRemoveIcon}>×</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.topicHint}>Tap a topic to remove it</Text>
                  </View>
                )}

                {analysis.topics.length > 0 && analysis.keyConcepts.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>KEY CONCEPTS</Text>
                    {analysis.keyConcepts.map((c: string, i: number) => (
                      <Text key={i} style={styles.conceptItem}>
                        • {c}
                      </Text>
                    ))}
                  </View>
                )}

                {analysis.topics.length > 0 && (
                  <View style={styles.confidenceSection}>
                    <Text style={styles.sectionLabel}>YOUR CONFIDENCE LEVEL</Text>
                    <View style={styles.confidenceSelector}>
                      {([1, 2, 3] as const).map((level) => {
                        const isSelected =
                          (userConfidence ?? analysis.estimatedConfidence) === level;
                        const colors = {
                          1: n.colors.error,
                          2: n.colors.warning,
                          3: n.colors.success,
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
                              {CONFIDENCE_LABELS_WITH_EMOJI[level]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {userConfidence && userConfidence !== analysis.estimatedConfidence && (
                      <Text style={styles.confidenceOverrideNote}>
                        AI detected "{CONFIDENCE_LABELS[analysis.estimatedConfidence as 1 | 2 | 3]}"
                        — you're overriding to your selection
                      </Text>
                    )}
                  </View>
                )}

                {analysis.topics.length === 0 && (
                  <View style={styles.noTopicsCard}>
                    <Text style={styles.noTopicsIcon}>🔇</Text>
                    <Text style={styles.noTopicsTitle}>No topics detected</Text>
                    <Text style={styles.noTopicsHint}>
                      The audio may have been inaudible, too short, or mostly silent. You can skip
                      this session or try to extract topics from the transcript.
                    </Text>
                    {analysis.transcript && analysis.transcript.length > 20 && (
                      <TouchableOpacity
                        style={styles.generateTopicsBtn}
                        onPress={handleGenerateTopics}
                        disabled={generatingTopics}
                        activeOpacity={0.8}
                      >
                        {generatingTopics ? (
                          <ActivityIndicator color={n.colors.accent} size="small" />
                        ) : (
                          <>
                            <Ionicons name="sparkles-outline" size={16} color={n.colors.accent} />
                            <Text style={styles.generateTopicsBtnText}>Generate Topics</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </ScrollView>
            )}

            {/* Phase: quiz */}
            {phase === 'quiz' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {quizLoading && !q ? (
                  <View style={styles.centeredBlock}>
                    <ActivityIndicator color={n.colors.accent} size="large" />
                    <Text style={[styles.spinnerText, { marginTop: 12 }]}>Generating quiz</Text>
                  </View>
                ) : q ? (
                  <View>
                    <Text style={styles.quizProgress}>
                      Q {currentQ + 1} / {quizQuestions.length}
                    </Text>
                    <Text style={styles.questionText}>{q.question}</Text>
                    <View style={styles.optionsContainer}>
                      {q.options.map((opt: string, idx: number) => {
                        let bgColor: string = n.colors.surface;
                        let borderColor: string = n.colors.border;
                        if (selected !== null) {
                          if (idx === q.correctIndex) {
                            bgColor = n.colors.successSurface;
                            borderColor = n.colors.success;
                          } else if (idx === selected) {
                            bgColor = n.colors.errorSurface;
                            borderColor = n.colors.error;
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
                              selected === q.correctIndex ? n.colors.success : n.colors.error,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.explLabel,
                            {
                              color:
                                selected === q.correctIndex ? n.colors.success : n.colors.error,
                            },
                          ]}
                        >
                          {selected === q.correctIndex ? '✅ Correct!' : '❌ Incorrect'}
                        </Text>
                        <MarkdownRender content={q.explanation} compact />
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.centeredBlock}>
                    <Ionicons
                      name="help-circle-outline"
                      size={40}
                      color={n.colors.textMuted}
                      style={styles.returnIcon}
                    />
                    <Text style={styles.returnTitle}>No quiz available</Text>
                    <Text style={styles.returnSub}>Not enough content to generate questions.</Text>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Phase: quiz_done */}
            {phase === 'quiz_done' && (
              <View style={styles.centeredBlock}>
                <Ionicons
                  name={
                    score === quizQuestions.length
                      ? 'trophy'
                      : score >= quizQuestions.length / 2
                        ? 'ribbon'
                        : 'book-outline'
                  }
                  size={40}
                  color={
                    score === quizQuestions.length
                      ? n.colors.warning
                      : score >= quizQuestions.length / 2
                        ? n.colors.success
                        : n.colors.accent
                  }
                  style={styles.returnIcon}
                />
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
                <Ionicons
                  name="alert-circle-outline"
                  size={40}
                  color={n.colors.error}
                  style={styles.returnIcon}
                />
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
                    disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isSaving
                        ? 'Saving'
                        : quizLoading
                          ? 'Loading quiz'
                          : 'Mark as studied and take quick quiz'
                    }
                  >
                    <Text style={styles.primaryBtnText}>
                      {isSaving
                        ? 'Saving lecture summary'
                        : quizLoading
                          ? 'Loading Quiz'
                          : '🧠 Mark as Studied + Quick Quiz'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.outlineBtn}
                    onPress={() => handleMarkStudied()}
                    disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Just mark as studied, ${analysis.topics.length * 8} XP`}
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
                  disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
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
              {phase !== 'quiz_done' && !isWorkingPhase && !isIntroPhase && (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={handleSkip}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Skip and dismiss"
                >
                  <Text style={styles.secondaryBtnText}>
                    {phase === 'results' ? 'Skip' : phase === 'quiz' ? 'End Quiz' : 'Dismiss'}
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
    backgroundColor: 'rgba(1, 2, 4, 0.64)',
  },
  bubbleDock: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end',
    paddingHorizontal: 14,
  },
  bubblePositioner: {
    alignItems: 'flex-end',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(8, 10, 14, 0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 28,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 8,
    maxWidth: 320,
    elevation: 6,
    shadowColor: n.colors.background,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  bubbleReady: {
    borderColor: n.colors.success + '66',
  },
  bubbleError: {
    borderColor: n.colors.error + '66',
  },
  bubbleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleSpinner: {
    position: 'absolute',
  },
  bubbleTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  bubbleTitle: {
    color: n.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
    lineHeight: 17,
    paddingBottom: 1,
  },
  bubbleSub: {
    color: n.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
    flexShrink: 1,
    lineHeight: 14,
    paddingBottom: 1,
  },
  bubbleDismiss: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: n.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  bubbleDismissText: {
    color: n.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: -1,
  },
  sheet: {
    backgroundColor: 'rgba(6, 8, 12, 0.94)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 22,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    elevation: 10,
    shadowColor: n.colors.background,
    shadowOpacity: 0.36,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  sheetTopRow: {
    alignItems: 'center',
    marginBottom: 18,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
  },
  minimizeBtn: {
    position: 'absolute',
    right: 0,
    top: -8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  minimizeBtnText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  centeredBlock: { alignItems: 'center', paddingVertical: 12 },
  returnIcon: { marginBottom: 10 },
  returnTitle: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
    paddingBottom: 2,
  },
  returnSub: {
    color: n.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 20,
    paddingBottom: 2,
  },
  spinnerText: { color: n.colors.accent, fontSize: 13, flexShrink: 1 },
  processingCard: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    gap: 8,
  },
  progressHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  processingTitle: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  progressPercentText: {
    color: n.colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: n.colors.accent,
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
    borderColor: n.colors.borderLight,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stagePillActive: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.primaryTintSoft,
  },
  stagePillDone: {
    borderColor: n.colors.success,
    backgroundColor: n.colors.successSurface,
  },
  stagePillText: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  stagePillTextActive: {
    color: n.colors.accent,
  },
  stagePillTextDone: {
    color: n.colors.success,
  },
  processingHint: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  processingMeta: {
    color: n.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  progressFactsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  progressFactPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: n.colors.borderLight,
  },
  progressFactText: {
    color: n.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  timelineCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.borderLight,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  timelineLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: n.colors.accent,
  },
  timelineTextWrap: {
    flex: 1,
    gap: 2,
  },
  timelineTitle: {
    color: n.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineDetail: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  cancelProcessingBtn: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: n.colors.error,
    backgroundColor: n.colors.errorSurface,
  },
  cancelProcessingBtnText: {
    color: n.colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineStatusCard: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  inlineStatusTitle: {
    color: n.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  inlineStatusHint: {
    color: n.colors.textSecondary,
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
  subjectChipText: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  summaryText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    paddingBottom: 2,
  },
  section: { marginBottom: 14 },
  sectionLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicPill: {
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  topicPillEditable: {
    backgroundColor: 'rgba(94,106,210,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 34,
  },
  topicRemoveIcon: { color: n.colors.accent, fontSize: 16, fontWeight: '700' },
  topicHint: { color: n.colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  topicPillText: {
    color: n.colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    flexShrink: 1,
    paddingBottom: 1,
  },
  conceptItem: { color: n.colors.textSecondary, fontSize: 12, lineHeight: 20 },
  confidenceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  confidenceLabel: { color: n.colors.textMuted, fontSize: 12 },
  confidenceVal: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '700' },
  confidenceSection: { marginBottom: 16 },
  confidenceSelector: { flexDirection: 'row', gap: 8, marginTop: 4 },
  confidenceOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: n.colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  confidenceOptionText: {
    color: n.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  confidenceOverrideNote: {
    color: n.colors.textMuted,
    fontSize: 11,
    marginTop: 8,
    fontStyle: 'italic',
  },
  noContentNote: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  noTopicsCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  noTopicsIcon: { fontSize: 40 },
  noTopicsTitle: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  noTopicsHint: {
    color: n.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  generateTopicsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: n.colors.accent + '18',
    borderColor: n.colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignSelf: 'center',
  },
  generateTopicsBtnText: {
    color: n.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  errorDetail: {
    color: n.colors.error,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: n.colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  retryBtnText: { color: n.colors.accent, fontWeight: '700', lineHeight: 18, paddingBottom: 1 },

  // Quiz
  quizProgress: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  questionText: {
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    marginBottom: 14,
    paddingBottom: 2,
  },
  optionsContainer: { gap: 8, marginBottom: 8 },
  optionBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
  },
  optionText: { color: n.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  explBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  explLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  explText: { color: n.colors.textMuted, fontSize: 12, lineHeight: 18 },

  // XP bonus
  xpBonusBox: {
    marginTop: 16,
    backgroundColor: 'rgba(63,185,80,0.12)',
    borderWidth: 1,
    borderColor: n.colors.success + '55',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  xpBonusText: { color: n.colors.success, fontWeight: '800', fontSize: 15 },

  // Actions
  actions: { marginTop: 12, gap: 8 },
  primaryBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: n.colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    paddingBottom: 1,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: n.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    paddingBottom: 1,
  },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { color: n.colors.textMuted, fontSize: 14, fontWeight: '600' },
});
