import React, { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { z } from 'zod';
import { getAllSubjects, getTopicsBySubject, updateTopicProgress } from '../db/queries/topics';
import { createSession, endSession } from '../db/queries/sessions';
import { linearTheme as n } from '../theme/linearTheme';
import { STREAK_MIN_MINUTES } from '../constants/gamification';
import { profileRepository } from '../db/repositories';
import { useRefreshProfile } from '../hooks/queries/useProfile';
import { EXTERNAL_APPS } from '../constants/externalApps';
import type { Subject, TopicWithProgress } from '../types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useAsyncData, useAsyncEffect } from '../hooks/useAsyncData';
import LinearButton from '../components/primitives/LinearButton';
import LinearText from '../components/primitives/LinearText';
import { HomeNav } from '../navigation/typedHooks';
const ManualLogFormSchema = z.object({
  topicName: z
    .string()
    .trim()
    .max(120, 'Keep the topic name under 120 characters.')
    .optional()
    .or(z.literal('')),
  duration: z
    .string()
    .trim()
    .min(1, 'Duration is required.')
    .refine((value) => {
      const mins = Number.parseInt(value, 10);
      return Number.isFinite(mins) && mins > 0;
    }, 'Please enter a duration greater than 0 minutes.'),
});

type ManualLogFormValues = z.infer<typeof ManualLogFormSchema>;

export default function ManualLogScreen() {
  const navigation = HomeNav.useNav<'ManualLog'>();
  const route = HomeNav.useRoute<'ManualLog'>();
  const refreshProfile = useRefreshProfile();
  const { data: subjects = [] } = useAsyncData<Subject[]>(getAllSubjects, [], { initial: [] });
  const [selectedAppId, setSelectedAppId] = useState<string | null>(route.params?.appId ?? null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [subjectTopics, setSubjectTopics] = useState<TopicWithProgress[]>([]);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ManualLogFormValues>({
    resolver: zodResolver(ManualLogFormSchema),
    defaultValues: {
      topicName: '',
      duration: '30',
    },
  });

  const duration = watch('duration') ?? '0';
  const projectedXp = (Number.parseInt(duration, 10) || 0) * 10;

  useAsyncEffect(
    async (isActive) => {
      if (!selectedSubjectId) {
        setSubjectTopics([]);
        setSelectedTopicId(null);
        return;
      }
      const topics = await getTopicsBySubject(selectedSubjectId);
      if (!isActive()) return;
      setSubjectTopics(topics.filter((topic) => !topic.parentTopicId).slice(0, 8));
      setSelectedTopicId(null);
    },
    [selectedSubjectId],
  );

  async function handleValidSubmit(values: ManualLogFormValues) {
    const mins = Number.parseInt(values.duration, 10) || 0;
    const xp = mins * 10;

    const sessionId = await createSession([], 'good', 'external');
    await endSession(sessionId, [], xp, mins);

    if (selectedTopicId) {
      const confidence = mins >= 60 ? 4 : mins >= 30 ? 3 : 2;
      await updateTopicProgress(selectedTopicId, 'seen', confidence, xp);
    }

    await profileRepository.updateStreak(mins >= STREAK_MIN_MINUTES);
    await refreshProfile();
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  }

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
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
                  <Ionicons name={app.iconName as never} size={24} color={app.color} />
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
              {subjects.map((subject) => (
                <TouchableOpacity
                  key={subject.id}
                  style={[
                    styles.subjectChip,
                    selectedSubjectId === subject.id && { backgroundColor: subject.colorHex },
                  ]}
                  onPress={() =>
                    setSelectedSubjectId((current) => (current === subject.id ? null : subject.id))
                  }
                >
                  <LinearText
                    variant="chip"
                    tone={selectedSubjectId === subject.id ? 'inverse' : 'primary'}
                    style={styles.subjectText}
                  >
                    {subject.shortCode}
                  </LinearText>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {subjectTopics.length > 0 ? (
              <>
                <LinearText variant="label" tone="accent" style={styles.label}>
                  Topic Studied (Optional)
                </LinearText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.subjectScroll}
                >
                  {subjectTopics.map((topic) => (
                    <TouchableOpacity
                      key={topic.id}
                      style={[
                        styles.subjectChip,
                        styles.topicChip,
                        selectedTopicId === topic.id && { backgroundColor: n.colors.accent },
                      ]}
                      onPress={() =>
                        setSelectedTopicId((current) => (current === topic.id ? null : topic.id))
                      }
                    >
                      <LinearText
                        variant="chip"
                        tone={selectedTopicId === topic.id ? 'inverse' : 'primary'}
                        style={styles.subjectText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {topic.name}
                      </LinearText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <LinearText variant="label" tone="accent" style={styles.label}>
              Topic / Chapter Name
            </LinearText>
            <Controller
              control={control}
              name="topicName"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Heart Failure"
                  placeholderTextColor={n.colors.textMuted}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />
            {errors.topicName ? (
              <LinearText style={styles.errorText}>{errors.topicName.message}</LinearText>
            ) : null}

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
                  onPress={() =>
                    setValue('duration', mins.toString(), {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
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
            <Controller
              control={control}
              name="duration"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  placeholder="45"
                  placeholderTextColor={n.colors.textMuted}
                />
              )}
            />
            {errors.duration ? (
              <LinearText style={styles.errorText}>{errors.duration.message}</LinearText>
            ) : null}

            <LinearButton
              variant="secondary"
              style={[styles.submitBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={handleSubmit(handleValidSubmit)}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={`Log session, ${projectedXp} XP`}
              label={isSubmitting ? 'Logging…' : `Log Session (+${projectedXp} XP)`}
            />
          </ResponsiveContainer>
        </ScrollView>
      </KeyboardAvoidingView>
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
  errorText: {
    color: n.colors.error,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 8,
  },
  submitBtn: {
    minHeight: 58,
    marginTop: 24,
  },
});
