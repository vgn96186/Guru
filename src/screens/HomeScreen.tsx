import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Alert, ActivityIndicator, Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import ExternalToolsRow from '../components/ExternalToolsRow';
import LectureReturnSheet from '../components/LectureReturnSheet';
import StartButton from '../components/StartButton';
import LoadingOrb from '../components/LoadingOrb';
import { getDailyLog, getDaysToExam, useStreakShield, getReviewDueTopics } from '../db/queries/progress';
import { getSubjectById } from '../db/queries/topics';
import { connectToRoom } from '../services/deviceSyncService';
import * as DocumentPicker from 'expo-document-picker';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { saveTranscriptToFile } from '../services/transcriptStorage';
import {
  buildQuickLectureNote,
  markTopicsFromLecture,
  transcribeAudio,
} from '../services/transcriptionService';
import { getDb } from '../db/database';
import { ResponsiveContainer } from '../hooks/useResponsive';
import Svg, { Circle } from 'react-native-svg';
import { showToast } from '../components/Toast';
import { useHomeDashboardData } from '../hooks/useHomeDashboardData';
import { useLectureReturnRecovery, type LectureReturnSheetData } from '../hooks/useLectureReturnRecovery';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

// Progress ring constants
const RING_SIZE = 48;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { profile, levelInfo, refreshProfile } = useAppStore();
  const {
    weakTopics,
    dueTopics,
    todayTasks,
    todayMinutes,
    completedSessions,
    isLoading,
    reload: reloadHomeDashboard,
  } = useHomeDashboardData({ refreshProfile });
  const [isTranscribingUpload, setIsTranscribingUpload] = useState(false);
  const [uploadTranscript, setUploadTranscript] = useState('');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const moreAnim = useRef(new Animated.Value(0)).current;

  function toggleMore() {
    const next = !moreExpanded;
    setMoreExpanded(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(moreAnim, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: false }).start();
  }

  // LectureReturnSheet state
  const [returnSheet, setReturnSheet] = useState<LectureReturnSheetData | null>(null);
  const lectureStartAlertVisibleRef = useRef(false);
  useLectureReturnRecovery({ onRecovered: setReturnSheet });

  useEffect(() => {
    if (profile?.syncCode) {
      const unsubscribe = connectToRoom(profile.syncCode, (msg: any) => {
        if (msg.type === 'BREAK_STARTED') {
          navigation.getParent()?.navigate('BreakEnforcer', { durationSeconds: msg.durationSeconds });
        }
        if (msg.type === 'LECTURE_STARTED') {
          if (lectureStartAlertVisibleRef.current) return;
          lectureStartAlertVisibleRef.current = true;
          const sub = getSubjectById(msg.subjectId);
          const openLectureMode = () => {
            lectureStartAlertVisibleRef.current = false;
            navigation.navigate('LectureMode', { subjectId: msg.subjectId });
          };
          Alert.alert('Lecture Detected', `Your tablet just started a ${sub?.name || 'lecture'}. Your phone is now entering Hostage Mode.`, [
            { text: 'Okay', onPress: openLectureMode }
          ], {
            cancelable: true,
            onDismiss: () => {
              lectureStartAlertVisibleRef.current = false;
            },
          });
        }
      });
      return unsubscribe;
    }
  }, [profile?.syncCode]);

  if (isLoading || !profile || !levelInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <LoadingOrb message="Loading your progress..." />
      </SafeAreaView>
    );
  }

  const daysToInicet = getDaysToExam(profile.inicetDate);
  const daysToNeetPg = getDaysToExam(profile.neetDate);
  const mood = getDailyLog()?.mood ?? 'good';
  const reviewDue = getReviewDueTopics();
  const overdueReviews = reviewDue.filter(r => r.daysOverdue > 0);

  // Micro-commitment ladder
  const daysSinceActive = (() => {
    if (!profile.lastActiveDate) return 999;
    const last = new Date(profile.lastActiveDate);
    const now = new Date();
    return Math.floor((now.getTime() - last.getTime()) / 86400000);
  })();
  const startLabel = daysSinceActive >= 4 ? 'JUST 1 QUESTION' : daysSinceActive >= 2 ? 'JUST 5 MINUTES' : 'START SESSION';
  const startSublabel = daysSinceActive >= 4 ? 'One question. That\'s it.' : daysSinceActive >= 2 ? 'A tiny win to get back on track' : `~${profile.preferredSessionLength} min`;

  // Daily progress
  const dailyGoalRaw = Number(profile.dailyGoalMinutes);
  const dailyGoal = Number.isFinite(dailyGoalRaw) && dailyGoalRaw > 0 ? dailyGoalRaw : 120;
  const progressPercentRaw = Math.round((todayMinutes / dailyGoal) * 100);
  const progressPercent = Number.isFinite(progressPercentRaw) ? progressPercentRaw : 0;
  const progressClamped = Math.min(100, Math.max(0, progressPercent));
  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * progressClamped) / 100;

  function handleStartSession() {
    navigation.navigate('Session', { mood });
  }

  function handleLogExternal(appId: string) {
    navigation.navigate('ManualLog', { appId });
  }

  function handleRepairStreak() {
    const success = useStreakShield();
    if (success) {
      refreshProfile();
      Alert.alert('Shield Used', 'Your streak has been repaired!');
    } else {
      Alert.alert('No Shields', 'You are out of streak shields!');
    }
  }

  async function handleAudioUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
      if (result.canceled) return;

      const uri = result.assets[0]?.uri;
      if (!uri) return;

      setIsTranscribingUpload(true);
      let analysis;
      try {
        analysis = await transcribeAudio(uri);
      } catch (err: any) {
        Alert.alert('Transcription Required', err?.message ?? 'Enable Local Whisper or add a Groq API key in Settings.');
        return;
      }

      if (!analysis.transcript || analysis.lectureSummary === 'No medical content detected') {
        Alert.alert('No Speech Detected', 'No usable speech was found in this audio file.');
        return;
      }

      const db = getDb();
      if (analysis.topics.length > 0) {
        markTopicsFromLecture(db, analysis.topics, analysis.estimatedConfidence, analysis.subject);
      }

      const quickNote = buildQuickLectureNote(analysis);
      const transcriptUri = await saveTranscriptToFile(analysis.transcript);
      const subjectRow = db.getFirstSync<{ id: number }>(
        'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [analysis.subject],
      );
      saveLectureTranscript({
        subjectId: subjectRow?.id ?? null,
        note: quickNote,
        transcript: typeof transcriptUri !== 'undefined' ? transcriptUri : analysis.transcript,
        summary: analysis.lectureSummary,
        topics: analysis.topics,
        appName: 'Uploaded Audio',
        confidence: analysis.estimatedConfidence,
      });

      void reloadHomeDashboard();
      setUploadTranscript(quickNote);
      setShowTranscriptModal(true);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message);
    } finally {
      setIsTranscribingUpload(false);
    }
  }

  const nextPlannedTask = todayTasks[0] ?? null;
  const heroCta = (() => {
    if (overdueReviews.length > 0) {
      return {
        label: 'REVIEW OVERDUE TOPICS',
        sublabel: `${overdueReviews.length} overdue · ${overdueReviews[0].topicName}`,
        onPress: () => navigation.navigate('Session', {
          mood: 'good',
          focusTopicIds: overdueReviews.slice(0, 4).map(item => item.topicId),
          preferredActionType: 'review',
        }),
      };
    }
    if (nextPlannedTask) {
      return {
        label: 'START NEXT TASK',
        sublabel: `${nextPlannedTask.topic.name} · ${nextPlannedTask.type === 'review' ? 'Review' : nextPlannedTask.type === 'deep_dive' ? 'Deep dive' : 'New topic'}`,
        onPress: () => navigation.navigate('Session', {
          mood,
          mode: nextPlannedTask.type === 'deep_dive' ? 'deep' : undefined,
          focusTopicId: nextPlannedTask.topic.id,
          preferredActionType: nextPlannedTask.type,
        }),
      };
    }
    if (weakTopics.length > 0) {
      return {
        label: 'FIX A WEAK SPOT',
        sublabel: weakTopics[0].name,
        onPress: () => navigation.navigate('Session', {
          mood: 'energetic',
          mode: 'deep',
          focusTopicId: weakTopics[0].id,
          preferredActionType: 'deep_dive',
        }),
      };
    }
    return {
      label: startLabel,
      sublabel: startSublabel,
      onPress: handleStartSession,
    };
  })();

  const criticalItems = (() => {
    const items: Array<{
      key: string;
      title: string;
      sub: string;
      accent: string;
      badge: string;
      onPress: () => void;
    }> = [];

    if (overdueReviews.length > 0) {
      items.push({
        key: 'overdue',
        title: `${overdueReviews.length} overdue review${overdueReviews.length > 1 ? 's' : ''}`,
        sub: overdueReviews.slice(0, 2).map(item => item.topicName).join(', '),
        accent: '#F97316',
        badge: 'OVERDUE',
        onPress: () => navigation.navigate('Session', {
          mood: 'good',
          focusTopicIds: overdueReviews.slice(0, 4).map(item => item.topicId),
          preferredActionType: 'review',
        }),
      });
    } else if (reviewDue.length > 0) {
      items.push({
        key: 'due',
        title: `${reviewDue.length} review${reviewDue.length > 1 ? 's' : ''} due today`,
        sub: reviewDue.slice(0, 2).map(item => item.topicName).join(', '),
        accent: '#4CAF50',
        badge: 'DUE',
        onPress: () => navigation.navigate('Review'),
      });
    }

    if (weakTopics.length > 0) {
      items.push({
        key: 'weak',
        title: `${weakTopics.length} weak topic${weakTopics.length > 1 ? 's' : ''} need attention`,
        sub: weakTopics[0].name,
        accent: '#FF9800',
        badge: 'WEAK',
        onPress: () => navigation.navigate('BossBattle'),
      });
    }

    if (nextPlannedTask) {
      items.push({
        key: 'next',
        title: 'Next planned topic',
        sub: `${nextPlannedTask.topic.name} · ${nextPlannedTask.timeLabel}`,
        accent: '#6C63FF',
        badge: nextPlannedTask.type === 'review' ? 'REVIEW' : nextPlannedTask.type === 'deep_dive' ? 'DEEP' : 'NEW',
        onPress: () => navigation.navigate('Session', {
          mood,
          mode: nextPlannedTask.type === 'deep_dive' ? 'deep' : undefined,
          focusTopicId: nextPlannedTask.topic.id,
          preferredActionType: nextPlannedTask.type,
        }),
      });
    }

    if (items.length === 0) {
      items.push({
        key: 'challenge',
        title: 'Daily challenge',
        sub: '5 rapid-fire questions from weak topics',
        accent: '#6C63FF',
        badge: 'GO',
        onPress: () => navigation.navigate('DailyChallenge'),
      });
    }

    return items.slice(0, 3);
  })();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} testID="home-scroll">
        <ResponsiveContainer style={styles.content}>

          {/* TEMP: loud dev-only banner to confirm bundle */}
          <View style={styles.devBanner}>
            <Text style={styles.devBannerText}>GURU DEV BUILD · HOME UI</Text>
          </View>

          {/* ── 1. Compact Status Row ── */}
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              {profile.streakCurrent > 0 && (
                <View style={styles.streakChip}>
                  <Text style={styles.streakText}>🔥 {profile.streakCurrent}</Text>
                </View>
              )}
              <View style={styles.levelChip}>
                <Text style={styles.levelText}>Lv {levelInfo.level}</Text>
              </View>
              {/* Inline progress ring */}
              <View style={styles.ringWrap}>
                <Svg width={RING_SIZE} height={RING_SIZE}>
                  <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RADIUS} stroke="#2A2A38" strokeWidth={STROKE_WIDTH} fill="transparent" />
                  <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RADIUS} stroke={progressClamped >= 100 ? '#4CAF50' : '#6C63FF'} strokeWidth={STROKE_WIDTH} fill="transparent" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset} strokeLinecap="round" rotation="-90" origin={`${RING_SIZE/2}, ${RING_SIZE/2}`} />
                </Svg>
                <View style={[StyleSheet.absoluteFill, styles.ringLabel]} pointerEvents="none">
                  <Text style={styles.ringPercent}>{progressClamped}%</Text>
                </View>
              </View>
            </View>
            <View style={styles.statusRight}>
              <Text style={styles.countdown}>INICET {daysToInicet}d</Text>
              <Text style={styles.countdownSecondary}>NEET-PG {daysToNeetPg}d</Text>
              <Text style={styles.todayMin}>{todayMinutes}/{dailyGoal} min today</Text>
            </View>
          </View>

          {/* Streak repair nudge (only when broken + had streak before) */}
          {profile.streakCurrent === 0 && profile.streakBest > 0 && (
            <TouchableOpacity style={styles.repairNudge} onPress={handleRepairStreak} activeOpacity={0.8}>
              <Text style={styles.repairText}>🛡️ Your {profile.streakBest}-day streak broke. Tap to use a shield.</Text>
            </TouchableOpacity>
          )}

          {/* ── 2. External Apps — the main flow ── */}
          <ExternalToolsRow onLogSession={handleLogExternal} />

          {/* ── 3. Hero Start Button ── */}
          <View style={styles.startArea}>
            <StartButton
              onPress={handleStartSession}
              label={startLabel}
              sublabel={startSublabel}
            />
          </View>

          {/* Task paralysis — subtle inline link, not a big button */}
          {daysSinceActive >= 2 && (
            <TouchableOpacity
              style={styles.paralysisLink}
              onPress={() => navigation.navigate('Inertia')}
              activeOpacity={0.7}
              testID="task-paralysis-btn"
            >
              <Text style={styles.paralysisText}>Can't start? Tap here.</Text>
            </TouchableOpacity>
          )}

          <View style={styles.criticalSection}>
            <Text style={styles.sectionLabel}>CRITICAL NOW</Text>
            {criticalItems.map(item => (
              <TouchableOpacity
                key={item.key}
                style={[styles.criticalCard, { borderColor: item.accent + '44' }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); item.onPress(); }}
                activeOpacity={0.8}
              >
                <View style={styles.criticalCardTop}>
                  <Text style={[styles.criticalBadge, { color: item.accent }]}>{item.badge}</Text>
                  <Text style={[styles.criticalArrow, { color: item.accent }]}>›</Text>
                </View>
                <Text style={styles.criticalTitle}>{item.title}</Text>
                <Text style={styles.criticalSub}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.coreActionsSection}>
            <Text style={styles.sectionLabel}>CORE TOOLS</Text>
            <TouchableOpacity style={styles.coreActionWide} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('LectureMode', {}); }} activeOpacity={0.8} testID="lecture-mode-btn">
              <Text style={styles.coreActionWideTitle}>Lecture Mode</Text>
              <Text style={styles.coreActionWideSub}>Capture and summarize lectures</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.coreActionWide, { marginTop: 12 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('FlaggedReview'); }} activeOpacity={0.8}>
              <Text style={styles.coreActionWideTitle}>Flagged Review</Text>
              <Text style={styles.coreActionWideSub}>Return to topics you explicitly marked for later</Text>
            </TouchableOpacity>
          </View>

          {/* ── 5. Today's Agenda (max 2 items) ── */}
          {todayTasks.length > 0 && (
            <View style={styles.agendaSection}>
              <Text style={styles.sectionLabel}>UP NEXT</Text>
              {todayTasks.map((task, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.agendaRow, i === 0 && styles.agendaRowFirst]}
                  onPress={() => navigation.navigate('Session', {
                    mood,
                    mode: task.type === 'deep_dive' ? 'deep' : undefined,
                    focusTopicId: task.topic.id,
                    preferredActionType: task.type,
                  })}
                  activeOpacity={0.7}
                >
                  <View style={styles.agendaTime}>
                    <Text style={styles.agendaTimeText}>{task.timeLabel.split(' - ')[0]}</Text>
                  </View>
                  <View style={[styles.agendaCard, task.type === 'review' && styles.agendaReview, task.type === 'deep_dive' && styles.agendaDeep]}>
                    <Text style={styles.agendaTitle} numberOfLines={1}>{task.topic.name}</Text>
                    <Text style={styles.agendaSub}>{task.type === 'review' ? 'REVIEW' : task.type === 'deep_dive' ? 'DEEP DIVE' : 'NEW'} · {task.topic.subjectName}</Text>
                    <View style={styles.agendaBadgeRow}>
                      {task.type === 'review' && <Text style={styles.agendaBadge}>Due now</Text>}
                      {task.type === 'deep_dive' && <Text style={styles.agendaBadge}>Weak topic</Text>}
                      {task.topic.inicetPriority >= 8 && <Text style={styles.agendaBadge}>High yield</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => navigation.navigate('StudyPlan')} activeOpacity={0.7}>
                <Text style={styles.seeAllLink}>See full plan →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── 6. More — everything else, collapsed ── */}
          <TouchableOpacity
            style={styles.moreHeader}
            onPress={toggleMore}
            activeOpacity={0.7}
            testID="more-header"
          >
            <Text style={styles.sectionLabel}>MORE</Text>
            <Animated.Text style={[styles.moreChevron, { transform: [{ rotate: moreAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }]}>▼</Animated.Text>
          </TouchableOpacity>

          <Animated.View style={{ maxHeight: moreAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }), opacity: moreAnim, overflow: 'hidden' }}>
            <View style={styles.moreContent}>
              <Text style={styles.moreGroupLabel}>QUICK START</Text>
              {/* Quick modes */}
              <View style={styles.moreRow}>
                <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Session', { mood, mode: 'sprint' }); }} activeOpacity={0.8}>
                  <Text style={styles.moreBtnText}>⚡ 10m Sprint</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('MockTest'); }} activeOpacity={0.8}>
                  <Text style={styles.moreBtnText}>📝 Mock Test</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.moreRow}>
                <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('DailyChallenge'); }} activeOpacity={0.8}>
                  <Text style={styles.moreBtnText}>⚡ Daily Challenge</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('BossBattle'); }} activeOpacity={0.8}>
                  <Text style={styles.moreBtnText}>👹 Boss Battle</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.moreGroupLabel}>AI TOOLS</Text>
              {/* Tools */}
              <TouchableOpacity style={styles.moreLink} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.getParent()?.navigate('BrainDumpReview'); }}>
                <Text style={styles.moreLinkText}>🧠 Review Parked Thoughts</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.moreLink, isTranscribingUpload && { opacity: 0.7 }]}
                onPress={handleAudioUpload}
                disabled={isTranscribingUpload}
              >
                <View style={styles.moreLinkRow}>
                  <Text style={styles.moreLinkText}>
                    {isTranscribingUpload ? '🎙️ Transcribing audio…' : '🎙️ Transcribe Audio'}
                  </Text>
                  {isTranscribingUpload && <ActivityIndicator size="small" color="#6C63FF" />}
                </View>
              </TouchableOpacity>

              <Text style={styles.moreGroupLabel}>CHALLENGES & UTILITIES</Text>
              {/* Challenges */}
              <TouchableOpacity style={styles.moreLink} onPress={() => navigation.getParent()?.navigate('Lockdown', { duration: 300 })}>
                <Text style={[styles.moreLinkText, { color: '#F44336' }]}>⛓️ Force Lockdown</Text>
              </TouchableOpacity>

              {/* Utilities */}
              <TouchableOpacity style={styles.moreLink} onPress={() => navigation.getParent()?.navigate('SleepMode')}>
                <Text style={styles.moreLinkText}>🌙 Nightstand Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreLink} onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}>
                <Text style={styles.moreLinkText}>📱 App Hijack Setup</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreLink} onPress={() => navigation.navigate('Inertia')}>
                <Text style={styles.moreLinkText}>🐢 Task Paralysis Helper</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Bottom breathing room */}
          <View style={{ height: 40 }} />
        </ResponsiveContainer>
      </ScrollView>

      {returnSheet && (
        <LectureReturnSheet
          visible={!!returnSheet}
          appName={returnSheet.appName}
          durationMinutes={returnSheet.durationMinutes}
          recordingPath={returnSheet.recordingPath}
          logId={returnSheet.logId}
          groqKey={profile?.groqApiKey ?? ''}
          onDone={() => {
            setReturnSheet(null);
          }}
          onStudyNow={() => {
            setReturnSheet(null);
          }}
        />
      )}

      <Modal
        visible={showTranscriptModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTranscriptModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Transcription Result</Text>
            <Text style={styles.modalHint}>Saved to lecture notes and used to update matching topics.</Text>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              <Text style={styles.modalText}>{uploadTranscript}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowTranscriptModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  scroll: { flex: 1 },
  content: { paddingBottom: 0 },

  // Dev-only banner to confirm we are on the right JS bundle
  devBanner: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FF1744',
    borderWidth: 1,
    borderColor: '#FF8A80',
  },
  devBannerText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 1,
  },

  // ── 1. Status Row ──
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakChip: {
    backgroundColor: '#2A1A00',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  streakText: { color: '#FF9800', fontWeight: '700', fontSize: 13 },
  levelChip: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  levelText: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  ringPercent: { color: '#fff', fontWeight: '800', fontSize: 11 },
  statusRight: { alignItems: 'flex-end' },
  countdown: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  countdownSecondary: { color: '#8F95A7', fontWeight: '700', fontSize: 12, marginTop: 2 },
  todayMin: { color: '#DCE6FF', fontSize: 13, marginTop: 2, fontWeight: '600' },

  // Streak repair
  repairNudge: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#2A1A0A',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FF980033',
  },
  repairText: { color: '#FF9800', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  // ── 3. Start Button ──
  startArea: { alignItems: 'center', paddingVertical: 24 },
  notesHubCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#2B3040',
  },
  notesHubCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  notesHubEyebrow: {
    color: '#8AB4FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  notesHubArrow: { color: '#8AB4FF', fontSize: 22, fontWeight: '700' },
  notesHubTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  notesHubText: { color: '#C4CCDA', fontSize: 14, lineHeight: 21 },
  notesHubMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  notesHubMeta: {
    color: '#DCE6FF',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: '#22293A',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Task paralysis — pill button
  paralysisLink: {
    alignSelf: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1A1A24',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  paralysisText: { color: '#BCC2D0', fontSize: 13 },

  criticalSection: { paddingHorizontal: 16, marginBottom: 18 },
  criticalCard: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  criticalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  criticalBadge: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  criticalArrow: { fontSize: 20, fontWeight: '800' },
  criticalTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  criticalSub: { color: '#9CA3B5', fontSize: 13, lineHeight: 19 },

  coreActionsSection: { paddingHorizontal: 16, marginBottom: 18 },
  coreActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  coreActionCard: {
    flex: 1,
    backgroundColor: '#171722',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 14,
  },
  coreActionTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  coreActionSub: { color: '#99A2B6', fontSize: 12, lineHeight: 18 },
  coreActionWide: {
    backgroundColor: '#171722',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 14,
  },
  coreActionWideTitle: { color: '#FFB34D', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  coreActionWideSub: { color: '#99A2B6', fontSize: 12, lineHeight: 18 },

  // ── 5. Agenda ──
  agendaSection: { paddingHorizontal: 16, marginBottom: 18 },
  sectionLabel: { color: '#9399AA', fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 10 },
  agendaRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'center' },
  agendaRowFirst: {},
  agendaTime: { width: 44, alignItems: 'flex-end', marginRight: 10 },
  agendaTimeText: { color: '#B1B7C5', fontSize: 12, fontWeight: '700' },
  agendaCard: { flex: 1, backgroundColor: '#1A1A24', padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#6C63FF' },
  agendaReview: { borderLeftColor: '#4CAF50' },
  agendaDeep: { borderLeftColor: '#F44336' },
  agendaTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  agendaSub: { color: '#A4A9B8', fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  agendaBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  agendaBadge: {
    color: '#D7DEEC',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#262938',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  seeAllLink: { color: '#6C63FF', fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'right' },

  // ── 6. More ──
  moreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  moreChevron: { color: '#A0A6B7', fontSize: 12 },
  moreContent: { paddingHorizontal: 16 },
  moreGroupLabel: { color: '#8F95A7', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 6, marginBottom: 8 },
  moreRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  moreBtn: {
    flex: 1,
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  moreBtnText: { color: '#CED2DB', fontWeight: '600', fontSize: 13 },
  moreLink: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A24' },
  moreLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  moreLinkText: { color: '#CFD4DF', fontSize: 14, flexShrink: 1, lineHeight: 20 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#171722',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A38',
    maxHeight: '75%',
    padding: 16,
  },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  modalHint: { color: '#A6ABBC', fontSize: 12, marginTop: 4, marginBottom: 10 },
  modalBody: { backgroundColor: '#101019', borderRadius: 10 },
  modalBodyContent: { padding: 12 },
  modalText: { color: '#E6E9EF', fontSize: 14, lineHeight: 20 },
  modalCloseBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalCloseText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
