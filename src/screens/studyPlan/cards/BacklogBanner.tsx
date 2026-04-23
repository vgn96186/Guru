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





export default /** Red/amber banner when the review backlog is large enough to gate new topics. */
function BacklogBanner({ summary }: { summary: StudyPlanSummary }) {
  if (summary.overdueBacklogDays < 2) return null;
  const severe = summary.overdueBacklogDays > 4;
  return (
    <View style={masteryStyles.backlogBanner}>
      <LinearText
        style={[
          masteryStyles.backlogBannerText,
          { color: severe ? n.colors.error : n.colors.warning },
        ]}
      >
        {summary.overdueBacklogDays}d overdue reviews
        {severe ? ' — new topics throttled' : ' — clear before new topics'}
      </LinearText>
    </View>
  );
}
