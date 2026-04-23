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





export default /** Inline urgency cell for the summary strip. */
function UrgencyCell({ summary }: { summary: StudyPlanSummary }) {
  return (
    <View style={styles.summaryCell}>
      <LinearText style={styles.summaryValue}>{summary.daysRemaining}d</LinearText>
      <LinearText style={styles.summaryLabel}>{summary.targetExam}</LinearText>
    </View>
  );
}
