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
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { styles } from './lectureReturn/LectureReturnSheet.styles';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../theme/linearTheme';
import LoadingIndicator from './primitives/LoadingIndicator';

import { type LecturePipelineStage } from '../services/lecture/lectureSessionMonitor';
// CONFIDENCE_LABELS and CONFIDENCE_LABELS_WITH_EMOJI removed — unused imports
import { useLecturePipeline } from '../hooks/useLecturePipeline';
import { MarkdownRender } from './MarkdownRender';
import { LectureReturnActionButtons } from './lectureReturn/LectureReturnActionButtons';
import { LectureReturnCompactBubble } from './lectureReturn/LectureReturnCompactBubble';
import { LectureReturnTopicRow } from './lectureReturn/LectureReturnTopicRow';
import { LectureReturnConfidenceSelector } from './lectureReturn/LectureReturnConfidenceSelector';
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
  onCreateMindMap?: (topicName: string) => void;
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
      return `${subject}${
        topicCount > 0 ? ` • ${topicCount} topic${topicCount === 1 ? '' : 's'} detected` : ''
      }`;
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
        <LectureReturnCompactBubble
          bottomOffset={bottomOffset}
          phase={phase}
          isWorkingPhase={isWorkingPhase}
          isIntroPhase={isIntroPhase}
          stageMessage={stageMessage}
          progressLabel={progressLabel}
          progressProvider={progressProvider}
          compactTitle={getCompactTitle()}
          compactSubtitle={getCompactSubtitle()}
          setIsExpanded={setIsExpanded}
          cleanupAndClose={cleanupAndClose}
        />
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
                    <LoadingIndicator color={n.colors.accent} size="small" />
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
                  <LectureReturnTopicRow
                    topics={analysis.topics}
                    onToggleTopic={(t) => {
                      if (!analysis) return;
                      const newTopics = analysis.topics.includes(t)
                        ? analysis.topics.filter((topic: string) => topic !== t)
                        : [...analysis.topics, t];
                      setAnalysis({ ...analysis, topics: newTopics });
                    }}
                  />
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
                  <LectureReturnConfidenceSelector
                    userConfidence={userConfidence}
                    estimatedConfidence={analysis.estimatedConfidence}
                    setUserConfidence={setUserConfidence}
                  />
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
                          <LoadingIndicator color={n.colors.accent} size="small" />
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
                    <LoadingIndicator color={n.colors.accent} size="large" />
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
                          {selected === q.correctIndex ? (
                            <Ionicons name="checkmark-circle" size={16} color={n.colors.success} />
                          ) : (
                            <Ionicons name="close-circle" size={16} color={n.colors.error} />
                          )}{' '}
                          {selected === q.correctIndex ? 'Correct!' : 'Incorrect'}
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
            <LectureReturnActionButtons
              phase={phase}
              analysis={analysis}
              appName={appName}
              isSaving={isSaving}
              quizLoading={quizLoading}
              subjectSelectionRequired={subjectSelectionRequired}
              selectedSubjectName={selectedSubjectName}
              isWorkingPhase={isWorkingPhase}
              isIntroPhase={isIntroPhase}
              selected={selected}
              hasQuestion={!!q}
              currentQ={currentQ}
              totalQuestions={quizQuestions.length}
              handleMarkAndQuiz={handleMarkAndQuiz}
              handleMarkStudied={handleMarkStudied}
              onCreateMindMap={props.onCreateMindMap}
              handleSaveAndClose={handleSaveAndClose}
              handleNextQuestion={handleNextQuestion}
              cleanupAndClose={cleanupAndClose}
              handleSkip={handleSkip}
            />
          </View>
        </View>
      )}
    </View>
  );
}
