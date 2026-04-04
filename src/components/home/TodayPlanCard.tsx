import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { HomeStackParamList, TabParamList } from '../../navigation/types';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearSurface from '../primitives/LinearSurface';
import { useAppStore } from '../../store/useAppStore';
import { getTodaysAgendaWithTimes, type TodayTask } from '../../services/studyPlanner';
import { dailyAgendaRepository } from '../../db/repositories';
import type { DailyAgenda } from '../../services/ai';
import { showToast } from '../Toast';

/** Convert local planner tasks into the DailyAgenda shape for storage & display */
function tasksToAgenda(tasks: TodayTask[]): DailyAgenda {
  return {
    blocks: tasks.map((task, i) => ({
      id: `local-${i}`,
      title: task.topic.name,
      topicIds: [task.topic.id],
      durationMinutes: task.duration,
      startTime: task.timeLabel.split(' - ')[0],
      type: (task.type === 'review' ? 'review' : task.type === 'deep_dive' ? 'test' : 'study') as
        | 'study'
        | 'review'
        | 'test'
        | 'break',
      why: `${task.topic.subjectName} — ${
        task.type === 'review'
          ? 'due for review'
          : task.type === 'deep_dive'
            ? 'weak, needs deep dive'
            : 'new topic to cover'
      }`,
    })),
    guruNote:
      tasks.length > 0
        ? `${tasks.length} tasks lined up. Start with ${tasks[0].topic.name}.`
        : 'Nothing urgent today — great time to explore new topics.',
  };
}

export default function TodayPlanCard() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const profile = useAppStore((s) => s.profile);
  const todayPlan = useAppStore((s) => s.todayPlan);
  const setTodayPlan = useAppStore((s) => s.setTodayPlan);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!profile) return;
    setIsGenerating(true);
    try {
      const tasks = await getTodaysAgendaWithTimes();
      const plan = tasksToAgenda(tasks);

      const date = new Date().toLocaleDateString('en-CA');
      await dailyAgendaRepository.saveDailyAgenda(date, plan, 'local');
      setTodayPlan(plan);
      showToast("Today's plan ready, Doctor.", 'success');
    } catch (e) {
      console.error('Plan generation failed:', e);
      showToast('Could not generate plan.', 'error');
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
      <LinearSurface style={styles.container} borderColor="rgba(255,255,255,0.10)">
        <View style={styles.headerRow}>
          <Ionicons name="compass-outline" size={18} color={n.colors.textMuted} />
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
            <ActivityIndicator color={n.colors.textPrimary} size="small" />
          ) : (
            <Text style={styles.generateBtnText}>GENERATE PLAN</Text>
          )}
        </TouchableOpacity>
      </LinearSurface>
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
      ? n.colors.warning
      : nextTask?.type === 'test'
        ? '#E05252'
        : n.colors.accent;

  return (
    <LinearSurface
      style={[styles.container, styles.activeContainer]}
      borderColor="rgba(108,99,255,0.34)"
    >
      <View style={styles.activeHeader}>
        <View style={styles.headerRow}>
          <Ionicons name="compass" size={18} color={n.colors.accent} />
          <Text style={[styles.label, { color: n.colors.accent }]}>UP NEXT</Text>
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
              focusTopicIds: nextTask.topicIds?.length > 0 ? nextTask.topicIds : undefined,
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
          <Ionicons name="chevron-forward" size={14} color={n.colors.textMuted} />
        </TouchableOpacity>
      </View>
    </LinearSurface>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginBottom: n.spacing.lg,
    flex: 1,
    justifyContent: 'space-between',
  },
  activeContainer: {
    backgroundColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: n.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  subtitle: {
    color: n.colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    marginBottom: n.spacing.lg,
  },
  generateBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: n.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  generateBtnText: {
    color: n.colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: n.spacing.md,
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
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  taskBlock: {
    marginBottom: n.spacing.md,
  },
  taskTitle: {
    color: n.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  taskWhy: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: n.radius.sm,
    paddingVertical: 13,
    marginBottom: n.spacing.md,
  },
  startBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: n.spacing.md,
  },
  viewFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  viewFullText: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
