import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { StudyPlanSummary } from '../../../services/studyPlanner';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';

const cellStyles = StyleSheet.create({
  summaryCell: { alignItems: 'center', paddingHorizontal: 12 },
  summaryValue: { color: n.colors.textPrimary, fontSize: 16, fontWeight: '800' },
  summaryLabel: { color: n.colors.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2 },
});

export default function UrgencyCell({ summary }: { summary: StudyPlanSummary }) {
  return (
    <View style={cellStyles.summaryCell}>
      <LinearText style={cellStyles.summaryValue}>{summary.daysRemaining}d</LinearText>
      <LinearText style={cellStyles.summaryLabel}>{summary.targetExam}</LinearText>
    </View>
  );
}
