import LinearSurface from '../components/primitives/LinearSurface';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  BackHandler,
  Vibration,
  Animated,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAudio, isMeaningfulLectureAnalysis } from '../services/transcriptionService';
import { moveFileToRecovery } from '../services/transcriptStorage';
import { enqueueRequest } from '../services/offlineQueue';
import { saveLectureChunk } from '../services/lecture/persistence';
import { generateADHDNote } from '../services/transcription/noteGeneration';
import type { LectureAnalysis } from '../services/transcriptionService';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { STREAK_MIN_MINUTES } from '../constants/gamification';
import { getAllSubjects, getTopicsBySubject } from '../db/queries/topics';
import { saveLectureNote } from '../db/queries/aiCache';
import { createSession, endSession, updateSessionProgress } from '../db/queries/sessions';
import { profileRepository } from '../db/repositories';
import { linearTheme as n } from '../theme/linearTheme';
import { useAppStore } from '../store/useAppStore';
import { sendImmediateNag } from '../services/notificationService';
import { connectToRoom, sendSyncMessage } from '../services/deviceSyncService';
import BreakScreen from './BreakScreen';
import FocusAudioPlayer from '../components/FocusAudioPlayer';
import { useFaceTracking } from '../hooks/useFaceTracking';
import { useAppStateTransition } from '../hooks/useAppStateTransition';
import type { Subject, TopicWithProgress } from '../types';
import { getDb } from '../db/database';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN } from '../config/appConfig';
import { showInfo, showSuccess, showError, confirmDestructive } from '../components/dialogService';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'LectureMode'>;
type Route = RouteProp<HomeStackParamList, 'LectureMode'>;
const LECTURE_STATE_KEY = 'current_lecture_state';

const PROOF_OF_LIFE_INTERVAL = 15 * 60; // 15 mins
const PROOF_OF_LIFE_GRACE = 60; // 60 secs to respond
const PROOF_OF_LIFE_WARNING = 30; // warn 30s before trigger
const AUTO_SCRIBE_CHUNK_MS = 3 * 60 * 1000;
const STATE_SAVE_DEBOUNCE = 2000;
const STATE_SAVE_CHECKPOINT = 30;

export default function LectureModeScreen() {
  useKeepAwake(); // Keep phone screen on like a dashboard

  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const profile = useAppStore((s) => s.profile);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    route.params?.subjectId ?? null,
  );

  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [currentNote, setCurrentNote] = useState('');

  const [onBreak, setOnBreak] = useState(false);
  const [breakCountdown, setBreakCountdown] = useState(300);
  const [resumeCountdown, setResumeCountdown] = useState(-1);

  const [proofOfLifeActive, setProofOfLifeActive] = useState(false);
  const [proofOfLifeCountdown, setProofOfLifeCountdown] = useState(0);
  const [proofWarningActive, setProofWarningActive] = useState(false);

  // Animation for proof of life warning
  const proofPulseAnim = useRef(new Animated.Value(1)).current;
  const proofGlowAnim = useRef(new Animated.Value(0)).current;

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingRetryCount, setRecordingRetryCount] = useState(0);
  const shouldContinueAutoScribeRef = useRef(false);
  const previousRecordingEnabledRef = useRef(false);

  const [partnerDoomscrolling, setPartnerDoomscrolling] = useState(false);
  const partnerDoomscrollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const isHydratedRef = useRef(false);
  const backHandlerRef = useRef<ReturnType<typeof BackHandler.addEventListener> | null>(null);
  const proofOfLifeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const saveStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');
  const elapsedRef = useRef(elapsed);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  const { focusState } = useFaceTracking();

  const buildLectureState = useCallback(
    () => ({
      elapsed,
      notes,
      currentNote,
      selectedSubjectId,
      sessionId: sessionIdRef.current,
      isRecordingEnabled,
      timestamp: Date.now(),
    }),
    [elapsed, notes, currentNote, selectedSubjectId, isRecordingEnabled],
  );

  const persistLectureState = useCallback(
    async (force = false) => {
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
    },
    [buildLectureState],
  );

  // ── Hydration & Persistence ──────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LECTURE_STATE_KEY);
        if (saved) {
          try {
            const state = JSON.parse(saved);
            // Only hydrate if the state is less than 4 hours old
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

    return () => {
      isMounted = false;
    };
  }, []);

  // Persist semantic state changes with a short debounce.
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (saveStateTimeoutRef.current) {
      clearTimeout(saveStateTimeoutRef.current);
    }
    saveStateTimeoutRef.current = setTimeout(() => {
      void persistLectureState();
    }, STATE_SAVE_DEBOUNCE);

    return () => {
      if (saveStateTimeoutRef.current) {
        clearTimeout(saveStateTimeoutRef.current);
        saveStateTimeoutRef.current = null;
      }
    };
  }, [notes, currentNote, selectedSubjectId, isRecordingEnabled, persistLectureState]);

  // Persist periodic recovery checkpoints without writing every timer tick.
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (elapsed <= 0 || elapsed % STATE_SAVE_CHECKPOINT !== 0) return;
    void persistLectureState();
  }, [elapsed, persistLectureState]);

  // ── Session Management ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isHydratedRef.current) return;

    // Create session early (after 10s of activity)
    if (elapsed > 10 && !sessionIdRef.current) {
      createSession([], null, 'normal')
        .then((id) => {
          sessionIdRef.current = id;
        })
        .catch((err) => {
          console.error('[LectureMode] Failed to create session:', err);
        });
    }

    // Periodic progress updates (every 60s) to survive app kills
    if (elapsed > 0 && elapsed % 60 === 0 && sessionIdRef.current) {
      const mins = Math.floor(elapsed / 60);
      const noteBonus = notes.length * 50;
      const totalXp = mins * 15 + noteBonus;
      void updateSessionProgress(sessionIdRef.current, mins, totalXp, [], notes.join('\n\n')).catch(
        (err) => {
          console.error('[LectureMode] Failed to update session progress:', err);
        },
      );
    }
  }, [elapsed, notes, refreshProfile]);

  // ── Lifecycle & Data ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) refreshProfile();
  }, [profile, refreshProfile]);

  useEffect(() => {
    shouldContinueAutoScribeRef.current = isRecordingEnabled && !onBreak;
  }, [isRecordingEnabled, onBreak]);

  useEffect(() => {
    void getAllSubjects()
      .then(setSubjects)
      .catch((err) => {
        console.error('[LectureMode] Failed to load subjects:', err);
      });
  }, []);

  const [breakTopics, setBreakTopics] = useState<TopicWithProgress[]>([]);
  useEffect(() => {
    if (onBreak && selectedSubjectId) {
      void getTopicsBySubject(selectedSubjectId)
        .then(setBreakTopics)
        .catch((err) => {
          console.error('[LectureMode] Failed to load break topics:', err);
        });
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
          if (partnerDoomscrollingTimerRef.current)
            clearTimeout(partnerDoomscrollingTimerRef.current);
          partnerDoomscrollingTimerRef.current = setTimeout(() => {
            setPartnerDoomscrolling(false);
            partnerDoomscrollingTimerRef.current = null;
          }, 10000);
        }
      });

      // Tell phone we started
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

  // Handle App sending to background (doomscrolling attempt)
  const hasTriggeredDoomscrollRef = useRef(false);

  useAppStateTransition({
    onActive: () => {
      hasTriggeredDoomscrollRef.current = false;
    },
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
    },
  });

  // Main Timer loop
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const newE = e + 1;
        // Warn 30s before proof of life trigger
        if (
          newE > 0 &&
          newE % PROOF_OF_LIFE_INTERVAL === PROOF_OF_LIFE_INTERVAL - PROOF_OF_LIFE_WARNING &&
          !onBreak
        ) {
          setProofWarningActive(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        // Trigger Proof of Life every 15 mins
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

  // Proof of Life Countdown - with proper cleanup and animations
  useEffect(() => {
    if (proofOfLifeActive) {
      proofOfLifeTimerRef.current = setInterval(() => {
        setProofOfLifeCountdown((c) => {
          if (c === 1) {
            // FAILED PROOF OF LIFE
            sendImmediateNag(
              '🚨 WAKE UP',
              'You zoned out! What is the professor saying right now?!',
            );
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

  // Animations for proof of life warning
  useEffect(() => {
    if (proofOfLifeActive) {
      // Pulsing glow effect
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(proofGlowAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(proofGlowAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
        ]),
      );
      glowLoop.start();

      // Pulse the entire warning
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(proofPulseAnim, { toValue: 1.02, duration: 800, useNativeDriver: true }),
          Animated.timing(proofPulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulseLoop.start();

      return () => {
        glowLoop.stop();
        pulseLoop.stop();
      };
    }
  }, [proofOfLifeActive, proofGlowAnim, proofPulseAnim]);

  const stopLecture = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (proofOfLifeTimerRef.current) {
      clearInterval(proofOfLifeTimerRef.current);
      proofOfLifeTimerRef.current = null;
    }

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
      const noteBonus = notes.length * 50;
      const totalXp = mins * 15 + noteBonus;

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
      if (saveStateTimeoutRef.current) {
        clearTimeout(saveStateTimeoutRef.current);
        saveStateTimeoutRef.current = null;
      }
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
    setResumeCountdown(3); // 3s auto-start
  }

  async function saveNote() {
    if (!currentNote.trim()) return;

    try {
      await saveLectureNote(selectedSubjectId, currentNote.trim());
      setNotes((n) => [...n, currentNote.trim()]);
      setCurrentNote('');

      // Clear proof of life
      if (proofOfLifeActive) {
        setProofOfLifeActive(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error('[LectureMode] Failed to save note:', err);
      showError('Failed to save note. Please try again.');
    }
  }

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          showInfo('Microphone Access', 'Need microphone to auto-transcribe lectures.');
        } else {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            staysActiveInBackground: true,
          });
        }
      } catch (err) {
        console.error('[LectureMode] Audio permission request failed:', err);
      }
    })();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {
          if (__DEV__) console.warn('[LectureMode] Could not stop previous recording:', e);
        }
        recordingRef.current = null;
        setRecording(null);
      }

      const recordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      };

      const { recording: newRec } = await Audio.Recording.createAsync(recordingOptions);
      recordingRef.current = newRec;
      setRecording(newRec);
      recordingStartTimeRef.current = Date.now();
      if (__DEV__) console.log('[LectureMode] Fresh recording started:', newRec.getURI());
    } catch (err) {
      if (__DEV__) console.error('[LectureMode] Failed to start recording:', err);
      showError('Could not start microphone. Check permissions.');
    }
  }, []);

  const processRecording = useCallback(async () => {
    const currentRec = recordingRef.current;
    if (!currentRec) {
      if (__DEV__) console.log('[LectureMode] No recording instance to process');
      return;
    }
    setIsTranscribing(true);

    try {
      const status = await currentRec.getStatusAsync();
      if (!status.canRecord) {
        if (__DEV__) console.warn('[LectureMode] Recording instance is not active');
      }

      await currentRec.stopAndUnloadAsync();
      const uri = currentRec.getURI();
      const recordingDuration = (Date.now() - recordingStartTimeRef.current) / 1000;

      if (__DEV__) {
        console.log('[LectureMode] Recording stopped. URI:', uri, 'Duration:', recordingDuration);
      }

      recordingRef.current = null;
      setRecording(null);

      if (uri) {
        try {
          const startTime = Date.now();
          const analysis = await transcribeAudio({ audioFilePath: uri });
          const transcriptionTime = Date.now() - startTime;

          if (!isMeaningfulLectureAnalysis(analysis)) {
            throw new Error('No usable lecture content was detected in this recording.');
          }

          // Build note text (ADHD-style if possible, fallback to formatted note)
          const conceptsText =
            analysis.keyConcepts.length > 0
              ? '\n\n💡 **Key Concepts**\n' +
                analysis.keyConcepts.map((c: string) => `• ${c}`).join('\n')
              : '';
          const hyText =
            analysis.highYieldPoints.length > 0
              ? '\n\n🚀 **High-Yield**\n' +
                analysis.highYieldPoints.map((p: string) => `• ${p}`).join('\n')
              : '';
          const quickNote = `🎯 **Subject**: ${analysis.subject}\n📌 **Topics**: ${analysis.topics.join(', ')}\n\n📝 **Summary**: ${analysis.lectureSummary}${conceptsText}${hyText}`;

          // Use shared pipeline — same 5-level matching + XP as Pipeline A
          const result = await saveLectureChunk({
            analysis,
            subjectId: selectedSubjectId,
            appName: 'LectureMode',
            durationMinutes: Math.round(recordingDuration / 60),
            quickNote,
            embedding: analysis.embedding,
            recordingPath: uri, // Keep recording file (not deleted)
          });

          // Enhance note in background with ADHD-style formatting
          void enhanceNoteInBackground(result.noteId);

          setNotes((n) => [...n, quickNote]);
          setProofOfLifeActive(false);

          if (__DEV__) {
            console.log(
              `[LectureMode] Chunk saved: ${result.topicsMatched} topics matched, ${result.xpAwarded} XP awarded`,
            );
          }
        } catch (err) {
          console.warn('[LectureMode] Chunk processing failed, moving to recovery:', err);
          const recoveryUri = await moveFileToRecovery(uri);

          await enqueueRequest('transcribe', {
            audioFilePath: recoveryUri,
            appName: 'LectureMode',
            durationMinutes: 3,
            recordingPath: recoveryUri,
            retryCount: recordingRetryCount + 1,
            error: err instanceof Error ? err.message : String(err),
          });

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } catch (err) {
      if (__DEV__) console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
      setRecordingRetryCount(0);
      if (shouldContinueAutoScribeRef.current && elapsedRef.current > 0) {
        void startRecording();
      }
    }
    // `saveLectureChunk` and `enhanceNoteInBackground` are stable; keeping them
    // out of deps avoids declaration-order cycles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingRetryCount, startRecording]);

  useEffect(() => {
    if (!isRecordingEnabled || onBreak || isTranscribing) return;

    if (!recording && !recordingRef.current) {
      void startRecording();
      return;
    }

    if (!recording) return;

    const elapsedMs = Math.max(0, Date.now() - recordingStartTimeRef.current);
    const remainingMs = Math.max(1000, AUTO_SCRIBE_CHUNK_MS - elapsedMs);
    const timeout = setTimeout(() => {
      void processRecording();
    }, remainingMs);

    return () => clearTimeout(timeout);
  }, [isRecordingEnabled, onBreak, isTranscribing, recording, processRecording, startRecording]);

  useEffect(() => {
    const wasEnabled = previousRecordingEnabledRef.current;
    previousRecordingEnabledRef.current = isRecordingEnabled;

    if (wasEnabled && !isRecordingEnabled && recordingRef.current && !isTranscribing) {
      void processRecording();
    }
  }, [isRecordingEnabled, isTranscribing, processRecording]);

  useEffect(() => {
    if (!onBreak || !recordingRef.current || isTranscribing) return;
    void processRecording();
  }, [onBreak, isTranscribing, processRecording]);

  /**
   * Background note enhancement — generates ADHD-style formatted study note
   * and updates the lecture_notes table with the enhanced version.
   */
  async function enhanceNoteInBackground(noteId: number) {
    try {
      const db = getDb();
      const note = await db.getFirstAsync<{
        id: number;
        summary: string | null;
        topics_json: string | null;
        note: string;
      }>('SELECT id, summary, topics_json, note FROM lecture_notes WHERE id = ?', [noteId]);

      if (!note) return;

      const analysis: LectureAnalysis = {
        lectureSummary: note.summary || '',
        topics: note.topics_json ? JSON.parse(note.topics_json) : [],
        keyConcepts: [],
        highYieldPoints: [],
        subject: '',
        estimatedConfidence: 1,
      };

      const enhancedNote = await generateADHDNote(analysis);
      if (enhancedNote) {
        await db.runAsync('UPDATE lecture_notes SET note = ? WHERE id = ?', [enhancedNote, noteId]);
      }
    } catch (err) {
      console.warn('[LectureMode] Background note enhancement failed:', err);
    }
  }

  async function importAndTranscribeAudio() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      const pickedUri = picked.assets[0].uri;
      const tempUri = `${FileSystem.cacheDirectory}lecture-import-${Date.now()}.m4a`;
      await FileSystem.copyAsync({ from: pickedUri, to: tempUri });

      setIsTranscribing(true);
      const analysis = await transcribeAudio({ audioFilePath: tempUri });

      if (!isMeaningfulLectureAnalysis(analysis)) {
        throw new Error('No usable lecture content was detected.');
      }

      const conceptsText =
        analysis.keyConcepts.length > 0
          ? '\n\n💡 **Key Concepts**\n' +
            analysis.keyConcepts.map((c: string) => `• ${c}`).join('\n')
          : '';
      const hyText =
        analysis.highYieldPoints.length > 0
          ? '\n\n🚀 **High-Yield**\n' +
            analysis.highYieldPoints.map((p: string) => `• ${p}`).join('\n')
          : '';
      const quickNote = `🎯 **Subject**: ${analysis.subject}\n📌 **Topics**: ${analysis.topics.join(', ')}\n\n📝 **Summary**: ${analysis.lectureSummary}${conceptsText}${hyText}`;

      const result = await saveLectureChunk({
        analysis,
        subjectId: selectedSubjectId,
        appName: 'Imported',
        durationMinutes: 0,
        quickNote,
        embedding: analysis.embedding,
      });

      void enhanceNoteInBackground(result.noteId);

      setNotes((n) => [...n, quickNote]);
      showSuccess('Transcription Complete', analysis.lectureSummary || 'Done');
    } catch (err) {
      showError(err, 'Failed to transcribe imported audio.');
      if (__DEV__) console.error('Import transcription failed:', err);
    } finally {
      setIsTranscribing(false);
    }
  }

  function toggleAutoScribe() {
    const groqKey = profile?.groqApiKey?.trim() || BUNDLED_GROQ_KEY;
    const huggingFaceToken = profile?.huggingFaceToken?.trim() || BUNDLED_HF_TOKEN;
    const hasLocalWhisper = !!(profile?.useLocalWhisper && profile?.localWhisperPath);
    if (!isRecordingEnabled && !groqKey && !huggingFaceToken && !hasLocalWhisper) {
      showInfo(
        'Transcription Required',
        'Add Groq or Hugging Face credentials, or enable Local Whisper in Settings to use Auto-Scribe.',
      );
      return;
    }
    setIsRecordingEnabled(!isRecordingEnabled);
  }

  async function confirmStopLecture() {
    const ok = await confirmDestructive(
      'Stop lecture?',
      'Are you actually done, or just avoiding it?',
      {
        confirmLabel: 'Stop',
        cancelLabel: 'Keep watching',
      },
    );
    if (ok) {
      stopLecture();
    }
  }

  // Block Back Button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      (async () => {
        const ok = await confirmDestructive(
          'Ready to wrap up?',
          'You can always come back and continue later.',
          {
            confirmLabel: 'Finish',
            cancelLabel: 'Keep watching',
          },
        );
        if (ok) {
          stopLecture();
        }
      })();
      return true;
    });
    backHandlerRef.current = handler;
    return () => handler.remove();
  }, [stopLecture]);

  // Break countdown logic
  useEffect(() => {
    if (onBreak && breakCountdown > 0) {
      const t = setInterval(() => setBreakCountdown((c) => c - 1), 1000);
      return () => clearInterval(t);
    } else if (onBreak && breakCountdown <= 0) {
      handleBreakDone();
    }
  }, [onBreak, breakCountdown]);

  // Resume logic
  useEffect(() => {
    if (resumeCountdown > 0) {
      const t = setInterval(() => setResumeCountdown((c) => c - 1), 1000);
      return () => clearInterval(t);
    } else if (resumeCountdown === 0) {
      setResumeCountdown(-1);
      setOnBreak(false);
      sendSyncMessage({ type: 'LECTURE_RESUMED' });
      // Main timer resumes automatically via the [onBreak] dependency above
    }
  }, [resumeCountdown]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  if (onBreak) {
    const topics = breakTopics;
    const randomTopicId =
      topics.length > 0 ? topics[Math.floor(Math.random() * topics.length)].id : undefined;

    if (resumeCountdown >= 0) {
      return (
        <SafeAreaView style={styles.safe}>
          <ResponsiveContainer style={styles.resumeContainer}>
            <LinearText style={styles.resumeTitle}>Ready to resume?</LinearText>
            <LinearText style={styles.resumeTimer}>{resumeCountdown}</LinearText>
            <TouchableOpacity style={styles.resumeBtn} onPress={() => setResumeCountdown(0)}>
              <LinearText style={styles.resumeBtnText}>Resume Now</LinearText>
            </TouchableOpacity>
          </ResponsiveContainer>
        </SafeAreaView>
      );
    }

    return (
      <BreakScreen
        countdown={breakCountdown}
        totalSeconds={(profile?.breakDurationMinutes ?? 5) * 60}
        topicId={randomTopicId}
        onDone={handleBreakDone}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, proofOfLifeActive && styles.safeWarn]}
      testID="lecture-mode-screen"
    >
      {partnerDoomscrolling && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: n.colors.error,
            zIndex: 999,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 40,
          }}
        >
          <LinearText style={{ fontSize: 80, marginBottom: 20 }}>📱❌</LinearText>
          <LinearText
            style={{
              color: n.colors.textPrimary,
              fontSize: 32,
              fontWeight: '900',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}
          >
            PUT YOUR PHONE DOWN.
          </LinearText>
          <LinearText
            style={{
              color: n.colors.textPrimary,
              fontSize: 20,
              textAlign: 'center',
              marginTop: 20,
            }}
          >
            You are doomscrolling instead of watching this lecture!
          </LinearText>
        </View>
      )}
      <StatusBar
        barStyle="light-content"
        backgroundColor={proofOfLifeActive ? n.colors.errorSurface : n.colors.background}
      />
      <ResponsiveContainer>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={confirmStopLecture}
            style={styles.backBtn}
            testID="lecture-end-btn"
          >
            <LinearText style={styles.backText}>← End</LinearText>
          </TouchableOpacity>
          <LinearText style={styles.headerTitle}>📺 Hostage Mode</LinearText>
          <FocusAudioPlayer />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {focusState !== 'focused' && !onBreak && (
            <LinearSurface
              padded={false}
              style={[styles.hostageInfo, { borderColor: n.colors.error }]}
            >
              <LinearText style={styles.hostageEmoji}>👀</LinearText>
              <LinearText style={[styles.hostageText, { color: n.colors.error }]}>
                Face not detected or distracted! Look at your study materials!
              </LinearText>
            </LinearSurface>
          )}

          {/* Hostage Instructions */}
          {!proofOfLifeActive && elapsed < 60 && (
            <LinearSurface padded={false} style={styles.hostageInfo}>
              <LinearText style={styles.hostageEmoji}>📱❌</LinearText>
              <LinearText style={styles.hostageText}>
                Put this phone face up on your desk. Watch the lecture on your tablet. If you close
                this app to doomscroll, your phone will scream at you.
              </LinearText>
            </LinearSurface>
          )}

          {/* Timer */}
          <LinearSurface
            style={[styles.timerBox, proofOfLifeActive && styles.timerBoxWarn]}
            testID="lecture-timer"
          >
            <LinearText style={styles.timerLabel}>Lecture Time</LinearText>
            <LinearText
              style={[styles.timer, proofOfLifeActive && styles.timerWarn]}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
            >
              {mins}:{secs.toString().padStart(2, '0')}
            </LinearText>
          </LinearSurface>

          {/* Pre-warning 30s before proof of life */}
          {proofWarningActive && !proofOfLifeActive && (
            <LinearSurface padded={false} style={styles.proofWarnBanner}>
              <LinearText style={styles.proofWarnText}>
                ⚠️ Listening check in 30s — get ready to type!
              </LinearText>
            </LinearSurface>
          )}

          {/* Proof of Life Challenge - Enhanced with animation */}
          {proofOfLifeActive && (
            <Animated.View
              style={[
                styles.proofOfLifeBox,
                proofOfLifeActive && styles.proofOfLifeBoxActive,
                {
                  transform: [{ scale: proofPulseAnim }],
                  shadowOpacity: 0.4,
                },
              ]}
            >
              <View style={styles.proofIconContainer}>
                <LinearText style={styles.proofEmoji}>🚨</LinearText>
                <Animated.View
                  style={[
                    styles.proofPulseRing,
                    {
                      opacity: proofGlowAnim,
                      transform: [
                        {
                          scale: proofGlowAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.3],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </View>

              <LinearText style={styles.proofTitle}>ACTIVE LISTENING CHECK</LinearText>
              <LinearText style={styles.proofSub}>
                You have {proofOfLifeCountdown}s to type one thing the professor just said.
              </LinearText>

              <View style={styles.proofTimerContainer}>
                <View style={styles.proofTimerCircle}>
                  <LinearText
                    style={[
                      styles.proofTimerText,
                      proofOfLifeCountdown <= 10 && styles.proofTimerTextUrgent,
                    ]}
                  >
                    {proofOfLifeCountdown}
                  </LinearText>
                </View>
                <LinearText style={styles.proofTimerLabel}>seconds remaining</LinearText>
              </View>

              <LinearText style={styles.proofWarning}>
                Are you zoning out? Type a note above to dismiss this alert.
              </LinearText>
            </Animated.View>
          )}

          {/* Subject selector */}
          {!selectedSubjectId ? (
            <View style={styles.subjectSection}>
              <LinearText style={styles.sectionLabel}>What subject are you watching?</LinearText>
              <View style={styles.subjectGrid}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.subjectChip, { borderColor: s.colorHex }]}
                    onPress={() => setSelectedSubjectId(s.id)}
                    activeOpacity={0.8}
                  >
                    <LinearText style={[styles.subjectChipText, { color: s.colorHex }]}>
                      {s.shortCode}
                    </LinearText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <LinearSurface padded={false} style={styles.selectedSubject}>
              <LinearText style={styles.selectedSubjectText}>
                {subjects.find((s) => s.id === selectedSubjectId)?.name}
              </LinearText>
              <TouchableOpacity onPress={() => setSelectedSubjectId(null)}>
                <LinearText style={styles.changeBtn}>Change</LinearText>
              </TouchableOpacity>
            </LinearSurface>
          )}

          {/* Note input */}

          <TouchableOpacity
            style={[styles.transcribeBtn, isRecordingEnabled && styles.transcribeBtnActive]}
            onPress={toggleAutoScribe}
            activeOpacity={0.8}
            testID="auto-scribe-btn"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isRecordingEnabled && <View style={styles.recordingDot} />}
              <LinearText style={styles.transcribeBtnText}>
                {isRecordingEnabled ? 'AUTO-SCRIBE ACTIVE — Recording' : '🎙️ Enable Auto-Scribe'}
              </LinearText>
            </View>
            {isTranscribing && (
              <LinearText style={{ color: n.colors.textInverse, fontSize: 11 }}>
                Processing chunk...
              </LinearText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.transcribeBtn, styles.importTranscribeBtn]}
            onPress={importAndTranscribeAudio}
            activeOpacity={0.8}
            testID="import-transcribe-btn"
          >
            <LinearText style={styles.transcribeBtnText}>📁 Import Audio & Transcribe</LinearText>
          </TouchableOpacity>

          <View style={styles.noteSection}>
            <TextInput
              style={[
                styles.noteInput,
                proofOfLifeActive && styles.noteInputWarn,
                currentNote.trim() && proofOfLifeActive && styles.noteInputActive,
              ]}
              placeholder={
                proofOfLifeActive
                  ? 'Type here immediately to dismiss alarm...'
                  : "Type a key concept to prove you're listening..."
              }
              placeholderTextColor={proofOfLifeActive ? n.colors.error + 'AA' : n.colors.textMuted}
              multiline
              value={currentNote}
              onChangeText={setCurrentNote}
              testID="lecture-note-input"
            />
            <TouchableOpacity
              style={[
                styles.saveBtn,
                !currentNote.trim() && styles.saveBtnDisabled,
                proofOfLifeActive && styles.saveBtnWarn,
              ]}
              onPress={saveNote}
              activeOpacity={0.8}
              testID="save-note-btn"
            >
              <LinearText style={styles.saveBtnText}>
                {proofOfLifeActive ? 'CONFIRM LISTENING' : 'Save Note'}
              </LinearText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.breakTriggerBtn} onPress={startBreak}>
              <LinearText style={styles.breakTriggerText}>☕ Take 5m Break</LinearText>
            </TouchableOpacity>
          </View>

          {/* Saved notes */}
          {notes.length > 0 && (
            <View style={styles.savedNotes}>
              <LinearText style={styles.sectionLabel}>Proof of Focus ({notes.length})</LinearText>
              {notes.map((n, i) => (
                <View key={i} style={styles.noteRow}>
                  <LinearText style={styles.noteDot}>·</LinearText>
                  <LinearText style={styles.noteText}>{n}</LinearText>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  safeWarn: { backgroundColor: n.colors.errorSurface },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: n.spacing.lg,
    paddingTop: 20,
  },
  backBtn: { padding: 4 },
  backText: { color: n.colors.error, fontSize: 16, fontWeight: '700' },
  headerTitle: {
    color: n.colors.textPrimary,
    fontWeight: '900',
    fontSize: 17,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  placeholder: { width: 60 },
  scroll: { flex: 1 },
  content: { padding: n.spacing.lg, paddingBottom: 60 },

  hostageInfo: {
    padding: n.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostageEmoji: { fontSize: 28, marginRight: 12 },
  hostageText: { color: n.colors.textSecondary, flex: 1, fontSize: 13, lineHeight: 18 },

  timerBox: {
    alignItems: 'center',
    borderRadius: 20,
    padding: n.spacing.xl,
    marginBottom: n.spacing.xl,
  },
  timerBoxWarn: {
    borderWidth: 2,
    borderColor: n.colors.error,
  },
  timerLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timer: {
    color: n.colors.textPrimary,
    fontWeight: '900',
    fontSize: 52,
    fontVariant: ['tabular-nums'],
  },
  timerWarn: { color: n.colors.error },

  proofOfLifeBox: {
    backgroundColor: n.colors.errorSurface,
    borderRadius: 20,
    padding: n.spacing.xl,
    marginBottom: n.spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: n.colors.error,
    position: 'relative',
    overflow: 'hidden',
  },
  proofOfLifeBoxActive: {
    // Additional glow effect via shadow
  },
  proofIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${n.colors.error}22`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: n.spacing.lg,
    position: 'relative',
  },
  proofPulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(244, 67, 54, 0.4)',
  },
  proofEmoji: {
    fontSize: 32,
    zIndex: 1,
  },
  proofTitle: {
    color: n.colors.error,
    fontWeight: '900',
    fontSize: 20,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 1,
  },
  proofSub: {
    color: n.colors.warning,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  proofTimerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  proofTimerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: n.colors.errorSurface,
    borderWidth: 3,
    borderColor: n.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  proofTimerText: {
    color: n.colors.textPrimary,
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  proofTimerTextUrgent: {
    color: n.colors.error,
  },
  proofTimerLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  proofWarning: {
    color: n.colors.textPrimary,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
    maxWidth: '90%',
  },

  subjectSection: { marginBottom: 20 },
  sectionLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: n.colors.card,
  },
  subjectChipText: { fontWeight: '700', fontSize: 13, lineHeight: 18 },
  selectedSubject: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: n.spacing.lg,
    padding: n.spacing.lg,
    borderRadius: 12,
  },
  selectedSubjectText: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  changeBtn: { color: n.colors.accent, fontSize: 14, fontWeight: '700' },

  transcribeBtn: {
    backgroundColor: n.colors.card,
    padding: n.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 12,
    alignItems: 'center',
  },
  transcribeBtnActive: {
    backgroundColor: n.colors.errorSurface,
    borderColor: n.colors.error,
  },
  transcribeBtnText: { color: n.colors.accent, fontWeight: '800', fontSize: 14 },
  importTranscribeBtn: { marginTop: -4 },

  noteSection: { marginBottom: 20 },
  noteInput: {
    borderRadius: 12,
    padding: n.spacing.lg,
    color: n.colors.textPrimary,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.card,
    marginBottom: 12,
  },
  noteInputWarn: {
    backgroundColor: n.colors.errorSurface,
    borderColor: n.colors.error,
    borderWidth: 2,
  },
  noteInputActive: {
    borderColor: n.colors.success,
    borderWidth: 2,
  },
  saveBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 12,
    padding: n.spacing.lg,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: n.colors.border },
  saveBtnWarn: { backgroundColor: n.colors.error },
  saveBtnText: {
    color: n.colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  breakTriggerBtn: { padding: n.spacing.lg, alignItems: 'center', marginTop: 8 },
  breakTriggerText: { color: n.colors.textSecondary, fontWeight: '700', fontSize: 14 },

  savedNotes: { marginTop: 8 },
  noteRow: {
    flexDirection: 'row',
    marginBottom: 8,
    backgroundColor: n.colors.card,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  noteDot: {
    color: n.colors.accent,
    fontSize: 20,
    marginRight: 8,
    lineHeight: 22,
    fontWeight: '900',
  },
  noteText: { color: n.colors.textPrimary, fontSize: 14, flex: 1, lineHeight: 22 },

  resumeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: n.colors.background,
  },
  resumeTitle: {
    color: n.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: n.spacing.lg,
  },
  resumeTimer: { color: n.colors.accent, fontSize: 80, fontWeight: '900', marginBottom: 40 },
  resumeBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: n.spacing.lg,
  },
  resumeBtnText: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 18 },
  proofWarnBanner: {
    backgroundColor: `${n.colors.warning}12`,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: n.colors.warning,
    marginBottom: 12,
  },
  proofWarnText: {
    color: n.colors.warning,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: n.colors.error,
  },
});
