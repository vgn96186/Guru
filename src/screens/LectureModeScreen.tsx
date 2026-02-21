import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Vibration, ScrollView, Modal, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAllSubjects, createTopicWithCatalyst } from '../db/queries/topics';
import { saveLectureNote } from '../db/queries/aiCache';
import { catalyzeTranscript } from '../services/aiService';
import { useAppStore } from '../store/useAppStore';
import type { Subject } from '../types';

export default function LectureModeScreen() {
  const navigation = useNavigation();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isBreak, setIsBreak] = useState(false);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(5 * 60);

  const [showNotePrompt, setShowNotePrompt] = useState(false);
  const [isEnforced, setIsEnforced] = useState(false);
  const [noteText, setNoteText] = useState('');

  const [showSubjectPicker, setShowSubjectPicker] = useState(false);

  const [transcript, setTranscript] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [catalystResult, setCatalystResult] = useState<{ topicName: string; subjectName: string } | null>(null);

  const { profile } = useAppStore();

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loaded = getAllSubjects();
    setSubjects(loaded);
    if (loaded.length > 0) setSelectedSubject(loaded[0]);
  }, []);

  useEffect(() => {
    if (isActive && !isBreak && !showNotePrompt && !isEnforced) {
      timerRef.current = setInterval(() => {
        setSecondsElapsed(s => {
          const next = s + 1;
          // Trigger soft prompt at 30 minutes (1800 seconds)
          if (next === 1800) {
            setShowNotePrompt(true);
          }
          // Trigger enforced vibration block at 35 minutes (2100 seconds)
          if (next === 2100) {
            setShowNotePrompt(true);
            setIsEnforced(true);
            Vibration.vibrate([500, 500, 500, 500], true);
          }
          return next;
        });
      }, 1000);
    } else if (isBreak) {
      timerRef.current = setInterval(() => {
        setBreakSecondsLeft(prev => {
          if (prev <= 1) {
            setIsBreak(false);
            setBreakSecondsLeft(5 * 60);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isBreak, showNotePrompt, isEnforced]);

  // Pause timer if user leaves screen
  useFocusEffect(
    React.useCallback(() => {
      return () => setIsActive(false);
    }, [])
  );

  function formatTime(totalSeconds: number) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function handleStartStop() {
    setIsActive(!isActive);
  }

  function handleTakeBreak() {
    setIsBreak(true);
    setBreakSecondsLeft(5 * 60); // 5 min
    setShowNotePrompt(false);
    setIsEnforced(false);
  }

  function handleEndLecture() {
    navigation.goBack();
  }

  function handleSaveNote() {
    if (noteText.trim().length > 0 && selectedSubject) {
      saveLectureNote(selectedSubject.id, noteText.trim());
    }
    setNoteText('');
    setShowNotePrompt(false);
    if (isEnforced) {
      Vibration.cancel();
      setIsEnforced(false);
      setSecondsElapsed(0); // Restart the 30m window after forced note
    }
  }

  async function handleSynthesize() {
    if (!profile?.openrouterApiKey) {
      Alert.alert('Missing API Key', 'Add your Gemini API key in Settings first.');
      return;
    }
    if (!selectedSubject || !transcript.trim()) return;

    setIsSynthesizing(true);
    try {
      const aiData = await catalyzeTranscript(transcript, profile.openrouterApiKey);
      createTopicWithCatalyst(selectedSubject.id, aiData);
      setTranscript('');
      setCatalystResult({ topicName: aiData.topicName, subjectName: selectedSubject.name });
    } catch (e: any) {
      Alert.alert('Catalyst Failed', e.message);
    } finally {
      setIsSynthesizing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleEndLecture} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lecture Mode</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Timer section */}
          <View style={styles.container}>
            {/* Subject Selector */}
            <TouchableOpacity
              style={styles.subjectSelector}
              onPress={() => setShowSubjectPicker(true)}
              disabled={isActive || isBreak}
            >
              <Text style={styles.subjectLabel}>Subject: </Text>
              <Text style={[styles.subjectValue, { color: selectedSubject?.colorHex || '#6C63FF' }]}>
                {selectedSubject?.name || 'Select Subject'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9E9E9E" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            {/* Main Timer Display */}
            <View style={styles.timerCircle}>
              {isBreak ? (
                <>
                  <Text style={styles.timerModeText}>BREAK</Text>
                  <Text style={[styles.timerText, { color: '#4CAF50' }]}>{formatTime(breakSecondsLeft)}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.timerModeText}>FOCUSED</Text>
                  <Text style={styles.timerText}>{formatTime(secondsElapsed)}</Text>
                </>
              )}
            </View>

            {/* Controls */}
            <View style={styles.controlsRow}>
              {!isBreak ? (
                <TouchableOpacity
                  style={[styles.mainBtn, isActive ? styles.stopBtn : styles.startBtn]}
                  onPress={handleStartStop}
                >
                  <Ionicons name={isActive ? "pause" : "play"} size={28} color="#fff" />
                  <Text style={styles.btnText}>{isActive ? 'PAUSE' : 'START'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.mainBtn, styles.stopBtn]}
                  onPress={() => setIsBreak(false)}
                >
                  <Ionicons name="play" size={28} color="#fff" />
                  <Text style={styles.btnText}>RESUME</Text>
                </TouchableOpacity>
              )}

              {!isBreak && (
                <TouchableOpacity style={styles.breakBtn} onPress={handleTakeBreak}>
                  <Ionicons name="cafe" size={24} color="#fff" />
                  <Text style={styles.btnText}>BREAK</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Auto-Card Catalyst UI */}
          {!isBreak && (
            <View style={styles.catalystContainer}>
              <Text style={styles.catalystTitle}>Auto-Card Catalyst ⚡️</Text>

              {catalystResult ? (
                /* Success state */
                <View style={styles.catalystSuccess}>
                  <Text style={styles.catalystSuccessEmoji}>⚡️</Text>
                  <Text style={styles.catalystSuccessTitle}>{catalystResult.topicName}</Text>
                  <Text style={styles.catalystSuccessSub}>
                    Flashcards + quiz saved to {catalystResult.subjectName}
                  </Text>
                  <TouchableOpacity
                    style={styles.catalystSuccessBtn}
                    onPress={() => setCatalystResult(null)}
                  >
                    <Text style={styles.catalystSuccessBtnText}>Create Another</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Input state */
                <>
                  <TextInput
                    style={styles.transcriptInput}
                    placeholder="Paste or dictate lecture notes here..."
                    placeholderTextColor="#666"
                    value={transcript}
                    onChangeText={setTranscript}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.synthesizeBtn, (!transcript.trim() || !selectedSubject || isSynthesizing) && { opacity: 0.5 }]}
                    onPress={handleSynthesize}
                    disabled={!transcript.trim() || !selectedSubject || isSynthesizing}
                  >
                    {isSynthesizing ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.synthesizeText}>Guru, Synthesize This</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Note Prompt Modal */}
      <Modal visible={showNotePrompt} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBg}
        >
          <View style={[styles.noteCard, isEnforced && { borderColor: '#F44336', borderWidth: 2 }]}>
            {isEnforced ? (
              <>
                <Text style={[styles.noteTitle, { color: '#F44336' }]}>🚨 Wake Up!</Text>
                <Text style={styles.noteSub}>You've been watching for 35 minutes. Type what you just learned to clear the alarm.</Text>
              </>
            ) : (
              <>
                <Text style={styles.noteTitle}>Pause & Note</Text>
                <Text style={styles.noteSub}>You hit 30 minutes! Log a quick key point to reset your focus.</Text>
              </>
            )}

            <TextInput
              style={styles.noteInput}
              placeholder="I learned that..."
              placeholderTextColor="#666"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              autoFocus
            />

            <View style={styles.noteActions}>
              {!isEnforced && (
                <TouchableOpacity style={styles.skipBtn} onPress={() => setShowNotePrompt(false)}>
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveBtn, isEnforced && noteText.trim().length === 0 && { opacity: 0.5 }]}
                onPress={handleSaveNote}
                disabled={isEnforced && noteText.trim().length === 0}
              >
                <Text style={styles.saveText}>Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Subject Picker Modal */}
      <Modal visible={showSubjectPicker} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select Subject</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {subjects.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.pickerRow}
                  onPress={() => {
                    setSelectedSubject(s);
                    setShowSubjectPicker(false);
                  }}
                >
                  <View style={[styles.pickerDot, { backgroundColor: s.colorHex }]} />
                  <Text style={styles.pickerText}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerClose} onPress={() => setShowSubjectPicker(false)}>
              <Text style={styles.pickerCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  container: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  subjectSelector: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24',
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginBottom: 40
  },
  subjectLabel: { color: '#9E9E9E', fontSize: 16 },
  subjectValue: { fontWeight: '700', fontSize: 16 },

  timerCircle: {
    width: 250, height: 250, borderRadius: 125, borderWidth: 4, borderColor: '#2A2A38',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#13131A', marginBottom: 60
  },
  timerModeText: { color: '#666', fontSize: 14, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  timerText: { color: '#fff', fontSize: 64, fontWeight: '300', fontVariant: ['tabular-nums'] },

  controlsRow: { flexDirection: 'row', gap: 16 },
  mainBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: 30, gap: 8, elevation: 4
  },
  startBtn: { backgroundColor: '#6C63FF' },
  stopBtn: { backgroundColor: '#F44336' },
  breakBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16,
    borderRadius: 30, gap: 8, backgroundColor: '#1A1A24', borderWidth: 1, borderColor: '#2A2A38'
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  noteCard: { backgroundColor: '#1A1A24', width: '100%', borderRadius: 16, padding: 24 },
  noteTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  noteSub: { color: '#9E9E9E', fontSize: 14, marginBottom: 24, lineHeight: 20 },
  noteInput: {
    backgroundColor: '#0F0F14', color: '#fff', padding: 16, borderRadius: 12,
    fontSize: 16, minHeight: 120, textAlignVertical: 'top', marginBottom: 24
  },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  skipText: { color: '#9E9E9E', fontWeight: '600', fontSize: 16 },
  saveBtn: { backgroundColor: '#6C63FF', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  pickerCard: { backgroundColor: '#1A1A24', width: '100%', borderRadius: 16, padding: 16 },
  pickerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A38' },
  pickerDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  pickerText: { color: '#fff', fontSize: 16 },
  pickerClose: { marginTop: 16, padding: 16, alignItems: 'center' },
  pickerCloseText: { color: '#F44336', fontWeight: '700', fontSize: 16 },

  catalystContainer: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#1A1A24', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#2A2A38' },
  catalystTitle: { color: '#FF9800', fontWeight: '800', marginBottom: 12, letterSpacing: 1 },
  transcriptInput: { backgroundColor: '#0F0F14', color: '#fff', padding: 16, borderRadius: 12, height: 100, textAlignVertical: 'top', marginBottom: 16 },
  synthesizeBtn: { backgroundColor: '#FF9800', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  synthesizeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  catalystSuccess: { alignItems: 'center', paddingVertical: 12 },
  catalystSuccessEmoji: { fontSize: 36, marginBottom: 8 },
  catalystSuccessTitle: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  catalystSuccessSub: { color: '#9E9E9E', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  catalystSuccessBtn: { borderWidth: 1, borderColor: '#FF9800', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  catalystSuccessBtnText: { color: '#FF9800', fontWeight: '700' },
});
