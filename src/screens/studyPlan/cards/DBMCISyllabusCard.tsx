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

import { DBMCI_SUBJECT_ORDER, DBMCI_WORKLOAD_OVERRIDES } from '../services/studyPlannerBuckets';


import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';





export default function DBMCISyllabusCard({ allTopics }: { allTopics: TopicWithProgress[] }) {
  // Count total topics per subject (for sizing context)
  const subjectTopicCount = new Map<string, number>();
  for (const t of allTopics) {
    subjectTopicCount.set(t.subjectCode, (subjectTopicCount.get(t.subjectCode) ?? 0) + 1);
  }

  return (
    <LinearSurface style={dbmciStyles.card}>
      <LinearText style={dbmciStyles.title}>📋 DBMCI One — Study Sequence</LinearText>
      <LinearText style={dbmciStyles.subtitle}>
        Follow this order · {DBMCI_TOTAL_DAYS} lecture days · Topics auto-tracked from recordings
      </LinearText>
      {DBMCI_SUBJECT_ORDER.map((code, idx) => {
        const subject = SUBJECT_MAP.get(code);
        if (!subject) return null;
        const multiplier = DBMCI_WORKLOAD_OVERRIDES[code] ?? 1;
        const days = Math.round(multiplier * (DBMCI_TOTAL_DAYS / DBMCI_SUBJECT_ORDER.length));
        const topicCount = subjectTopicCount.get(code) ?? 0;

        return (
          <View key={code} style={dbmciStyles.row}>
            <LinearText style={[dbmciStyles.idx, { color: subject.colorHex }]}>
              {idx + 1}
            </LinearText>
            <View style={[dbmciStyles.dot, { backgroundColor: subject.colorHex }]} />
            <View style={dbmciStyles.rowContent}>
              <LinearText style={dbmciStyles.subjectName}>{subject.name}</LinearText>
              <LinearText style={dbmciStyles.topicCount}>{topicCount} topics</LinearText>
            </View>
            <View style={dbmciStyles.meta}>
              <LinearText style={dbmciStyles.days}>{days}d</LinearText>
            </View>
          </View>
        );
      })}
    </LinearSurface>
  );
}
