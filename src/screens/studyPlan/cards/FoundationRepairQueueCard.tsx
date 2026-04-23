import React, { useCallback, useEffect, useState } from 'react';
import {    
  View,
  TouchableOpacity } from     'react-native';

import { type DailyPlan,
  type StudyPlanSummary,
  type PlanMode,
 } from  '../services/studyPlanner';
import { type NavigationProp  } from  '@react-navigation/native';
import type { TabParamList, HomeStackParamList } from '../navigation/types';




import { linearTheme as n } from '../theme/linearTheme';








import type { TopicWithProgress, StudyResourceMode } from '../types';





import LinearText from '../components/primitives/LinearText';





export default /** Focus card to repair weak fundamentals before chasing more new topics. */
function FoundationRepairQueueCard({
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
    <View style={masteryStyles.foundationActionRow}>
      <TouchableOpacity
        style={masteryStyles.foundationPrimaryBtn}
        onPress={onStartFoundation}
        activeOpacity={0.8}
      >
        <LinearText style={masteryStyles.foundationPrimaryBtnText}>
          Repair {foundationToday.length} weak
        </LinearText>
      </TouchableOpacity>
      {summary.seenNeedingQuizCount > 0 && (
        <TouchableOpacity
          style={masteryStyles.foundationGhostBtn}
          onPress={onStartQuizRecovery}
          activeOpacity={0.8}
        >
          <LinearText style={masteryStyles.foundationGhostBtnText}>
            Quiz {summary.seenNeedingQuizCount} watched
          </LinearText>
        </TouchableOpacity>
      )}
    </View>
  );
}
