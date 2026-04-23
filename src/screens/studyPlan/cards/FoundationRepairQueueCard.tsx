import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import type { DailyPlan, StudyPlanSummary } from '../../../services/studyPlanner';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';

const styles = StyleSheet.create({
  foundationActionRow: { flexDirection: 'row', gap: 8, marginBottom: n.spacing.sm },
  foundationPrimaryBtn: { backgroundColor: n.colors.warning, borderRadius: n.radius.sm, paddingVertical: 10, paddingHorizontal: 16, flex: 1 },
  foundationPrimaryBtnText: { color: '#000', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  foundationGhostBtn: { borderWidth: 1, borderColor: n.colors.warning, borderRadius: n.radius.sm, paddingVertical: 10, paddingHorizontal: 16 },
  foundationGhostBtnText: { color: n.colors.warning, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});

export default function FoundationRepairQueueCard({
  summary,
  todayPlan,
  onStartFoundation,
  onStartQuizRecovery,
}: {
  summary: StudyPlanSummary;
  todayPlan?: DailyPlan;
  onStartFoundation: () => void;
  onStartQuizRecovery: () => void;
}) {
  const foundationToday =
    todayPlan?.items.filter(
      (item) =>
        item.type === 'deep_dive' ||
        item.reasonLabels.includes('Foundation gap') ||
        item.topic.progress.confidence <= 1,
    ) ?? [];

  const hasQueue = foundationToday.length > 0 || summary.seenNeedingQuizCount > 0;
  if (!hasQueue) return null;

  return (
    <View style={styles.foundationActionRow}>
      <TouchableOpacity style={styles.foundationPrimaryBtn} onPress={onStartFoundation} activeOpacity={0.8}>
        <LinearText style={styles.foundationPrimaryBtnText}>
          Repair {foundationToday.length} weak
        </LinearText>
      </TouchableOpacity>
      {summary.seenNeedingQuizCount > 0 && (
        <TouchableOpacity style={styles.foundationGhostBtn} onPress={onStartQuizRecovery} activeOpacity={0.8}>
          <LinearText style={styles.foundationGhostBtnText}>
            Quiz {summary.seenNeedingQuizCount} watched
          </LinearText>
        </TouchableOpacity>
      )}
    </View>
  );
}