import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, BackHandler, Alert, Vibration, AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAndSummarizeAudio } from '../services/aiService';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { getAllSubjects, getTopicsBySubject } from '../db/queries/topics';
import { saveLectureNote } from '../db/queries/aiCache';
import { createSession, endSession } from '../db/queries/sessions';
import { updateStreak } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import { sendImmediateNag } from '../services/notificationService';
import { connectToRoom, sendSyncMessage } from '../services/deviceSyncService';
import BreakScreen from './BreakScreen';
import type { Subject } from '../types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'LectureMode'>;
type Route = RouteProp<HomeStackParamList, 'LectureMode'>;

const PROOF_OF_LIFE_INTERVAL = 15 * 60; // 15 mins
const PROOF_OF_LIFE_GRACE = 60; // 60 secs to respond

export default function LectureModeScreen() {
  useKeepAwake(); // Keep phone screen on like a dashboard

  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const profile = useAppStore(s => s.profile);
  
  const [subjects] = useState<Subject[]>(getAllSubjects);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(route.params?.subjectId ?? null);
  
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [currentNote, setCurrentNote] = useState('');
  
  const [onBreak, setOnBreak] = useState(false);
  const [breakCountdown, setBreakCountdown] = useState(300);
  const [resumeCountdown, setResumeCountdown] = useState(-1);
  
  const [proofOfLifeActive, setProofOfLifeActive] = useState(false);
  const [proofOfLifeCountdown, setProofOfLifeCountdown] = useState(0);

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  
  
  const [partnerDoomscrolling, setPartnerDoomscrolling] = useState(false);
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!profile) refreshProfile();
  useEffect(() => {
    if (profile?.syncCode) {
      const unsubscribe = connectToRoom(profile.syncCode, (msg) => {
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

  }, [profile]);

  // Handle App sending to background (doomscrolling attempt)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if ((nextAppState === 'background' || nextAppState === 'inactive') && !onBreak && elapsed > 0) {
        // They put the phone down or switched to Instagram
        sendSyncMessage({ type: 'DOOMSCROLL_DETECTED' });
        sendImmediateNag(
          "🚨 DOOMSCROLL DETECTED",
          "You're supposed to be watching a lecture! Put the phone down and look at your tablet!"
        );
        Vibration.vibrate([0, 500, 200, 500]);
      }
    });
    return () => subscription.remove();
  }, [onBreak, elapsed]);

  // Main Timer loop
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(e => {
        const newE = e + 1;
        // Trigger Proof of Life every 15 mins
        if (newE > 0 && newE % PROOF_OF_LIFE_INTERVAL === 0 && !onBreak) {
          setProofOfLifeActive(true);
          setProofOfLifeCountdown(PROOF_OF_LIFE_GRACE);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Vibration.vibrate([0, 300, 100, 300]);
        }
        return newE;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current);
    if (recording) recording.stopAndUnloadAsync().catch(() => {});
    setIsRecordingEnabled(false); };
  }, [onBreak]);

  // Proof of Life Countdown
  useEffect(() => {
    if (proofOfLifeActive && proofOfLifeCountdown > 0) {
      const t = setInterval(() => {
        setProofOfLifeCountdown(c => {
          if (c <= 1) {
            // FAILED PROOF OF LIFE
            sendImmediateNag("🚨 WAKE UP", "You zoned out! What is the professor saying right now?!");
            Vibration.vibrate(1000);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(t);
    }
  }, [proofOfLifeActive, proofOfLifeCountdown]);

  // Block Back Button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Stop lecture?', 'Are you actually done, or just avoiding it?', [
        { text: 'Keep watching', style: 'cancel' },
        { text: 'Stop', onPress: stopLecture, style: 'destructive' },
      ]);
      return true;
    });
    return () => handler.remove();
  }, [notes, currentNote]);

  // Break countdown logic
  useEffect(() => {
    if (onBreak && breakCountdown > 0) {
      const t = setInterval(() => setBreakCountdown(c => c - 1), 1000);
      return () => clearInterval(t);
    } else if (onBreak && breakCountdown <= 0) {
      handleBreakDone();
    }
  }, [onBreak, breakCountdown]);

  // Resume logic
  useEffect(() => {
    if (resumeCountdown > 0) {
      const t = setInterval(() => setResumeCountdown(c => c - 1), 1000);
      return () => clearInterval(t);
    } else if (resumeCountdown === 0) {
      setResumeCountdown(-1);
      setOnBreak(false);
      sendSyncMessage({ type: 'LECTURE_RESUMED' });
      // Main timer resumes automatically via the [onBreak] dependency above
    }
  }, [resumeCountdown]);

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

  function saveNote() {
    if (!currentNote.trim()) return;
    saveLectureNote(selectedSubjectId, currentNote.trim());
    setNotes(n => [...n, currentNote.trim()]);
    setCurrentNote('');
    
    // Clear proof of life
    if (proofOfLifeActive) {
      setProofOfLifeActive(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  
  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Access', 'Need microphone to auto-transcribe lectures.');
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    })();
  }, []);

  async function startRecording() {
    try {
      if (recording) await recording.stopAndUnloadAsync();
      
      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRec);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function processRecording() {
    if (!recording || !profile?.openrouterApiKey) return;
    setIsTranscribing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Transcribe
        const text = await transcribeAndSummarizeAudio(base64, profile.openrouterApiKey);
        if (text && text !== 'NO_CONTENT' && !text.includes('NO_CONTENT')) {
          saveLectureNote(selectedSubjectId, text.trim());
          setNotes(n => [...n, text.trim()]);
          
          // Reset Proof of Life because the AI proved the lecture is happening
          setProofOfLifeActive(false);
        }
        
        // Delete temp file
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
      // Restart recording immediately if still enabled
      if (isRecordingEnabled && !onBreak && elapsed > 0) {
        startRecording();
      }
    }
  }

  // Effect to handle the 3-minute recording loop
  useEffect(() => {
    if (isRecordingEnabled && !onBreak) {
      if (!recording && !isTranscribing) {
        startRecording();
      }
      
      // Every 3 minutes (180 seconds), process the chunk
      const interval = setInterval(() => {
        if (recording) {
          processRecording();
        }
      }, 180 * 1000);
      
      return () => clearInterval(interval);
    } else if (!isRecordingEnabled || onBreak) {
      if (recording) {
        recording.stopAndUnloadAsync().then(() => setRecording(null)).catch(() => {});
      }
    }
  }, [isRecordingEnabled, onBreak, recording, isTranscribing]);

  function toggleAutoScribe() {
    if (!isRecordingEnabled && !profile?.openrouterApiKey) {
      Alert.alert('API Key Required', 'You need an AI API key to transcribe lectures.');
      return;
    }
    setIsRecordingEnabled(!isRecordingEnabled);
  }

  function stopLecture() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentNote.trim()) saveNote();
    
    const mins = Math.floor(elapsed / 60);
    if (mins > 0) {
      const sessionId = createSession([], null, 'normal');
      const noteBonus = notes.length * 50;
      const totalXp = (mins * 15) + noteBonus;
      endSession(sessionId, [], totalXp, mins);
      updateStreak(mins >= 20);
      refreshProfile();
    }
    navigation.goBack();
  }

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  if (onBreak) {
    const topics = selectedSubjectId ? getTopicsBySubject(selectedSubjectId) : [];
    const randomTopicId = topics.length > 0 ? topics[Math.floor(Math.random() * topics.length)].id : undefined;

    if (resumeCountdown >= 0) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.resumeContainer}>
            <Text style={styles.resumeTitle}>Ready to resume?</Text>
            <Text style={styles.resumeTimer}>{resumeCountdown}</Text>
            <TouchableOpacity style={styles.resumeBtn} onPress={() => setResumeCountdown(0)}>
              <Text style={styles.resumeBtnText}>Resume Now</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <BreakScreen
        countdown={breakCountdown}
        totalSeconds={(profile?.breakDurationMinutes ?? 5) * 60}
        topicId={randomTopicId}
        apiKey={profile?.openrouterApiKey}
        orKey={profile?.openrouterKey}
        onDone={handleBreakDone}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safe, proofOfLifeActive && styles.safeWarn]}>
      
      {partnerDoomscrolling && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,0,0,0.9)', zIndex: 999, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 80, marginBottom: 20 }}>📱❌</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' }}>PUT YOUR PHONE DOWN.</Text>
          <Text style={{ color: '#fff', fontSize: 20, textAlign: 'center', marginTop: 20 }}>You are doomscrolling instead of watching this lecture!</Text>
        </View>
      )}
<StatusBar barStyle="light-content" backgroundColor={proofOfLifeActive ? "#2A0A0A" : "#0A0A14"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={stopLecture} style={styles.backBtn}>
          <Text style={styles.backText}>← End</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📺 Hostage Mode</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        
        {/* Hostage Instructions */}
        {!proofOfLifeActive && elapsed < 60 && (
          <View style={styles.hostageInfo}>
            <Text style={styles.hostageEmoji}>📱❌</Text>
            <Text style={styles.hostageText}>
              Put this phone face up on your desk. Watch the lecture on your tablet. If you close this app to doomscroll, your phone will scream at you.
            </Text>
          </View>
        )}

        {/* Timer */}
        <View style={[styles.timerBox, proofOfLifeActive && styles.timerBoxWarn]}>
          <Text style={styles.timerLabel}>Lecture Time</Text>
          <Text style={[styles.timer, proofOfLifeActive && styles.timerWarn]}>
            {mins}:{secs.toString().padStart(2, '0')}
          </Text>
        </View>

        {/* Proof of Life Challenge */}
        {proofOfLifeActive && (
          <View style={styles.proofOfLifeBox}>
            <Text style={styles.proofEmoji}>🚨</Text>
            <Text style={styles.proofTitle}>ACTIVE LISTENING CHECK</Text>
            <Text style={styles.proofSub}>
              You have {proofOfLifeCountdown}s to type one thing the professor just said. Are you zoning out?
            </Text>
          </View>
        )}

        {/* Subject selector */}
        {!selectedSubjectId ? (
          <View style={styles.subjectSection}>
            <Text style={styles.sectionLabel}>What subject are you watching?</Text>
            <View style={styles.subjectGrid}>
              {subjects.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.subjectChip, { borderColor: s.colorHex }]}
                  onPress={() => setSelectedSubjectId(s.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subjectChipText, { color: s.colorHex }]}>{s.shortCode}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.selectedSubject}>
            <Text style={styles.selectedSubjectText}>
              {subjects.find(s => s.id === selectedSubjectId)?.name}
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
        >
          <Text style={styles.transcribeBtnText}>
            {isRecordingEnabled ? '🎙️ AUTO-SCRIBE ACTIVE (Listening...)' : '🎙️ Enable Auto-Scribe'}
          </Text>
          {isTranscribing && <Text style={{color:'#fff', fontSize: 10}}>Processing...</Text>}
        </TouchableOpacity>

        <View style={styles.noteSection}>
          <TextInput
            style={[styles.noteInput, proofOfLifeActive && styles.noteInputWarn]}
            placeholder={proofOfLifeActive ? "Type here immediately to dismiss alarm..." : "Type a key concept to prove you're listening..."}
            placeholderTextColor={proofOfLifeActive ? "#FF980088" : "#444"}
            multiline
            value={currentNote}
            onChangeText={setCurrentNote}
          />
          <TouchableOpacity
            style={[styles.saveBtn, !currentNote.trim() && styles.saveBtnDisabled, proofOfLifeActive && styles.saveBtnWarn]}
            onPress={saveNote}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{proofOfLifeActive ? 'CONFIRM LISTENING' : 'Save Note'}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A14' },
  safeWarn: { backgroundColor: '#2A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  backBtn: { padding: 4 },
  backText: { color: '#F44336', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#fff', fontWeight: '900', fontSize: 17, textTransform: 'uppercase', letterSpacing: 1 },
  placeholder: { width: 60 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  
  hostageInfo: { backgroundColor: '#1A1A24', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333', marginBottom: 20, flexDirection: 'row', alignItems: 'center' },
  hostageEmoji: { fontSize: 28, marginRight: 12 },
  hostageText: { color: '#9E9E9E', flex: 1, fontSize: 13, lineHeight: 18 },

  timerBox: { alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 20, padding: 24, marginBottom: 24 },
  timerBoxWarn: { backgroundColor: '#3A0A0A', borderWidth: 2, borderColor: '#F44336' },
  timerLabel: { color: '#9E9E9E', fontSize: 12, marginBottom: 6, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  timer: { color: '#fff', fontWeight: '900', fontSize: 64, fontVariant: ['tabular-nums'] },
  timerWarn: { color: '#F44336' },
  
  proofOfLifeBox: { backgroundColor: '#F4433622', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#F44336', alignItems: 'center', marginBottom: 20 },
  proofEmoji: { fontSize: 40, marginBottom: 8 },
  proofTitle: { color: '#F44336', fontWeight: '900', fontSize: 18, marginBottom: 8 },
  proofSub: { color: '#FF9800', textAlign: 'center', fontWeight: '600', fontSize: 14, lineHeight: 20 },

  subjectSection: { marginBottom: 20 },
  sectionLabel: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, backgroundColor: '#1A1A24' },
  subjectChipText: { fontWeight: '700', fontSize: 13 },
  selectedSubject: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, backgroundColor: '#1A1A24', padding: 16, borderRadius: 12 },
  selectedSubjectText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  changeBtn: { color: '#6C63FF', fontSize: 14, fontWeight: '700' },
  
  
  transcribeBtn: { backgroundColor: '#1A1A24', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#6C63FF', marginBottom: 12, alignItems: 'center' },
  transcribeBtnActive: { backgroundColor: '#2A1A1A', borderColor: '#F44336' },
  transcribeBtnText: { color: '#6C63FF', fontWeight: '800', fontSize: 14 },

  noteSection: { marginBottom: 20 },
  noteInput: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#2A2A38', marginBottom: 12 },
  noteInputWarn: { backgroundColor: '#2A0A0A', borderColor: '#F44336', borderWidth: 2 },
  
  saveBtn: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#333' },
  saveBtnWarn: { backgroundColor: '#F44336' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 },
  
  breakTriggerBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  breakTriggerText: { color: '#9E9E9E', fontWeight: '700', fontSize: 14 },
  
  savedNotes: { marginTop: 8 },
  noteRow: { flexDirection: 'row', marginBottom: 8, backgroundColor: '#1A1A24', padding: 12, borderRadius: 8 },
  noteDot: { color: '#6C63FF', fontSize: 20, marginRight: 8, lineHeight: 22, fontWeight: '900' },
  noteText: { color: '#E0E0E0', fontSize: 14, flex: 1, lineHeight: 22 },
  
  resumeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A14' },
  resumeTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  resumeTimer: { color: '#6C63FF', fontSize: 80, fontWeight: '900', marginBottom: 40 },
  resumeBtn: { backgroundColor: '#6C63FF', borderRadius: 16, paddingHorizontal: 40, paddingVertical: 16 },
  resumeBtnText: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
