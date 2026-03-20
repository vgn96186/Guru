import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  type LectureAnalysis,
  generateADHDNote,
  buildQuickLectureNote,
} from '../services/transcriptionService';
import {
  saveLectureAnalysisQuick,
  transcribeLectureWithRecovery,
  type LecturePipelineProgress,
  type LecturePipelineStage,
} from '../services/lectureSessionMonitor';
import { catalyzeTranscript } from '../services/aiService';
import { BUNDLED_HF_TOKEN } from '../config/appConfig';
import { profileRepository } from '../db/repositories';
import {
  updateSessionTranscriptionStatus,
  updateSessionNoteEnhancementStatus,
} from '../db/queries/externalLogs';
import { useAppStore } from '../store/useAppStore';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export type Phase = 'intro' | 'transcribing' | 'results' | 'quiz' | 'quiz_done' | 'error';

interface UseLecturePipelineProps {
  visible: boolean;
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
  logId: number;
  groqKey: string;
  onDone: () => void;
}

export function useLecturePipeline({
  visible,
  appName,
  durationMinutes,
  recordingPath,
  logId,
  groqKey,
  onDone,
}: UseLecturePipelineProps) {
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

  // Refs for transcription lifecycle
  const transcriptionStartedRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const transcriptionRunIdRef = useRef(0);

  const hasLocalWhisper = !!(profile?.useLocalWhisper && profile?.localWhisperPath);
  const hasHuggingFace = !!(profile?.huggingFaceToken?.trim() || BUNDLED_HF_TOKEN);
  const canTranscribe = !!(recordingPath && (groqKey || hasHuggingFace || hasLocalWhisper));

  const cleanupAndClose = useCallback(async () => {
    if (!sessionSaved && transcriptionCompleted) {
      await updateSessionTranscriptionStatus(logId, 'pending');
    }
    onDone();
  }, [sessionSaved, transcriptionCompleted, logId, onDone]);

  const generateQuiz = useCallback(async (result: LectureAnalysis) => {
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
  }, []);

  const handlePipelineProgress = useCallback((progress: LecturePipelineProgress) => {
    if (cancelRequestedRef.current) return;
    if (progress.stage === 'enhancing') {
      return;
    }
    setActiveStage(progress.stage);
    setStageMessage(progress.message);
  }, []);

  const runTranscription = useCallback(async () => {
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

      if (!visible || cancelRequestedRef.current || runId !== transcriptionRunIdRef.current) {
        if (!visible)
          await updateSessionTranscriptionStatus(logId, 'pending', 'Transcription backgrounded');
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
      if (result.topics.length > 0) {
        generateQuiz(result);
      }
    } catch (e: any) {
      if (!visible || cancelRequestedRef.current || runId !== transcriptionRunIdRef.current) {
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
  }, [logId, recordingPath, groqKey, profile, visible, handlePipelineProgress, generateQuiz]);

  const saveSessionQuickly = useCallback(async (): Promise<boolean> => {
    if (!analysis) return false;

    try {
      setIsSaving(true);
      setActiveStage('saving');
      setStageMessage('Building your note...');
      const finalConfidence = userConfidence ?? analysis.estimatedConfidence;
      const analysisToSave =
        finalConfidence === analysis.estimatedConfidence
          ? analysis
          : { ...analysis, estimatedConfidence: finalConfidence };

      let noteToSave: string;
      try {
        noteToSave = await generateADHDNote(analysisToSave);
      } catch (e) {
        console.warn('[LectureReturn] ADHD note generation failed, using quick note:', e);
        noteToSave = buildQuickLectureNote(analysisToSave);
      }

      await saveLectureAnalysisQuick({
        analysis: analysisToSave,
        appName,
        durationMinutes,
        logId,
        embedding: analysis.embedding,
        noteOverride: noteToSave,
        recordingPath: recordingPath ?? undefined,
      });
      await updateSessionNoteEnhancementStatus(logId, 'completed');

      setAnalysis(analysisToSave);
      setSessionSaved(true);
      setActiveStage(null);
      setStageMessage('');
      return true;
    } catch (e: unknown) {
      console.warn('[LectureReturn] save error:', e);
      setActiveStage(null);
      setStageMessage('');
      const errMsg = e instanceof Error ? e.message : 'Failed while saving lecture note';
      setErrorMsg(`${errMsg}. Audio has been preserved for retry.`);
      setPhase('error');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    analysis,
    recordingPath,
    userConfidence,
    appName,
    durationMinutes,
    logId,
    handlePipelineProgress,
  ]);

  const handleMarkStudied = useCallback(async () => {
    const saved = await saveSessionQuickly();
    if (saved) {
      await cleanupAndClose();
    }
  }, [saveSessionQuickly, cleanupAndClose]);

  const handleMarkAndQuiz = useCallback(async () => {
    const saved = await saveSessionQuickly();
    if (saved) {
      setCurrentQ(0);
      setSelected(null);
      setShowExpl(false);
      setScore(0);
      setPhase('quiz');
    }
  }, [saveSessionQuickly]);

  const handleSaveAndClose = useCallback(async () => {
    const saved = await saveSessionQuickly();
    if (saved) {
      await cleanupAndClose();
    }
  }, [saveSessionQuickly, cleanupAndClose]);

  const handleSelectAnswer = useCallback(
    (idx: number) => {
      if (selected !== null) return;
      const q = quizQuestions[currentQ];
      if (!q) return;
      setSelected(idx);
      setShowExpl(true);
      if (idx === q.correctIndex) {
        setScore((s) => s + 1);
      }
    },
    [selected, quizQuestions, currentQ],
  );

  const handleNextQuestion = useCallback(async () => {
    if (currentQ < quizQuestions.length - 1) {
      setCurrentQ((c) => c + 1);
      setSelected(null);
      setShowExpl(false);
    } else {
      const bonusXp = score * 15;
      if (bonusXp > 0) await profileRepository.addXp(bonusXp);
      setPhase('quiz_done');
    }
  }, [currentQ, quizQuestions.length, score]);

  const handleCancelTranscription = useCallback(() => {
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
  }, [logId, cleanupAndClose]);

  const handleSkip = useCallback(() => {
    if (phase === 'intro' || phase === 'transcribing') {
      setIsExpanded(false);
      return;
    }
    void cleanupAndClose();
  }, [phase, cleanupAndClose]);

  // Effects
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
    } else if (visible && recordingPath && !groqKey && !hasHuggingFace && !hasLocalWhisper) {
      setIsExpanded(true);
      setErrorMsg(
        'No transcription engine is configured. Add Groq or Hugging Face credentials, or enable Local Transcription in Settings.',
      );
      void updateSessionTranscriptionStatus(logId, 'failed', 'No transcription engine configured');
      setPhase('error');
    }
  }, [
    visible,
    recordingPath,
    groqKey,
    hasHuggingFace,
    hasLocalWhisper,
    canTranscribe,
    logId,
    runTranscription,
  ]);

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

  return {
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
  };
}
