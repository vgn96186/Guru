import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
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
import { theme } from '../constants/theme';
import { STREAK_MIN_MINUTES } from '../constants/gamification';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { EXTERNAL_APPS } from '../constants/externalApps';
import type { Subject, TopicWithProgress } from '../types';
import { ResponsiveContainer } from '../hooks/useResponsive';

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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag">
        <ResponsiveContainer>
          <Text style={styles.title}>Log External Study</Text>
          <Text style={styles.subtitle}>
            Did you watch a video on Cerebellum or solve MCQs on Marrow? Log it here to keep your
            streak alive!
          </Text>

          <Text style={styles.label}>Which App?</Text>
          <View style={styles.appGrid}>
            {EXTERNAL_APPS.map((app) => (
              <TouchableOpacity
                key={app.id}
                style={[styles.appBtn, selectedAppId === app.id && styles.appBtnActive]}
                onPress={() => setSelectedAppId(app.id)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${app.name}`}
                accessibilityState={{ selected: selectedAppId === app.id }}
              >
                <Text style={styles.appIcon}>{app.iconEmoji}</Text>
                <Text style={[styles.appName, selectedAppId === app.id && styles.appNameActive]}>
                  {app.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Subject (Optional)</Text>
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
                accessibilityRole="button"
                accessibilityLabel={`Subject ${s.shortCode}`}
                accessibilityState={{ selected: selectedSubjectId === s.id }}
              >
                <Text
                  style={[
                    styles.subjectText,
                    selectedSubjectId === s.id && { color: theme.colors.textInverse },
                  ]}
                >
                  {s.shortCode}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {subjectTopics.length > 0 && (
            <>
              <Text style={styles.label}>Topic Studied (Optional)</Text>
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
                      selectedTopicId === t.id && { backgroundColor: theme.colors.primary },
                    ]}
                    onPress={() => setSelectedTopicId(t.id === selectedTopicId ? null : t.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t.name}
                    accessibilityState={{ selected: selectedTopicId === t.id }}
                  >
                    <Text
                      style={[
                        styles.subjectText,
                        selectedTopicId === t.id && { color: theme.colors.textPrimary },
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <Text style={styles.label}>Topic / Chapter Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Heart Failure"
            placeholderTextColor={theme.colors.textMuted}
            value={topicName}
            onChangeText={setTopicName}
          />

          <Text style={styles.label}>Duration (minutes)</Text>
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
                accessibilityRole="button"
                accessibilityLabel={`${mins} minutes`}
                accessibilityState={{ selected: duration === mins.toString() }}
              >
                <Text
                  style={[
                    styles.durationText,
                    duration === mins.toString() && styles.durationTextActive,
                  ]}
                >
                  {mins}m
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input}
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            placeholder="45"
            placeholderTextColor={theme.colors.textMuted}
          />

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={`Log session, ${parseInt(duration || '0') * 10} XP`}
          >
            <Text style={styles.submitText}>
              {submitting ? 'Logging...' : `Log Session (+${parseInt(duration || '0') * 10} XP)`}
            </Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 14, marginBottom: 24, lineHeight: 20 },
  label: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 10,
  },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  appBtn: {
    width: '30%',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  appBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryTintSoft,
  },
  appIcon: { fontSize: 24, marginBottom: 4 },
  appName: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '600' },
  appNameActive: { color: theme.colors.textPrimary },
  subjectScroll: { flexDirection: 'row', marginBottom: 20 },
  durationScroll: { flexDirection: 'row', marginBottom: 12, marginTop: 4 },
  durationChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  durationChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  durationText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  durationTextActive: { color: theme.colors.textPrimary, fontWeight: '700' },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  topicChip: { maxWidth: 200 },
  subjectText: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: 12,
    padding: 14,
    color: theme.colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 24,
  },
  submitText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 16 },
});
