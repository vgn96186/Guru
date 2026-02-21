import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, BackHandler, Alert, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { getAllSubjects, getTopicsBySubject } from '../db/queries/topics';
import { saveLectureNote } from '../db/queries/aiCache';
import { createSession, endSession } from '../db/queries/sessions';
import { updateStreak } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import BreakScreen from './BreakScreen';
import type { Subject } from '../types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'LectureMode'>;
type Route = RouteProp<HomeStackParamList, 'LectureMode'>;

const PROMPT_AT_SECONDS = 30 * 60; // 30 min
const VIBRATE_AT_SECONDS = 35 * 60; // 35 min if no note

export default function LectureModeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const profile = useAppStore(s => s.profile);
  const [subjects] = useState<Subject[]>(getAllSubjects);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(route.params?.subjectId ?? null);
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [currentNote, setCurrentNote] = useState('');
  const [showNotePrompt, setShowNotePrompt] = useState(false);
  const [notedAtPrompt, setNotedAtPrompt] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [breakCountdown, setBreakCountdown] = useState(300); // 5 min
  const [resumeCountdown, setResumeCountdown] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Wait for profile to be loaded
  useEffect(() => {
    if (!profile) {
      refreshProfile();
    }
  }, [profile]);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (elapsed === PROMPT_AT_SECONDS) {
      setShowNotePrompt(true);
      Vibration.vibrate(200);
    }
    if (elapsed === VIBRATE_AT_SECONDS && !notedAtPrompt) {
      Vibration.vibrate([0, 300, 100, 300]);
      setShowNotePrompt(true);
    }
  }, [elapsed, notedAtPrompt]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Stop lecture?', 'Your notes will be saved.', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Stop', onPress: stopLecture },
      ]);
      return true;
    });
    return () => handler.remove();
  }, [notes]);

  useEffect(() => {
    if (onBreak && breakCountdown > 0) {
      const t = setInterval(() => setBreakCountdown(c => c - 1), 1000);
      return () => clearInterval(t);
    } else if (onBreak && breakCountdown <= 0) {
      handleBreakDone();
    }
  }, [onBreak, breakCountdown]);

  useEffect(() => {
    if (resumeCountdown > 0) {
      const t = setInterval(() => setResumeCountdown(c => c - 1), 1000);
      return () => clearInterval(t);
    } else if (resumeCountdown === 0) {
      setResumeCountdown(-1);
      setOnBreak(false);
      // Resume timer
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
  }, [resumeCountdown]);

  function startBreak() {
    if (timerRef.current) clearInterval(timerRef.current);
    setOnBreak(true);
    setBreakCountdown(300);
  }

  function handleBreakDone() {
    setResumeCountdown(3); // 3s auto-start
  }

  function saveNote() {
    if (!currentNote.trim()) return;
    saveLectureNote(selectedSubjectId, currentNote.trim());
    setNotes(n => [...n, currentNote.trim()]);
    setCurrentNote('');
    setShowNotePrompt(false);
    setNotedAtPrompt(true);
  }

  function stopLecture() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentNote.trim()) saveNote();
    
    // RECORD PROGRESS
    const mins = Math.floor(elapsed / 60);
    if (mins > 0) {
      const sessionId = createSession([], null, 'normal');
      // Award 15 XP per minute for active listening + bonus for notes
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
  const isOver30 = elapsed >= PROMPT_AT_SECONDS;

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
        topicId={randomTopicId}
        apiKey={profile?.openrouterApiKey}
        orKey={profile?.openrouterKey}
        onDone={handleBreakDone}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A14" />
      <View style={styles.header}>
        <TouchableOpacity onPress={stopLecture} style={styles.backBtn}>
          <Text style={styles.backText}>← Stop</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📺 Lecture Mode</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Timer */}
        <View style={[styles.timerBox, isOver30 && styles.timerBoxWarn]}>
          <Text style={styles.timerLabel}>Time watching</Text>
          <Text style={[styles.timer, isOver30 && styles.timerWarn]}>
            {mins}:{secs.toString().padStart(2, '0')}
          </Text>
          {isOver30 && <Text style={styles.timerNote}>You've been watching 30+ min. Note something?</Text>}
        </View>

        {/* Subject selector */}
        {!selectedSubjectId ? (
          <View style={styles.subjectSection}>
            <Text style={styles.sectionLabel}>What subject?</Text>
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
        {(showNotePrompt || true) && (
          <View style={styles.noteSection}>
            <Text style={styles.sectionLabel}>
              {showNotePrompt ? '📝 What did you just learn?' : '📝 Quick note'}
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Type a key point, concept, or fact..."
              placeholderTextColor="#444"
              multiline
              value={currentNote}
              onChangeText={setCurrentNote}
            />
            <TouchableOpacity style={styles.breakTriggerBtn} onPress={startBreak}>
              <Text style={styles.breakTriggerText}>☕ Take 5m Break</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !currentNote.trim() && styles.saveBtnDisabled]}
              onPress={saveNote}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>Save Note</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Saved notes */}
        {notes.length > 0 && (
          <View style={styles.savedNotes}>
            <Text style={styles.sectionLabel}>Notes this session ({notes.length})</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  backBtn: { padding: 4 },
  backText: { color: '#6C63FF', fontSize: 16 },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 17 },
  placeholder: { width: 60 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  timerBox: { alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 20, padding: 24, marginBottom: 24 },
  timerBoxWarn: { backgroundColor: '#1A1400', borderWidth: 1, borderColor: '#FF9800' },
  timerLabel: { color: '#9E9E9E', fontSize: 12, marginBottom: 6 },
  timer: { color: '#fff', fontWeight: '900', fontSize: 52 },
  timerWarn: { color: '#FF9800' },
  timerNote: { color: '#FF9800', fontSize: 12, marginTop: 8, textAlign: 'center' },
  subjectSection: { marginBottom: 20 },
  sectionLabel: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, backgroundColor: '#1A1A24' },
  subjectChipText: { fontWeight: '700', fontSize: 13 },
  selectedSubject: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  selectedSubjectText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  changeBtn: { color: '#6C63FF', fontSize: 14 },
  noteSection: { marginBottom: 20 },
  noteInput: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#2A2A38', marginBottom: 10 },
  saveBtn: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 14, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#333' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  savedNotes: { marginTop: 8 },
  noteRow: { flexDirection: 'row', marginBottom: 8 },
  noteDot: { color: '#6C63FF', fontSize: 20, marginRight: 8, lineHeight: 22 },
  noteText: { color: '#E0E0E0', fontSize: 14, flex: 1, lineHeight: 22 },
  breakTriggerBtn: { padding: 12, alignItems: 'center', marginBottom: 12 },
  breakTriggerText: { color: '#4CAF50', fontWeight: '700', fontSize: 14 },
  resumeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A14' },
  resumeTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  resumeTimer: { color: '#6C63FF', fontSize: 80, fontWeight: '900', marginBottom: 40 },
  resumeBtn: { backgroundColor: '#6C63FF', borderRadius: 16, paddingHorizontal: 40, paddingVertical: 16 },
  resumeBtnText: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
