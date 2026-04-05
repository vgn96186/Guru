import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { getAllSubjects, getTopicsBySubject, updateTopicProgress } from '../db/queries/topics';
import { createSession, endSession } from '../db/queries/sessions';
import { linearTheme as n } from '../theme/linearTheme';
import { STREAK_MIN_MINUTES } from '../constants/gamification';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { EXTERNAL_APPS } from '../constants/externalApps';
import type { Subject, TopicWithProgress } from '../types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import LinearButton from '../components/primitives/LinearButton';
import LinearText from '../components/primitives/LinearText';
import LinearSurface from '../components/primitives/LinearSurface';

type Nav = NativeStackNavigationProp<any, 'ManualLog'>;
type Route = RouteProp<any, 'ManualLog'>;

export default function ManualLogScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [selectedAppId, setSelectedAppId] = useState<string | null>(route.params?.appId ?? null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [subjectTopics, setSubjectTopics] = useState<TopicWithProgress[]>([]);
  const [topicName, setTopicName] = useState('');
  const [duration, setDuration] = useState('30');
  const [submitting, setSubmitting] = useState(false);

  if (!selectedSubjectId) {
    if (subjectTopics.length > 0) setSubjectTopics([]);
    if (selectedTopicId !== null) setSelectedTopicId(null);
  }

  useEffect(() => {
    let active = true;
    void getAllSubjects().then((res) => {
      if (active) setSubjects(res);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (selectedSubjectId) {
      void getTopicsBySubject(selectedSubjectId).then((topics) => {
        if (!active) return;
        const filtered = topics.filter((t) => !t.parentTopicId).slice(0, 8);
        setSubjectTopics(filtered);
        setSelectedTopicId(null);
      });
    }
    return () => {
      active = false;
    };
  }, [selectedSubjectId]);

  async function handleSubmit() {
    if (submitting) return;
    const mins = parseInt(duration) || 0;
    if (mins <= 0) {
      Alert.alert('Invalid Duration', 'Please enter a duration greater than 0 minutes.');
      return;
    }

    setSubmitting(true);
    try {
      // Log the session
      const sessionId = await createSession([], 'good', 'external'); // external mode

      // Calculate XP: 10 XP per minute for external study (slightly less than Guru active study)
      const xp = mins * 10;

      // End immediately (it's a retroactive log)
      // We pass [] as completed topic IDs since we don't track granular topics externally yet,
      // unless we create a dummy topic? For now, just log XP and time.
      await endSession(sessionId, [], xp, mins);

      // Update SRS for selected topic if applicable
      if (selectedTopicId) {
        const confidence = mins >= 60 ? 4 : mins >= 30 ? 3 : 2;
        await updateTopicProgress(selectedTopicId, 'seen', confidence, xp);
      }

      // Update streak if above minimum
      await profileRepository.updateStreak(mins >= STREAK_MIN_MINUTES);

      await refreshProfile();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag">
        <ResponsiveContainer>
          <LinearText variant="title" style={styles.title}>
            Log External Study
          </LinearText>
          <LinearText variant="bodySmall" tone="secondary" style={styles.subtitle}>
            Did you watch a video on Cerebellum or solve MCQs on Marrow? Log it here to keep your
            streak alive!
          </LinearText>

          <LinearText variant="label" tone="accent" style={styles.label}>
            Which App?
          </LinearText>
          <View style={styles.appGrid}>
            {EXTERNAL_APPS.map((app) => (
              <TouchableOpacity
                key={app.id}
                style={[styles.appBtn, selectedAppId === app.id && styles.appBtnActive]}
                onPress={() => setSelectedAppId(app.id)}
              >
                <LinearText style={styles.appIcon}>{app.iconEmoji}</LinearText>
                <LinearText
                  variant="chip"
                  style={[styles.appName, selectedAppId === app.id && styles.appNameActive]}
                >
                  {app.name}
                </LinearText>
              </TouchableOpacity>
            ))}
          </View>

          <LinearText variant="label" tone="accent" style={styles.label}>
            Subject (Optional)
          </LinearText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.subjectScroll}
          >
            {subjects.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.subjectChip,
                  selectedSubjectId === s.id && { backgroundColor: s.colorHex },
                ]}
                onPress={() => setSelectedSubjectId(s.id === selectedSubjectId ? null : s.id)}
              >
                <LinearText
                  variant="chip"
                  tone={selectedSubjectId === s.id ? 'inverse' : 'primary'}
                  style={styles.subjectText}
                >
                  {s.shortCode}
                </LinearText>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {subjectTopics.length > 0 && (
            <>
              <LinearText variant="label" tone="accent" style={styles.label}>
                Topic Studied (Optional)
              </LinearText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.subjectScroll}
              >
                {subjectTopics.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.subjectChip,
                      styles.topicChip,
                      selectedTopicId === t.id && { backgroundColor: n.colors.accent },
                    ]}
                    onPress={() => setSelectedTopicId(t.id === selectedTopicId ? null : t.id)}
                  >
                    <LinearText
                      variant="chip"
                      tone={selectedTopicId === t.id ? 'inverse' : 'primary'}
                      style={styles.subjectText}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {t.name}
                    </LinearText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <LinearText variant="label" tone="accent" style={styles.label}>
            Topic / Chapter Name
          </LinearText>
          <TextInput
            style={styles.input}
            placeholder="e.g. Heart Failure"
            placeholderTextColor={n.colors.textMuted}
            value={topicName}
            onChangeText={setTopicName}
          />

          <LinearText variant="label" tone="accent" style={styles.label}>
            Duration (minutes)
          </LinearText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.durationScroll}
          >
            {[15, 30, 45, 60, 90].map((mins) => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.durationChip,
                  duration === mins.toString() && styles.durationChipActive,
                ]}
                onPress={() => setDuration(mins.toString())}
              >
                <LinearText
                  variant="chip"
                  tone={duration === mins.toString() ? 'inverse' : 'primary'}
                  style={styles.durationText}
                >
                  {mins}m
                </LinearText>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            placeholder="45"
            placeholderTextColor={n.colors.textMuted}
          />

          <LinearButton
            variant="glassTinted"
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={`Log session, ${parseInt(duration || '0') * 10} XP`}
            label={submitting ? 'Logging…' : `Log Session (+${parseInt(duration || '0') * 10} XP)`}
          />
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: n.colors.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: n.colors.textSecondary, fontSize: 14, marginBottom: 24, lineHeight: 20 },
  label: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 10,
  },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  appBtn: {
    width: '30%',
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  appBtnActive: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.primaryTintSoft,
  },
  appIcon: { fontSize: 24, marginBottom: 4 },
  appName: { color: n.colors.textSecondary, fontSize: 11, fontWeight: '600' },
  appNameActive: { color: n.colors.textPrimary },
  subjectScroll: { flexDirection: 'row', marginBottom: 20 },
  durationScroll: { flexDirection: 'row', marginBottom: 12, marginTop: 4 },
  durationChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: n.colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  durationChipActive: { backgroundColor: n.colors.accent, borderColor: n.colors.accent },
  durationText: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  durationTextActive: { color: n.colors.textPrimary, fontWeight: '700' },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: n.colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  topicChip: { maxWidth: 200 },
  subjectText: { color: n.colors.textPrimary, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  input: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 14,
    color: n.colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 10,
  },
  submitBtn: {
    minHeight: 58,
    marginTop: 24,
  },
});
