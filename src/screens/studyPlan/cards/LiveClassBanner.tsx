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



import { getCurrentLecturePosition } from '../services/lecturePositionService';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';





export default /**
 * Compact banner that shows where the student currently sits in their
 * DBMCI One or BTR live batch, based on the stored start date.
 */
function LiveClassBanner({
  resourceMode,
  dbmciStartDate,
  btrStartDate,
}: {
  resourceMode: StudyResourceMode;
  dbmciStartDate?: string | null;
  btrStartDate?: string | null;
}) {
  const startDate = resourceMode === 'btr' ? btrStartDate : dbmciStartDate;
  const batchLabel = resourceMode === 'btr' ? 'BTR' : 'DBMCI One';

  if (!startDate) {
    return (
      <LinearSurface compact style={liveStyles.banner}>
        <LinearText style={liveStyles.bannerTitle}>📺 {batchLabel} Live Batch</LinearText>
        <LinearText style={liveStyles.bannerHint}>
          Set your batch start date in Settings → Study Plan to unlock daily lecture tracking.
        </LinearText>
      </LinearSurface>
    );
  }

  const pos = getCurrentLecturePosition(startDate, resourceMode);
  if (!pos) return null;

  if (pos.isComplete) {
    return (
      <LinearSurface compact style={liveStyles.banner}>
        <LinearText style={liveStyles.bannerTitle}>🎓 {batchLabel} — Complete!</LinearText>
        <LinearText style={liveStyles.bannerHint}>
          All {pos.totalDays} teaching days covered. Focus on revision and mocks.
        </LinearText>
      </LinearSurface>
    );
  }

  const {
    currentBlock,
    nextBlock,
    dayNumber,
    totalDays,
    dayInSubject,
    daysLeftInSubject,
    progressPercent,
  } = pos;
  const progressBarWidth = `${progressPercent}%` as `${number}%`;

  return (
    <LinearSurface compact style={liveStyles.banner}>
      <View style={liveStyles.bannerRow}>
        <LinearText style={liveStyles.bannerTitle}>📺 {batchLabel}</LinearText>
        <LinearText style={liveStyles.bannerDay}>
          Day {dayNumber}/{totalDays}
        </LinearText>
      </View>

      {/* Progress bar */}
      <View style={liveStyles.progressTrack}>
        <View style={[liveStyles.progressFill, { width: progressBarWidth }]} />
      </View>

      {/* Current subject */}
      <View style={liveStyles.subjectRow}>
        <View style={liveStyles.subjectBadge}>
          <LinearText style={liveStyles.subjectBadgeText}>NOW</LinearText>
        </View>
        <LinearText style={liveStyles.subjectName}>{currentBlock.subjectName}</LinearText>
        <LinearText style={liveStyles.subjectMeta}>
          Day {dayInSubject}/{currentBlock.days} · {daysLeftInSubject}d left
        </LinearText>
      </View>

      {/* Next subject */}
      {nextBlock && (
        <View style={liveStyles.subjectRow}>
          <View style={[liveStyles.subjectBadge, liveStyles.subjectBadgeNext]}>
            <LinearText style={liveStyles.subjectBadgeText}>NEXT</LinearText>
          </View>
          <LinearText style={[liveStyles.subjectName, { color: n.colors.textMuted }]}>
            {nextBlock.subjectName}
          </LinearText>
          <LinearText style={liveStyles.subjectMeta}>{nextBlock.days}d</LinearText>
        </View>
      )}
    </LinearSurface>
  );
}
