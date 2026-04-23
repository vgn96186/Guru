import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { StudyPlanSummary } from '../../../services/studyPlanner';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';

const funnelStyles = StyleSheet.create({
  funnelCard: { marginBottom: n.spacing.sm },
  funnelBar: { height: 12, backgroundColor: n.colors.border, borderRadius: 6, flexDirection: 'row', overflow: 'hidden' },
  funnelSeg: { height: '100%', minWidth: 2 },
  funnelLegendRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 },
  funnelLegendItem: { fontSize: 12, fontWeight: '700' },
});

export default function MasteryFunnelCard({ summary }: { summary: StudyPlanSummary }) {
  const total = summary.unseenCount + summary.seenNeedingQuizCount + summary.reviewedCount + summary.masteredCount;
  if (total === 0) return null;

  const bar = (count: number, color: string) => (
    <View style={[funnelStyles.funnelSeg, { flex: count, backgroundColor: color }]} />
  );

  return (
    <View style={funnelStyles.funnelCard}>
      <View style={funnelStyles.funnelBar}>
        {bar(summary.masteredCount, n.colors.success)}
        {bar(summary.reviewedCount, n.colors.warning)}
        {bar(summary.seenNeedingQuizCount, n.colors.accent)}
        {bar(summary.unseenCount, n.colors.border)}
      </View>
      <View style={funnelStyles.funnelLegendRow}>
        <LinearText style={[funnelStyles.funnelLegendItem, { color: n.colors.success }]}>{summary.masteredCount}</LinearText>
        <LinearText style={[funnelStyles.funnelLegendItem, { color: n.colors.warning }]}>{summary.reviewedCount}</LinearText>
        <LinearText style={[funnelStyles.funnelLegendItem, { color: n.colors.accent }]}>{summary.seenNeedingQuizCount}</LinearText>
        <LinearText style={[funnelStyles.funnelLegendItem, { color: n.colors.textMuted }]}>{summary.unseenCount}</LinearText>
      </View>
    </View>
  );
}