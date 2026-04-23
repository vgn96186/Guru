import React, { useCallback, useEffect, useState } from 'react';
import {     
  View } from      'react-native';

import { type DailyPlan,
  type StudyPlanSummary,
  type PlanMode,
 } from  '../services/studyPlanner';
import { type NavigationProp  } from  '@react-navigation/native';
import type { TabParamList, HomeStackParamList } from '../navigation/types';




import { linearTheme as n } from '../theme/linearTheme';








import type { TopicWithProgress, StudyResourceMode } from '../types';





import LinearText from '../components/primitives/LinearText';





export default /** Mastery funnel summary — shown at top of plan for all modes. */
function MasteryFunnelCard({ summary }: { summary: StudyPlanSummary }) {
  const total =
    summary.unseenCount +
    summary.seenNeedingQuizCount +
    summary.reviewedCount +
    summary.masteredCount;
  if (total === 0) return null;

  const bar = (count: number, color: string) => (
    <View style={[masteryStyles.funnelSeg, { flex: count, backgroundColor: color }]} />
  );

  return (
    <View style={masteryStyles.funnelCard}>
      <View style={masteryStyles.funnelBar}>
        {bar(summary.masteredCount, n.colors.success)}
        {bar(summary.reviewedCount, n.colors.warning)}
        {bar(summary.seenNeedingQuizCount, n.colors.accent)}
        {bar(summary.unseenCount, n.colors.border)}
      </View>
      <View style={masteryStyles.funnelLegendRow}>
        <LinearText style={[masteryStyles.funnelLegendItem, { color: n.colors.success }]}>
          {summary.masteredCount}
        </LinearText>
        <LinearText style={[masteryStyles.funnelLegendItem, { color: n.colors.warning }]}>
          {summary.reviewedCount}
        </LinearText>
        <LinearText style={[masteryStyles.funnelLegendItem, { color: n.colors.accent }]}>
          {summary.seenNeedingQuizCount}
        </LinearText>
        <LinearText style={[masteryStyles.funnelLegendItem, { color: n.colors.textMuted }]}>
          {summary.unseenCount}
        </LinearText>
      </View>
    </View>
  );
}
