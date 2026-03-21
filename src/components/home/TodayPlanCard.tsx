import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { HomeStackParamList, TabParamList } from '../../navigation/types';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { generateDailyAgendaWithRouting } from '../../services/ai';
import { dailyAgendaRepository, profileRepository } from '../../db/repositories';
import { showToast } from '../Toast';

export default function TodayPlanCard() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { profile, todayPlan, setTodayPlan } = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!profile) return;
    setIsGenerating(true);
    try {
      const [dueTopics, weakTopics, recentTopics, coverage] = await Promise.all([
        profileRepository.getReviewDueTopics(),
        profileRepository.getWeakestTopics(5),
        profileRepository.getRecentTopics(10),
        profileRepository.getSubjectCoverage(),
      ]);

      const totalTopics = coverage.reduce((acc, s) => acc + s.total, 0);
      const seenTopics = coverage.reduce((acc, s) => acc + s.seen, 0);
      const coveragePercent = totalTopics > 0 ? Math.round((seenTopics / totalTopics) * 100) : 0;

      const stats = {
        streak: profile.streakCurrent,
        daysToInicet: profileRepository.getDaysToExam(profile.inicetDate),
        daysToNeetPg: profileRepository.getDaysToExam(profile.neetDate),
        coveragePercent,
        dueTopics: dueTopics.map((t) => ({
          id: t.topicId,
          name: t.topicName,
          subject: t.subjectName,
        })),
        weakTopics: weakTopics.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subjectName ?? '',
        })),
        recentTopics,
      };

      const plan = await generateDailyAgendaWithRouting(
        profile.displayName,
        stats,
        profile.dailyGoalMinutes || 120,
      );

      const date = new Date().toLocaleDateString('en-CA');
      await dailyAgendaRepository.saveDailyAgenda(date, plan);
      setTodayPlan(plan);
      showToast("Today's plan ready, Doctor.", 'success');
    } catch (e) {
      console.error('Plan generation failed:', e);
      showToast('Guru is busy. Try again later.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const navigateToFullSchedule = () => {
    navigation
      .getParent<NavigationProp<TabParamList>>()
      ?.navigate('MenuTab', { screen: 'StudyPlan' });
  };

  if (!todayPlan) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Ionicons name="compass-outline" size={18} color={theme.colors.textMuted} />
          <Text style={styles.label}>TODAY'S MISSION</Text>
        </View>
        <Text style={styles.subtitle}>No plan generated yet.</Text>
        <TouchableOpacity
          style={styles.generateBtn}
          onPress={handleGenerate}
          disabled={isGenerating}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Generate daily plan"
        >
          {isGenerating ? (
            <ActivityIndicator color={theme.colors.textPrimary} size="small" />
          ) : (
            <Text style={styles.generateBtnText}>GENERATE PLAN</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  const studyBlocks = todayPlan.blocks.filter((b) => b.type !== 'break');
  const nextTask = studyBlocks[0];
  const remainingBlocks = studyBlocks.length;
  const totalMinutes = studyBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const typeLabel =
    nextTask?.type === 'review' ? 'REVIEW' : nextTask?.type === 'test' ? 'TEST' : 'STUDY';
  const typeColor =
    nextTask?.type === 'review'
      ? theme.colors.warning
      : nextTask?.type === 'test'
        ? '#E05252'
        : theme.colors.primary;

  return (
    <View style={[styles.container, styles.activeContainer]}>
      <View style={styles.activeHeader}>
        <View style={styles.headerRow}>
          <Ionicons name="compass" size={18} color={theme.colors.primary} />
          <Text style={[styles.label, { color: theme.colors.primary }]}>UP NEXT</Text>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}22` }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          {nextTask && <Text style={styles.durationText}>{nextTask.durationMinutes}m</Text>}
        </View>
      </View>

      {nextTask && (
        <View style={styles.taskBlock}>
          <Text style={styles.taskTitle}>{nextTask.title}</Text>
          <Text style={styles.taskWhy}>{nextTask.why}</Text>
        </View>
      )}

      {nextTask && (
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: typeColor }]}
          onPress={() =>
            navigation.navigate('Session', {
              mood: 'good',
              focusTopicIds: nextTask.topicIds.length > 0 ? nextTask.topicIds : undefined,
              preferredActionType:
                nextTask.type === 'review'
                  ? 'review'
                  : nextTask.type === 'test'
                    ? 'deep_dive'
                    : 'study',
              forcedMinutes: nextTask.durationMinutes,
            })
          }
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Start ${nextTask.title}`}
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.startBtnText}>START NOW</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.viewFullBtn}
          onPress={navigateToFullSchedule}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View full schedule"
        >
          <Text style={styles.viewFullText}>
            {remainingBlocks} block{remainingBlocks !== 1 ? 's' : ''} · {totalMinutes}m total
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activeContainer: {
    borderColor: theme.colors.primaryTintMedium,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: theme.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    marginBottom: theme.spacing.lg,
  },
  generateBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  generateBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  durationText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  taskBlock: {
    marginBottom: theme.spacing.md,
  },
  taskTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  taskWhy: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 13,
    marginBottom: theme.spacing.md,
  },
  startBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  viewFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  viewFullText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
