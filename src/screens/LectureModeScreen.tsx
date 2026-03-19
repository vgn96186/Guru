import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  BackHandler,
  Alert,
  Vibration,
  AppState,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAudio } from '../services/transcriptionService';
import { moveFileToRecovery } from '../services/transcriptStorage';
import { enqueueRequest } from '../services/offlineQueue';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { STREAK_MIN_MINUTES } from '../constants/gamification';
import { getAllSubjects, getTopicsBySubject, getTopicById } from '../db/queries/topics';
import {
  saveLectureTranscript,
  getLectureTranscriptsBySubject,
  saveLectureNote,
} from '../db/queries/aiCache';
import { createSession, endSession, updateSessionProgress } from '../db/queries/sessions';
import { profileRepository } from '../db/repositories';
import { theme } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import { sendImmediateNag } from '../services/notificationService';
import { connectToRoom, sendSyncMessage } from '../services/deviceSyncService';
import BreakScreen from './BreakScreen';
import FocusAudioPlayer from '../components/FocusAudioPlayer';
import { useFaceTracking } from '../hooks/useFaceTracking';
import type { Subject, TopicWithProgress } from '../types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { getDb } from '../db/database';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN } from '../config/appConfig';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'LectureMode'>;
type Route = RouteProp<HomeStackParamList, 'LectureMode'>;
const LECTURE_STATE_KEY = 'current_lecture_state';

const PROOF_OF_LIFE_INTERVAL = 15 * 60; // 15 mins
const PROOF_OF_LIFE_GRACE = 60; // 60 secs to respond
const PROOF_OF_LIFE_WARNING = 30; // warn 30s before trigger
const MAX_RECORDING_RETRIES = 3;
const RECORDING_RETRY_DELAY = 2000;
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

  const [partnerDoomscrolling, setPartnerDoomscrolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const isHydratedRef = useRef(false);
  const appStateSubscriptionRef = useRef<any>(null);
  const backHandlerRef = useRef<any>(null);
  const proofOfLifeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const saveStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');

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
  }, [elapsed]);

  // ── Lifecycle & Data ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) refreshProfile();
  }, [profile]);

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
      const unsubscribe = connectToRoom(profile.syncCode, (msg: any) => {
        if (msg.type === 'DOOMSCROLL_DETECTED') {
          setPartnerDoomscrolling(true);
          Vibration.vibrate([0, 500, 200, 500, 200, 1000]);
          setTimeout(() => setPartnerDoomscrolling(false), 10000); // Hide after 10s
        }
      });

      // Tell phone we started
      if (selectedSubjectId) {
        sendSyncMessage({ type: 'LECTURE_STARTED', subjectId: selectedSubjectId });
      }

      return () => {
        sendSyncMessage({ type: 'LECTURE_STOPPED' });
        unsubscribe();
      };
    }
  }, [profile?.syncCode, selectedSubjectId]);

  // Handle App sending to background (doomscrolling attempt)
  const hasTriggeredDoomscrollRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        hasTriggeredDoomscrollRef.current = false;
      }
      if (
        (nextAppState === 'background' || nextAppState === 'inactive') &&
        !onBreak &&
        elapsed > 0
      ) {
        void persistLectureState(true);
        if (!hasTriggeredDoomscrollRef.current) {
          hasTriggeredDoomscrollRef.current = true;
          // They put the phone down or switched to Instagram
          sendSyncMessage({ type: 'DOOMSCROLL_DETECTED' });
          sendImmediateNag(
            '🚨 DOOMSCROLL DETECTED',
            "You're supposed to be watching a lecture! Put the phone down and look at your tablet!",
          );
          Vibration.vibrate([0, 500, 200, 500]);
        }
      }
    });

    appStateSubscriptionRef.current = subscription;

    return () => {
      subscription.remove();
    };
  }, [elapsed, onBreak, persistLectureState]);

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
    if (proofOfLifeActive && proofOfLifeCountdown > 0) {
      proofOfLifeTimerRef.current = setInterval(() => {
        setProofOfLifeCountdown((c) => {
          if (c <= 1) {
            // FAILED PROOF OF LIFE
            sendImmediateNag(
              '🚨 WAKE UP',
              'You zoned out! What is the professor saying right now?!',
            );
            Vibration.vibrate(1000);
            return 0;
          }
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
  }, [proofOfLifeActive, proofOfLifeCountdown]);

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
  }, [proofOfLifeActive]);

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
      Alert.alert('Error', 'Failed to save note. Please try again.');
    }
  }

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Microphone Access', 'Need microphone to auto-transcribe lectures.');
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

  async function startRecording() {
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
      Alert.alert('Recording Error', 'Could not start microphone. Check permissions.');
    }
  }

  const processRecording = useCallback(async () => {
    if (!recording) {
      if (__DEV__) console.log('[LectureMode] No recording instance to process');
      return;
    }
    setIsTranscribing(true);

    try {
      const status = await recording.getStatusAsync();
      if (!status.canRecord) {
        if (__DEV__) console.warn('[LectureMode] Recording instance is not active');
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
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

          // Save lecture with enhanced metadata
          await applyLectureAnalysis(analysis, {
            recordingPath: uri,
            recordingDurationSeconds: Math.round(recordingDuration),
            transcriptionConfidence: analysis.estimatedConfidence
              ? analysis.estimatedConfidence / 3
              : null, // Convert 1-3 to 0-1
            processingMetricsJson: JSON.stringify({
              transcriptionMs: transcriptionTime,
              totalMs: transcriptionTime,
              modelUsed: analysis.modelUsed || 'unknown',
            }),
            retryCount: recordingRetryCount,
          });

          // Clean up recording file after successful save
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch (err) {
          console.warn('[LectureMode] Chunk transcription failed, moving to recovery:', err);
          const recoveryUri = await moveFileToRecovery(uri);

          // Create a recovery log entry to track this chunk in the unified pipeline
          const { startExternalAppSession } = await import('../db/queries/externalLogs');
          const recoveryLogId = await startExternalAppSession('Hostage Mode (Chunk)', recoveryUri);

          await enqueueRequest('transcribe', {
            audioFilePath: recoveryUri,
            appName: 'Hostage Mode (Chunk)',
            durationMinutes: 3,
            logId: recoveryLogId,
            recordingDurationSeconds: Math.round(recordingDuration),
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
      if (isRecordingEnabled && !onBreak && elapsed > 0) {
        startRecording();
      }
    }
  }, [recording, isRecordingEnabled, onBreak, elapsed, recordingRetryCount]);

  async function applyLectureAnalysis(
    analysis: {
      topics: string[];
      estimatedConfidence: 1 | 2 | 3;
      subject: string;
      lectureSummary: string;
      keyConcepts: string[];
      highYieldPoints: string[];
      transcript?: string;
      embedding?: number[];
      modelUsed?: string;
    },
    metadata: {
      recordingPath?: string;
      recordingDurationSeconds?: number;
      transcriptionConfidence?: number | null;
      processingMetricsJson?: string;
      retryCount?: number;
      lastError?: string;
    } = {},
  ) {
    const hasTranscript = !!analysis.transcript?.trim();
    const hasMeaningfulSummary =
      !!analysis.lectureSummary &&
      ![
        'No audio recorded (empty file)',
        'No speech detected (silent audio)',
        'No speech detected',
        'Lecture content recorded',
        'No medical content detected',
      ].includes(analysis.lectureSummary);
    if (!hasTranscript || !hasMeaningfulSummary) {
      throw new Error('No usable lecture content was detected in this recording.');
    }

    const conceptsText =
      analysis.keyConcepts.length > 0
        ? '\n\n💡 **Key Concepts**\n' + analysis.keyConcepts.map((c: string) => `• ${c}`).join('\n')
        : '';
    const hyText =
      analysis.highYieldPoints.length > 0
        ? '\n\n🚀 **High-Yield**\n' +
          analysis.highYieldPoints.map((p: string) => `• ${p}`).join('\n')
        : '';

    const noteText = `🎯 **Subject**: ${analysis.subject}\n📌 **Topics**: ${analysis.topics.join(', ')}\n\n📝 **Summary**: ${analysis.lectureSummary}${conceptsText}${hyText}`;

    // Save lecture transcript with enhanced metadata
    const lectureNoteId = await saveLectureTranscript({
      subjectId: selectedSubjectId,
      subjectName: analysis.subject,
      note: noteText,
      transcript: analysis.transcript,
      summary: analysis.lectureSummary,
      topics: analysis.topics,
      confidence: analysis.estimatedConfidence,
      embedding: analysis.embedding,
      ...metadata,
    });

    // Automatically mark topics as studied based on lecture content
    if (selectedSubjectId && analysis.topics.length > 0) {
      await markTopicsAsStudied(selectedSubjectId, analysis.topics, lectureNoteId);
    }

    setNotes((n) => [...n, noteText]);
    setProofOfLifeActive(false);
  }

  /**
   * Mark topics as studied based on lecture content
   * Uses deduplication to avoid double-counting
   */
  async function markTopicsAsStudied(
    subjectId: number,
    topicNames: string[],
    lectureNoteId: number,
  ) {
    try {
      const db = getDb();

      // Subject doesn't have topics directly, we need to fetch them
      const subjectTopics = await getTopicsBySubject(subjectId);

      // Match topic names (case-insensitive, partial match)
      const matchedTopicIds = new Set<number>();
      for (const topicName of topicNames) {
        const normalizedName = topicName.toLowerCase().trim();
        const match = subjectTopics.find(
          (t) =>
            t.name.toLowerCase().includes(normalizedName) ||
            normalizedName.includes(t.name.toLowerCase()),
        );
        if (match) {
          matchedTopicIds.add(match.id);
        }
      }

      // Mark each unique topic as studied
      for (const topicId of matchedTopicIds) {
        try {
          // Check if already marked from this lecture (deduplication)
          const existing = await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM lecture_learned_topics WHERE lecture_note_id = ? AND topic_id = ?`,
            [lectureNoteId, topicId],
          );

          if (!existing) {
            await db.runAsync(
              `INSERT INTO lecture_learned_topics (lecture_note_id, topic_id, confidence_at_time) 
               VALUES (?, ?, ?)`,
              [lectureNoteId, topicId, 2], // Default confidence
            );

            // Update topic_progress status to 'seen' if it was 'unseen'
            await db.runAsync(
              `UPDATE topic_progress 
               SET status = 'seen', times_studied = times_studied + 1, last_studied_at = ?
               WHERE topic_id = ? AND status = 'unseen'`,
              [Date.now(), topicId],
            );
          }
        } catch (err) {
          console.warn('[LectureMode] Failed to mark topic as studied:', topicId, err);
        }
      }

      if (matchedTopicIds.size > 0 && __DEV__) {
        console.log(`[LectureMode] Marked ${matchedTopicIds.size} topics as studied from lecture`);
      }
    } catch (err) {
      console.error('[LectureMode] Failed to update topic progress:', err);
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

      await applyLectureAnalysis(analysis);
      Alert.alert('Transcription Complete', analysis.lectureSummary || 'Done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to transcribe imported audio.';
      Alert.alert('Transcription Failed', msg);
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
      Alert.alert(
        'Transcription Required',
        'Add Groq or Hugging Face credentials, or enable Local Whisper in Settings to use Auto-Scribe.',
      );
      return;
    }
    setIsRecordingEnabled(!isRecordingEnabled);
  }

  function confirmStopLecture() {
    Alert.alert('Stop lecture?', 'Are you actually done, or just avoiding it?', [
      { text: 'Keep watching', style: 'cancel' },
      { text: 'Stop', onPress: stopLecture, style: 'destructive' },
    ]);
  }

  // Block Back Button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Ready to wrap up?', 'You can always come back and continue later.', [
        { text: 'Keep watching', style: 'cancel' },
        { text: 'Finish', onPress: stopLecture, style: 'destructive' },
      ]);
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
            <Text style={styles.resumeTitle}>Ready to resume?</Text>
            <Text style={styles.resumeTimer}>{resumeCountdown}</Text>
            <TouchableOpacity style={styles.resumeBtn} onPress={() => setResumeCountdown(0)}>
              <Text style={styles.resumeBtnText}>Resume Now</Text>
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
            backgroundColor: theme.colors.error,
            zIndex: 999,
            justifyContent: 'center',
            alignItems: 'center',
            padding: theme.spacing.xxl,
          }}
        >
          <Text style={{ fontSize: 80, marginBottom: 20 }}>📱❌</Text>
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 32,
              fontWeight: '900',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}
          >
            PUT YOUR PHONE DOWN.
          </Text>
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 20,
              textAlign: 'center',
              marginTop: 20,
            }}
          >
            You are doomscrolling instead of watching this lecture!
          </Text>
        </View>
      )}
      <StatusBar
        barStyle="light-content"
        backgroundColor={proofOfLifeActive ? theme.colors.errorSurface : theme.colors.background}
      />
      <ResponsiveContainer>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={confirmStopLecture}
            style={styles.backBtn}
            testID="lecture-end-btn"
          >
            <Text style={styles.backText}>← End</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📺 Hostage Mode</Text>
          <FocusAudioPlayer />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {focusState !== 'focused' && !onBreak && (
            <View style={[styles.hostageInfo, { borderColor: theme.colors.error }]}>
              <Text style={styles.hostageEmoji}>👀</Text>
              <Text style={[styles.hostageText, { color: theme.colors.error }]}>
                Face not detected or distracted! Look at your study materials!
              </Text>
            </View>
          )}

          {/* Hostage Instructions */}
          {!proofOfLifeActive && elapsed < 60 && (
            <View style={styles.hostageInfo}>
              <Text style={styles.hostageEmoji}>📱❌</Text>
              <Text style={styles.hostageText}>
                Put this phone face up on your desk. Watch the lecture on your tablet. If you close
                this app to doomscroll, your phone will scream at you.
              </Text>
            </View>
          )}

          {/* Timer */}
          <View
            style={[styles.timerBox, proofOfLifeActive && styles.timerBoxWarn]}
            testID="lecture-timer"
          >
            <Text style={styles.timerLabel}>Lecture Time</Text>
            <Text
              style={[styles.timer, proofOfLifeActive && styles.timerWarn]}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
            >
              {mins}:{secs.toString().padStart(2, '0')}
            </Text>
          </View>

          {/* Pre-warning 30s before proof of life */}
          {proofWarningActive && !proofOfLifeActive && (
            <View style={styles.proofWarnBanner}>
              <Text style={styles.proofWarnText}>
                ⚠️ Listening check in 30s — get ready to type!
              </Text>
            </View>
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
                <Text style={styles.proofEmoji}>🚨</Text>
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

              <Text style={styles.proofTitle}>ACTIVE LISTENING CHECK</Text>
              <Text style={styles.proofSub}>
                You have {proofOfLifeCountdown}s to type one thing the professor just said.
              </Text>

              <View style={styles.proofTimerContainer}>
                <View style={styles.proofTimerCircle}>
                  <Text
                    style={[
                      styles.proofTimerText,
                      proofOfLifeCountdown <= 10 && styles.proofTimerTextUrgent,
                    ]}
                  >
                    {proofOfLifeCountdown}
                  </Text>
                </View>
                <Text style={styles.proofTimerLabel}>seconds remaining</Text>
              </View>

              <Text style={styles.proofWarning}>
                Are you zoning out? Type a note above to dismiss this alert.
              </Text>
            </Animated.View>
          )}

          {/* Subject selector */}
          {!selectedSubjectId ? (
            <View style={styles.subjectSection}>
              <Text style={styles.sectionLabel}>What subject are you watching?</Text>
              <View style={styles.subjectGrid}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.subjectChip, { borderColor: s.colorHex }]}
                    onPress={() => setSelectedSubjectId(s.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.subjectChipText, { color: s.colorHex }]}>
                      {s.shortCode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.selectedSubject}>
              <Text style={styles.selectedSubjectText}>
                {subjects.find((s) => s.id === selectedSubjectId)?.name}
              </Text>
              <TouchableOpacity onPress={() => setSelectedSubjectId(null)}>
                <Text style={styles.changeBtn}>Change</Text>
              </TouchableOpacity>
            </View>
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
              <Text style={styles.transcribeBtnText}>
                {isRecordingEnabled ? 'AUTO-SCRIBE ACTIVE — Recording' : '🎙️ Enable Auto-Scribe'}
              </Text>
            </View>
            {isTranscribing && (
              <Text style={{ color: theme.colors.textInverse, fontSize: 11 }}>
                Processing chunk...
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.transcribeBtn, styles.importTranscribeBtn]}
            onPress={importAndTranscribeAudio}
            activeOpacity={0.8}
            testID="import-transcribe-btn"
          >
            <Text style={styles.transcribeBtnText}>📁 Import Audio & Transcribe</Text>
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
              placeholderTextColor={
                proofOfLifeActive ? theme.colors.error + 'AA' : theme.colors.textMuted
              }
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
              <Text style={styles.saveBtnText}>
                {proofOfLifeActive ? 'CONFIRM LISTENING' : 'Save Note'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.breakTriggerBtn} onPress={startBreak}>
              <Text style={styles.breakTriggerText}>☕ Take 5m Break</Text>
            </TouchableOpacity>
          </View>

          {/* Saved notes */}
          {notes.length > 0 && (
            <View style={styles.savedNotes}>
              <Text style={styles.sectionLabel}>Proof of Focus ({notes.length})</Text>
              {notes.map((n, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={styles.noteDot}>·</Text>
                  <Text style={styles.noteText}>{n}</Text>
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
  safe: { flex: 1, backgroundColor: theme.colors.background },
  safeWarn: { backgroundColor: theme.colors.errorSurface },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    paddingTop: 20,
  },
  backBtn: { padding: 4 },
  backText: { color: theme.colors.error, fontSize: 16, fontWeight: '700' },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 17,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  placeholder: { width: 60 },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg, paddingBottom: 60 },

  hostageInfo: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostageEmoji: { fontSize: 28, marginRight: 12 },
  hostageText: { color: theme.colors.textSecondary, flex: 1, fontSize: 13, lineHeight: 18 },

  timerBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  timerBoxWarn: {
    backgroundColor: theme.colors.errorSurface,
    borderWidth: 2,
    borderColor: theme.colors.error,
  },
  timerLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timer: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 64,
    fontVariant: ['tabular-nums'],
  },
  timerWarn: { color: theme.colors.error },

  proofOfLifeBox: {
    backgroundColor: theme.colors.errorSurface,
    borderRadius: 20,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.error,
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
    backgroundColor: theme.colors.errorTintSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
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
    color: theme.colors.error,
    fontWeight: '900',
    fontSize: 20,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 1,
  },
  proofSub: {
    color: theme.colors.warning,
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
    backgroundColor: theme.colors.errorSurface,
    borderWidth: 3,
    borderColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  proofTimerText: {
    color: theme.colors.textPrimary,
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  proofTimerTextUrgent: {
    color: theme.colors.error,
  },
  proofTimerLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  proofWarning: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
    maxWidth: '90%',
  },

  subjectSection: { marginBottom: 20 },
  sectionLabel: {
    color: theme.colors.textSecondary,
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
    backgroundColor: theme.colors.surface,
  },
  subjectChipText: { fontWeight: '700', fontSize: 13 },
  selectedSubject: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: 12,
  },
  selectedSubjectText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  changeBtn: { color: theme.colors.primary, fontSize: 14, fontWeight: '700' },

  transcribeBtn: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginBottom: 12,
    alignItems: 'center',
  },
  transcribeBtnActive: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.error,
  },
  transcribeBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 14 },
  importTranscribeBtn: { marginTop: -4 },

  noteSection: { marginBottom: 20 },
  noteInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.lg,
    color: theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  noteInputWarn: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.error,
    borderWidth: 2,
  },
  noteInputActive: {
    borderColor: theme.colors.success,
    borderWidth: 2,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: theme.colors.border },
  saveBtnWarn: { backgroundColor: theme.colors.error },
  saveBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  breakTriggerBtn: { padding: theme.spacing.lg, alignItems: 'center', marginTop: 8 },
  breakTriggerText: { color: theme.colors.textSecondary, fontWeight: '700', fontSize: 14 },

  savedNotes: { marginTop: 8 },
  noteRow: {
    flexDirection: 'row',
    marginBottom: 8,
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 8,
  },
  noteDot: {
    color: theme.colors.primary,
    fontSize: 20,
    marginRight: 8,
    lineHeight: 22,
    fontWeight: '900',
  },
  noteText: { color: theme.colors.textPrimary, fontSize: 14, flex: 1, lineHeight: 22 },

  resumeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  resumeTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: theme.spacing.lg,
  },
  resumeTimer: { color: theme.colors.primary, fontSize: 80, fontWeight: '900', marginBottom: 40 },
  resumeBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: theme.spacing.lg,
  },
  resumeBtnText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 18 },
  proofWarnBanner: {
    backgroundColor: theme.colors.warningSurface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    marginBottom: 12,
  },
  proofWarnText: {
    color: theme.colors.warning,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.error,
  },
});
