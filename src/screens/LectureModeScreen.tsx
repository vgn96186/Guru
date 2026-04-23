import React from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';

import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import BreakScreen from './BreakScreen';
import FocusAudioPlayer from '../components/FocusAudioPlayer';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';

import { styles } from './lectureMode/LectureModeScreen.styles';
import { useLectureModeController } from './lectureMode/hooks/useLectureModeController';
import { ProofOfLifeChallenge } from './lectureMode/components/ProofOfLifeChallenge';
import { DoomscrollOverlay } from './lectureMode/components/DoomscrollOverlay';
import { LectureResumeScreen } from './lectureMode/components/LectureResumeScreen';

export default function LectureModeScreen() {
  useKeepAwake(); // Keep phone screen on like a dashboard

  const { state, actions } = useLectureModeController();

  if (state.onBreak) {
    if (state.resumeCountdown >= 0) {
      return (
        <LectureResumeScreen 
          resumeCountdown={state.resumeCountdown} 
          onResumeNow={() => actions.setResumeCountdown(0)} 
        />
      );
    }

    const topics = state.breakTopics;
    const randomTopicId = topics.length > 0 ? topics[Math.floor(Math.random() * topics.length)].id : undefined;
    return (
      <BreakScreen
        countdown={state.breakCountdown}
        totalSeconds={(state.profile?.breakDurationMinutes ?? 5) * 60}
        topicId={randomTopicId}
        onDone={actions.handleBreakDone}
      />
    );
  }

  const mins = Math.floor(state.elapsed / 60);
  const secs = state.elapsed % 60;

  return (
    <SafeAreaView
      style={[styles.safe, state.proofOfLifeActive && styles.safeWarn]}
      testID="lecture-mode-screen"
    >
      {state.partnerDoomscrolling && <DoomscrollOverlay />}
      <StatusBar
        barStyle="light-content"
        backgroundColor={state.proofOfLifeActive ? n.colors.errorSurface : n.colors.background}
      />
      <ResponsiveContainer>
        <View style={styles.header}>
          <TouchableOpacity onPress={actions.confirmStopLecture} style={styles.backBtn} testID="lecture-end-btn">
            <LinearText style={styles.backText}>← End</LinearText>
          </TouchableOpacity>
          <Ionicons name="tv-outline" size={20} color={n.colors.textPrimary} />
          <LinearText style={styles.headerTitle}>Hostage Mode</LinearText>
          <FocusAudioPlayer />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {state.focusState !== 'focused' && !state.onBreak && (
            <LinearSurface padded={false} style={[styles.hostageInfo, { borderColor: n.colors.error }]}>
              <Ionicons name="eye-outline" size={32} color={n.colors.error} />
              <LinearText style={[styles.hostageText, { color: n.colors.error }]}>
                Face not detected or distracted! Look at your study materials!
              </LinearText>
            </LinearSurface>
          )}

          {!state.proofOfLifeActive && state.elapsed < 60 && (
            <LinearSurface padded={false} style={styles.hostageInfo}>
              <Ionicons name="phone-portrait-outline" size={32} color={n.colors.textPrimary} />
              <LinearText style={styles.hostageText}>
                Put this phone face up on your desk. Watch the lecture on your tablet. If you close
                this app to doomscroll, your phone will scream at you.
              </LinearText>
            </LinearSurface>
          )}

          <LinearSurface style={[styles.timerBox, state.proofOfLifeActive && styles.timerBoxWarn]} testID="lecture-timer">
            <LinearText style={styles.timerLabel}>Lecture Time</LinearText>
            <LinearText
              style={[styles.timer, state.proofOfLifeActive && styles.timerWarn]}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
            >
              {mins}:{secs.toString().padStart(2, '0')}
            </LinearText>
          </LinearSurface>

          {state.proofWarningActive && !state.proofOfLifeActive && (
            <LinearSurface padded={false} style={styles.proofWarnBanner}>
              <LinearText style={styles.proofWarnText}>⚠️ Listening check in 30s — get ready to type!</LinearText>
            </LinearSurface>
          )}

          {state.proofOfLifeActive && (
            <ProofOfLifeChallenge countdown={state.proofOfLifeCountdown} />
          )}

          {!state.selectedSubjectId ? (
            <View style={styles.subjectSection}>
              <LinearText style={styles.sectionLabel}>What subject are you watching?</LinearText>
              <View style={styles.subjectGrid}>
                {state.subjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.subjectChip, { borderColor: s.colorHex }]}
                    onPress={() => actions.setSelectedSubjectId(s.id)}
                    activeOpacity={0.8}
                  >
                    <LinearText style={[styles.subjectChipText, { color: s.colorHex }]}>{s.shortCode}</LinearText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <LinearSurface padded={false} style={styles.selectedSubject}>
              <LinearText style={styles.selectedSubjectText}>
                {state.subjects.find((s) => s.id === state.selectedSubjectId)?.name}
              </LinearText>
              <TouchableOpacity onPress={() => actions.setSelectedSubjectId(null)}>
                <LinearText style={styles.changeBtn}>Change</LinearText>
              </TouchableOpacity>
            </LinearSurface>
          )}

          <TouchableOpacity
            style={[styles.transcribeBtn, state.isRecordingEnabled && styles.transcribeBtnActive]}
            onPress={actions.toggleAutoScribe}
            activeOpacity={0.8}
            testID="auto-scribe-btn"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {state.isRecordingEnabled && <View style={styles.recordingDot} />}
              {!state.isRecordingEnabled && <Ionicons name="mic-outline" size={18} color="#fff" />}
              <LinearText style={styles.transcribeBtnText}>
                {state.isRecordingEnabled ? 'AUTO-SCRIBE ACTIVE — Recording' : 'Enable Auto-Scribe'}
              </LinearText>
            </View>
            {state.isTranscribing && (
              <LinearText style={{ color: n.colors.textInverse, fontSize: 11 }}>
                Processing chunk...
              </LinearText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.transcribeBtn, styles.importTranscribeBtn]}
            onPress={actions.importAndTranscribeAudio}
            activeOpacity={0.8}
            testID="import-transcribe-btn"
          >
            <LinearText style={styles.transcribeBtnText}>📁 Import Audio & Transcribe</LinearText>
          </TouchableOpacity>

          <View style={styles.noteSection}>
            <TextInput
              style={[
                styles.noteInput,
                state.proofOfLifeActive && styles.noteInputWarn,
                state.currentNote.trim() && state.proofOfLifeActive && styles.noteInputActive,
              ]}
              placeholder={
                state.proofOfLifeActive
                  ? 'Type here immediately to dismiss alarm...'
                  : "Type a key concept to prove you're listening..."
              }
              placeholderTextColor={state.proofOfLifeActive ? n.colors.error + 'AA' : n.colors.textMuted}
              multiline
              value={state.currentNote}
              onChangeText={actions.setCurrentNote}
              testID="lecture-note-input"
            />
            <TouchableOpacity
              style={[
                styles.saveBtn,
                !state.currentNote.trim() && styles.saveBtnDisabled,
                state.proofOfLifeActive && styles.saveBtnWarn,
              ]}
              onPress={actions.saveNote}
              activeOpacity={0.8}
              testID="save-note-btn"
            >
              <LinearText style={styles.saveBtnText}>
                {state.proofOfLifeActive ? 'CONFIRM LISTENING' : 'Save Note'}
              </LinearText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.breakTriggerBtn} onPress={actions.startBreak}>
              <LinearText style={styles.breakTriggerText}>☕ Take 5m Break</LinearText>
            </TouchableOpacity>
          </View>

          {state.notes.length > 0 && (
            <View style={styles.savedNotes}>
              <LinearText style={styles.sectionLabel}>Proof of Focus ({state.notes.length})</LinearText>
              {state.notes.map((note, i) => (
                <View key={i} style={styles.noteRow}>
                  <LinearText style={styles.noteDot}>·</LinearText>
                  <LinearText style={styles.noteText}>{note}</LinearText>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
