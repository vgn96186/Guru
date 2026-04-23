import { useEffect, useRef, useState, useCallback } from 'react';
import { BackHandler, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { STREAK_MIN_MINUTES } from '../../../constants/gamification';
import { getAllSubjects, getTopicsBySubject } from '../../../db/queries/topics';
import { saveLectureNote } from '../../../db/queries/aiCache';
import { createSession, endSession, updateSessionProgress } from '../../../db/queries/sessions';
import { profileRepository } from '../../../db/repositories';
import { sendImmediateNag } from '../../../services/notificationService';
import { connectToRoom, sendSyncMessage } from '../../../services/deviceSyncService';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN } from '../../../config/appConfig';
import { showInfo, showError, confirmDestructive } from '../../../components/dialogService';
import { useProfileQuery, useRefreshProfile } from '../../../hooks/queries/useProfile';
import { useFaceTracking } from '../../../hooks/useFaceTracking';
import { useAppStateTransition } from '../../../hooks/useAppStateTransition';
import { HomeNav } from '../../../navigation/typedHooks';
import type { Subject, TopicWithProgress } from '../../../types';
import { useLectureAudio } from './useLectureAudio';

const LECTURE_STATE_KEY = 'current_lecture_state';
const PROOF_OF_LIFE_INTERVAL = 15 * 60; // 15 mins
const PROOF_OF_LIFE_GRACE = 60; // 60 secs to respond
const PROOF_OF_LIFE_WARNING = 30; // warn 30s before trigger
const STATE_SAVE_DEBOUNCE = 2000;
const STATE_SAVE_CHECKPOINT = 30;

export function useLectureModeController() {
  const navigation = HomeNav.useNav<'LectureMode'>();
  const route = HomeNav.useRoute<'LectureMode'>();
  const refreshProfile = useRefreshProfile();
  const { data: profile } = useProfileQuery();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(route.params?.subjectId ?? null);

  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [currentNote, setCurrentNote] = useState('');

  const [onBreak, setOnBreak] = useState(false);
  const [breakCountdown, setBreakCountdown] = useState(300);
  const [resumeCountdown, setResumeCountdown] = useState(-1);

  const [proofOfLifeActive, setProofOfLifeActive] = useState(false);
  const [proofOfLifeCountdown, setProofOfLifeCountdown] = useState(0);
  const [proofWarningActive, setProofWarningActive] = useState(false);

  const [partnerDoomscrolling, setPartnerDoomscrolling] = useState(false);
  const [breakTopics, setBreakTopics] = useState<TopicWithProgress[]>([]);

  const partnerDoomscrollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const isHydratedRef = useRef(false);
  const backHandlerRef = useRef<ReturnType<typeof BackHandler.addEventListener> | null>(null);
  const proofOfLifeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');
  const shouldContinueAutoScribeRef = useRef(false);

  const { focusState } = useFaceTracking();

  const handleNoteAdded = useCallback((note: string) => {
    setNotes(n => [...n, note]);
  }, []);

  const handleProofOfLifeDismissed = useCallback(() => {
    setProofOfLifeActive(false);
  }, []);

  const { isRecordingEnabled, setIsRecordingEnabled, isTranscribing, importAndTranscribeAudio } = useLectureAudio({
    selectedSubjectId,
    onBreak,
    elapsed,
    shouldContinueAutoScribe: shouldContinueAutoScribeRef.current,
    onNoteAdded: handleNoteAdded,
    onProofOfLifeDismissed: handleProofOfLifeDismissed
  });

  const buildLectureState = useCallback(() => ({
    elapsed,
    notes,
    currentNote,
    selectedSubjectId,
    sessionId: sessionIdRef.current,
    isRecordingEnabled,
    timestamp: Date.now(),
  }), [elapsed, notes, currentNote, selectedSubjectId, isRecordingEnabled]);

  const persistLectureState = useCallback(async (force = false) => {
    if (!isHydratedRef.current) return;
    const state = buildLectureState();
    const snapshot = JSON.stringify({
      elapsed: state.elapsed,
      notes: state.notes,
      currentNote: state.currentNote,
      selectedSubjectId: state.selectedSubjectId,
      sessionId: state.sessionId,
      isRecordingEnabled: state.isRecordingEnabled,
    });

    if (!force && snapshot === lastSavedSnapshotRef.current) return;
    lastSavedSnapshotRef.current = snapshot;

    try {
      await AsyncStorage.setItem(LECTURE_STATE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[LectureMode] Failed to save state:', err);
    }
  }, [buildLectureState]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LECTURE_STATE_KEY);
        if (saved) {
          try {
            const state = JSON.parse(saved);
            if (Date.now() - state.timestamp < 4 * 60 * 60 * 1000) {
              if (isMounted) {
                setElapsed(state.elapsed);
                setNotes(state.notes);
                setCurrentNote(state.currentNote ?? '');
                setSelectedSubjectId(state.selectedSubjectId);
                sessionIdRef.current = state.sessionId;
                if (state.isRecordingEnabled) setIsRecordingEnabled(true);
                lastSavedSnapshotRef.current = JSON.stringify({
                  elapsed: state.elapsed,
                  notes: state.notes,
                  currentNote: state.currentNote ?? '',
                  selectedSubjectId: state.selectedSubjectId,
                  sessionId: state.sessionId,
                  isRecordingEnabled: !!state.isRecordingEnabled,
                });
              }
            } else {
              await AsyncStorage.removeItem(LECTURE_STATE_KEY);
            }
          } catch (e) {
            console.warn('[LectureMode] State hydration failed:', e);
            await AsyncStorage.removeItem(LECTURE_STATE_KEY);
          }
        }
      } catch (err) {
        console.warn('[LectureMode] Failed to load state:', err);
      } finally {
        if (isMounted) {
          isHydratedRef.current = true;
        }
      }
    })();
    return () => { isMounted = false; };
  }, [setIsRecordingEnabled]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (saveStateTimeoutRef.current) clearTimeout(saveStateTimeoutRef.current);
    saveStateTimeoutRef.current = setTimeout(() => void persistLectureState(), STATE_SAVE_DEBOUNCE);
    return () => {
      if (saveStateTimeoutRef.current) {
        clearTimeout(saveStateTimeoutRef.current);
        saveStateTimeoutRef.current = null;
      }
    };
  }, [notes, currentNote, selectedSubjectId, isRecordingEnabled, persistLectureState]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (elapsed <= 0 || elapsed % STATE_SAVE_CHECKPOINT !== 0) return;
    void persistLectureState();
  }, [elapsed, persistLectureState]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (elapsed > 10 && !sessionIdRef.current) {
      createSession([], null, 'normal')
        .then((id) => { sessionIdRef.current = id; })
        .catch(console.error);
    }
    if (elapsed > 0 && elapsed % 60 === 0 && sessionIdRef.current) {
      const mins = Math.floor(elapsed / 60);
      const totalXp = mins * 15 + notes.length * 50;
      void updateSessionProgress(sessionIdRef.current, mins, totalXp, [], notes.join('\n\n')).catch(console.error);
    }
  }, [elapsed, notes, refreshProfile]);

  useEffect(() => { if (!profile) refreshProfile(); }, [profile, refreshProfile]);

  useEffect(() => {
    shouldContinueAutoScribeRef.current = isRecordingEnabled && !onBreak;
  }, [isRecordingEnabled, onBreak]);

  useEffect(() => {
    void getAllSubjects().then(setSubjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (onBreak && selectedSubjectId) {
      void getTopicsBySubject(selectedSubjectId).then(setBreakTopics).catch(console.error);
    } else {
      setBreakTopics([]);
    }
  }, [onBreak, selectedSubjectId]);

  useEffect(() => {
    if (profile?.syncCode) {
      const unsubscribe = connectToRoom(profile.syncCode, (msg: { type?: string }) => {
        if (msg.type === 'DOOMSCROLL_DETECTED') {
          setPartnerDoomscrolling(true);
          Vibration.vibrate([0, 500, 200, 500, 200, 1000]);
          if (partnerDoomscrollingTimerRef.current) clearTimeout(partnerDoomscrollingTimerRef.current);
          partnerDoomscrollingTimerRef.current = setTimeout(() => {
            setPartnerDoomscrolling(false);
            partnerDoomscrollingTimerRef.current = null;
          }, 10000);
        }
      });
      if (selectedSubjectId) {
        sendSyncMessage({ type: 'LECTURE_STARTED', subjectId: selectedSubjectId });
      }
      return () => {
        sendSyncMessage({ type: 'LECTURE_STOPPED' });
        unsubscribe();
        if (partnerDoomscrollingTimerRef.current) {
          clearTimeout(partnerDoomscrollingTimerRef.current);
          partnerDoomscrollingTimerRef.current = null;
        }
      };
    }
  }, [profile?.syncCode, selectedSubjectId]);

  const hasTriggeredDoomscrollRef = useRef(false);
  useAppStateTransition({
    onActive: () => { hasTriggeredDoomscrollRef.current = false; },
    onBackground: () => {
      if (!onBreak && elapsed > 0) {
        void persistLectureState(true);
        if (!hasTriggeredDoomscrollRef.current) {
          hasTriggeredDoomscrollRef.current = true;
          sendSyncMessage({ type: 'DOOMSCROLL_DETECTED' });
          sendImmediateNag(
            '🚨 DOOMSCROLL DETECTED',
            "You're supposed to be watching a lecture! Put the phone down and look at your tablet!",
          );
          Vibration.vibrate([0, 500, 200, 500]);
        }
      }
    }
  });

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const newE = e + 1;
        if (newE > 0 && newE % PROOF_OF_LIFE_INTERVAL === PROOF_OF_LIFE_INTERVAL - PROOF_OF_LIFE_WARNING && !onBreak) {
          setProofWarningActive(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        if (newE > 0 && newE % PROOF_OF_LIFE_INTERVAL === 0 && !onBreak) {
          setProofWarningActive(false);
          setProofOfLifeActive(true);
          setProofOfLifeCountdown(PROOF_OF_LIFE_GRACE);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Vibration.vibrate([0, 300, 100, 300]);
        }
        return newE;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [onBreak]);

  useEffect(() => {
    if (proofOfLifeActive) {
      proofOfLifeTimerRef.current = setInterval(() => {
        setProofOfLifeCountdown((c) => {
          if (c === 1) {
            sendImmediateNag('🚨 WAKE UP', 'You zoned out! What is the professor saying right now?!');
            Vibration.vibrate(1000);
            return 0;
          }
          if (c <= 0) return 0;
          return c - 1;
        });
      }, 1000);
      return () => {
        if (proofOfLifeTimerRef.current) {
          clearInterval(proofOfLifeTimerRef.current);
          proofOfLifeTimerRef.current = null;
        }
      };
    }
  }, [proofOfLifeActive]);

  const stopLecture = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (proofOfLifeTimerRef.current) clearInterval(proofOfLifeTimerRef.current);
    timerRef.current = null;
    proofOfLifeTimerRef.current = null;

    if (currentNote.trim()) {
      try {
        await saveLectureNote(selectedSubjectId, currentNote.trim());
        setNotes((n) => [...n, currentNote.trim()]);
      } catch (err) {
        console.error('[LectureMode] Failed to save note:', err);
      }
    }

    const mins = Math.floor(elapsed / 60);
    if (mins > 0) {
      const totalXp = mins * 15 + notes.length * 50;
      try {
        if (sessionIdRef.current) {
          await endSession(sessionIdRef.current, [], totalXp, mins, notes.join('\n\n'));
        } else {
          const sessionId = await createSession([], null, 'normal');
          await endSession(sessionId, [], totalXp, mins, notes.join('\n\n'));
        }
        await profileRepository.updateStreak(mins >= STREAK_MIN_MINUTES);
        await refreshProfile();
      } catch (err) {
        console.error('[LectureMode] Failed to finalize session:', err);
      }
    }

    try {
      await AsyncStorage.removeItem(LECTURE_STATE_KEY);
      lastSavedSnapshotRef.current = '';
    } catch (err) {
      console.warn('[LectureMode] Failed to clear state:', err);
    }
    navigation.goBack();
  }, [elapsed, notes, currentNote, selectedSubjectId, navigation, refreshProfile]);

  useEffect(() => {
    return () => {
      if (saveStateTimeoutRef.current) clearTimeout(saveStateTimeoutRef.current);
    };
  }, []);

  function startBreak() {
    setOnBreak(true);
    const breakSecs = (profile?.breakDurationMinutes ?? 5) * 60;
    setBreakCountdown(breakSecs);
    sendSyncMessage({ type: 'BREAK_STARTED', durationSeconds: breakSecs });
    setProofOfLifeActive(false);
  }

  function handleBreakDone() {
    setResumeCountdown(3);
  }

  async function saveNote() {
    if (!currentNote.trim()) return;
    try {
      await saveLectureNote(selectedSubjectId, currentNote.trim());
      setNotes((n) => [...n, currentNote.trim()]);
      setCurrentNote('');
      if (proofOfLifeActive) {
        setProofOfLifeActive(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error('[LectureMode] Failed to save note:', err);
      showError('Failed to save note. Please try again.');
    }
  }

  function toggleAutoScribe() {
    const groqKey = profile?.groqApiKey?.trim() || BUNDLED_GROQ_KEY;
    const huggingFaceToken = profile?.huggingFaceToken?.trim() || BUNDLED_HF_TOKEN;
    const hasLocalWhisper = !!(profile?.useLocalWhisper && profile?.localWhisperPath);
    if (!isRecordingEnabled && !groqKey && !huggingFaceToken && !hasLocalWhisper) {
      showInfo(
        'Transcription Required',
        'Add Groq or Hugging Face credentials, or enable Local Whisper in Settings to use Auto-Scribe.'
      );
      return;
    }
    setIsRecordingEnabled(!isRecordingEnabled);
  }

  async function confirmStopLecture() {
    const ok = await confirmDestructive(
      'Stop lecture?',
      'Are you actually done, or just avoiding it?',
      { confirmLabel: 'Stop', cancelLabel: 'Keep watching' }
    );
    if (ok) stopLecture();
  }

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      (async () => {
        const ok = await confirmDestructive(
          'Ready to wrap up?',
          'You can always come back and continue later.',
          { confirmLabel: 'Finish', cancelLabel: 'Keep watching' }
        );
        if (ok) stopLecture();
      })();
      return true;
    });
    backHandlerRef.current = handler;
    return () => handler.remove();
  }, [stopLecture]);

  useEffect(() => {
    if (onBreak && breakCountdown > 0) {
      const t = setInterval(() => setBreakCountdown((c) => c - 1), 1000);
      return () => clearInterval(t);
    } else if (onBreak && breakCountdown <= 0) {
      handleBreakDone();
    }
  }, [onBreak, breakCountdown]);

  useEffect(() => {
    if (resumeCountdown > 0) {
      const t = setInterval(() => setResumeCountdown((c) => c - 1), 1000);
      return () => clearInterval(t);
    } else if (resumeCountdown === 0) {
      setResumeCountdown(-1);
      setOnBreak(false);
      sendSyncMessage({ type: 'LECTURE_RESUMED' });
    }
  }, [resumeCountdown]);

  return {
    state: {
      profile,
      subjects,
      selectedSubjectId,
      elapsed,
      notes,
      currentNote,
      onBreak,
      breakCountdown,
      resumeCountdown,
      proofOfLifeActive,
      proofOfLifeCountdown,
      proofWarningActive,
      partnerDoomscrolling,
      breakTopics,
      isRecordingEnabled,
      isTranscribing,
      focusState
    },
    actions: {
      setSelectedSubjectId,
      setCurrentNote,
      startBreak,
      handleBreakDone,
      saveNote,
      toggleAutoScribe,
      importAndTranscribeAudio,
      confirmStopLecture,
      setResumeCountdown
    }
  };
}
