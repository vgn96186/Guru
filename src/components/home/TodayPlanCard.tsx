import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { type NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { TabParamList } from '../../navigation/types';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearSurface from '../primitives/LinearSurface';
import LinearText from '../primitives/LinearText';
import LoadingIndicator from '../primitives/LoadingIndicator';
import { useProfileQuery } from '../../hooks/queries/useProfile';
import { useAppStore } from '../../store/useAppStore';
import { getTodaysAgendaWithTimes, type TodayTask } from '../../services/studyPlanner';
import { dailyAgendaRepository } from '../../db/repositories';
import type { DailyAgenda } from '../../services/ai';
import { showToast } from '../Toast';

import { HomeNav } from '../../navigation/typedHooks';
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
  const navigation = HomeNav.useNav();
  const { data: profile } = useProfileQuery();
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

  // Pre-compute aggregates once — MUST be called before any early returns (rules-of-hooks)
  const { nextTask, remainingBlocks, totalMinutes, typeLabel, typeColor } = useMemo(() => {
    if (!todayPlan)
      return {
        nextTask: null,
        remainingBlocks: 0,
        totalMinutes: 0,
        typeLabel: 'STUDY',
        typeColor: n.colors.accent,
      };
    const blocks = todayPlan.blocks.filter((b) => b.type !== 'break');
    const first = blocks[0] ?? null;
    const remaining = blocks.length;
    const minutes = blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    const label = first?.type === 'review' ? 'REVIEW' : first?.type === 'test' ? 'TEST' : 'STUDY';
    const color =
      first?.type === 'review'
        ? n.colors.warning
        : first?.type === 'test'
          ? '#E05252'
          : n.colors.accent;
    return {
      nextTask: first,
      remainingBlocks: remaining,
      totalMinutes: minutes,
      typeLabel: label,
      typeColor: color,
    };
  }, [todayPlan]);

  // ── Early returns AFTER hooks ──
  if (!todayPlan) {
    return (
      <LinearSurface style={styles.container} borderColor="rgba(255,255,255,0.10)">
        <View style={styles.headerRow}>
          <Ionicons name="compass-outline" size={18} color={n.colors.textMuted} />
          <LinearText variant="chip" tone="muted" style={styles.label}>
            TODAY'S MISSION
          </LinearText>
        </View>
        <LinearText variant="bodySmall" tone="secondary" style={styles.subtitle}>
          No plan generated yet.
        </LinearText>
        <TouchableOpacity
          style={styles.generateBtn}
          onPress={handleGenerate}
          disabled={isGenerating}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Generate daily plan"
        >
          {isGenerating ? (
            <LoadingIndicator color={n.colors.textPrimary} size="small" />
          ) : (
            <LinearText variant="chip" style={styles.generateBtnText}>
              GENERATE PLAN
            </LinearText>
          )}
        </TouchableOpacity>
      </LinearSurface>
    );
  }

  // Don't render active state if no study blocks
  if (!nextTask) {
    return (
      <LinearSurface style={styles.container} borderColor="rgba(255,255,255,0.10)">
        <View style={styles.headerRow}>
          <Ionicons name="compass-outline" size={18} color={n.colors.textMuted} />
          <LinearText variant="chip" tone="muted" style={styles.label}>
            TODAY'S MISSION
          </LinearText>
        </View>
        <LinearText variant="bodySmall" tone="secondary" style={styles.subtitle}>
          No tasks scheduled.
        </LinearText>
        <TouchableOpacity
          style={styles.generateBtn}
          onPress={handleGenerate}
          disabled={isGenerating}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Generate daily plan"
        >
          {isGenerating ? (
            <LoadingIndicator color={n.colors.textPrimary} size="small" />
          ) : (
            <LinearText variant="chip" style={styles.generateBtnText}>
              GENERATE PLAN
            </LinearText>
          )}
        </TouchableOpacity>
      </LinearSurface>
    );
  }

  return (
    <LinearSurface
      style={[styles.container, styles.activeContainer]}
      borderColor="rgba(108,99,255,0.34)"
    >
      <View style={styles.activeHeader}>
        <View style={styles.headerRow}>
          <Ionicons name="compass" size={18} color={n.colors.accent} />
          <LinearText
            variant="chip"
            tone="accent"
            style={[styles.label, { color: n.colors.accent }]}
          >
            UP NEXT
          </LinearText>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}22` }]}>
            <LinearText variant="chip" style={[styles.typeBadgeText, { color: typeColor }]}>
              {typeLabel}
            </LinearText>
          </View>
          {nextTask && (
            <LinearText variant="caption" style={styles.durationText}>
              {nextTask.durationMinutes}m
            </LinearText>
          )}
        </View>
      </View>

      {nextTask && (
        <View style={styles.taskBlock}>
          <LinearText variant="sectionTitle" style={styles.taskTitle}>
            {nextTask.title}
          </LinearText>
          <LinearText variant="bodySmall" tone="secondary" style={styles.taskWhy}>
            {nextTask.why}
          </LinearText>
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
          <LinearText variant="chip" style={styles.startBtnText}>
            START NOW
          </LinearText>
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
          <LinearText variant="caption" style={styles.viewFullText}>
            {remainingBlocks} block{remainingBlocks !== 1 ? 's' : ''} · {totalMinutes}m total
          </LinearText>
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
    color: n.colors.textPrimary,
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
