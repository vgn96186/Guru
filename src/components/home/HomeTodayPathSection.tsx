import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DailyAgenda } from '../../services/ai/types';
import { theme } from '../../constants/theme';

interface Props {
  expanded: boolean;
  todayPlan: DailyAgenda | null;
  onToggle: () => void;
  onOpenPlan: () => void;
}

export default function HomeTodayPathSection({ expanded, todayPlan, onToggle, onOpenPlan }: Props) {
  const nextBlock = todayPlan?.blocks.find((block) => block.type !== 'break') ?? null;
  const summary = nextBlock
    ? `${todayPlan?.blocks.filter((block) => block.type !== 'break').length ?? 0} focus block${todayPlan?.blocks.filter((block) => block.type !== 'break').length === 1 ? '' : 's'} ready`
    : 'No path generated yet';

  return (
    <View style={styles.shell}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        activeOpacity={theme.alpha.subtlePressed}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse Today's Path" : "Expand Today's Path"}
      >
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Today's Path</Text>
          <Text style={styles.summary}>{summary}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textMuted}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          {nextBlock ? (
            <>
              <Text style={styles.blockTitle}>{nextBlock.title}</Text>
              <Text style={styles.blockMeta}>
                {nextBlock.durationMinutes} min · {nextBlock.type}
              </Text>
              <Text style={styles.why}>{nextBlock.why}</Text>
              {todayPlan?.guruNote ? <Text style={styles.note}>{todayPlan.guruNote}</Text> : null}
            </>
          ) : (
            <Text style={styles.emptyCopy}>
              Open Study Plan to shape today&apos;s path before you dive in.
            </Text>
          )}

          <TouchableOpacity
            style={styles.cta}
            onPress={onOpenPlan}
            activeOpacity={theme.alpha.pressed}
            accessibilityRole="button"
            accessibilityLabel="Open Study Plan"
          >
            <Text style={styles.ctaText}>Open Study Plan</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
  },
  header: {
    minHeight: 72,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  summary: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    padding: theme.spacing.lg,
  },
  blockTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  blockMeta: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    textTransform: 'uppercase',
  },
  why: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  note: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  emptyCopy: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primaryTint,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.full,
  },
  ctaText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
});
