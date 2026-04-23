import React from 'react';
import { View, StyleSheet } from 'react-native';
import { getCurrentLecturePosition } from '../../../services/lecturePositionService';
import type { StudyResourceMode } from '../../../types';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';

const bannerStyles = StyleSheet.create({
  banner: { marginBottom: n.spacing.sm, backgroundColor: 'transparent', borderWidth: 0 },
  bannerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bannerTitle: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '700' },
  bannerDay: { color: n.colors.textMuted, fontSize: 12, fontWeight: '600' },
  bannerHint: { color: n.colors.textSecondary, fontSize: 12 },
  progressTrack: { height: 4, backgroundColor: n.colors.border, borderRadius: 2, marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: n.colors.accent, borderRadius: 2 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  subjectBadge: { backgroundColor: n.colors.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  subjectBadgeNext: { backgroundColor: n.colors.border },
  subjectBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  subjectName: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  subjectMeta: { color: n.colors.textMuted, fontSize: 11 },
});

export default function LiveClassBanner({
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
      <LinearSurface compact style={bannerStyles.banner}>
        <LinearText style={bannerStyles.bannerTitle}>📺 {batchLabel} Live Batch</LinearText>
        <LinearText style={bannerStyles.bannerHint}>
          Set your batch start date in Settings → Study Plan to unlock daily lecture tracking.
        </LinearText>
      </LinearSurface>
    );
  }

  const pos = getCurrentLecturePosition(startDate, resourceMode);
  if (!pos) return null;

  if (pos.isComplete) {
    return (
      <LinearSurface compact style={bannerStyles.banner}>
        <LinearText style={bannerStyles.bannerTitle}>🎓 {batchLabel} — Complete!</LinearText>
        <LinearText style={bannerStyles.bannerHint}>
          All {pos.totalDays} teaching days covered. Focus on revision and mocks.
        </LinearText>
      </LinearSurface>
    );
  }

  const { currentBlock, nextBlock, dayNumber, totalDays, dayInSubject, daysLeftInSubject, progressPercent } = pos;
  const progressBarWidth = `${progressPercent}%` as const;

  return (
    <LinearSurface compact style={bannerStyles.banner}>
      <View style={bannerStyles.bannerRow}>
        <LinearText style={bannerStyles.bannerTitle}>📺 {batchLabel}</LinearText>
        <LinearText style={bannerStyles.bannerDay}>Day {dayNumber}/{totalDays}</LinearText>
      </View>
      <View style={bannerStyles.progressTrack}>
        <View style={[bannerStyles.progressFill, { width: progressBarWidth }]} />
      </View>
      <View style={bannerStyles.subjectRow}>
        <View style={bannerStyles.subjectBadge}>
          <LinearText style={bannerStyles.subjectBadgeText}>NOW</LinearText>
        </View>
        <LinearText style={bannerStyles.subjectName}>{currentBlock.subjectName}</LinearText>
        <LinearText style={bannerStyles.subjectMeta}>Day {dayInSubject}/{currentBlock.days} · {daysLeftInSubject}d left</LinearText>
      </View>
      {nextBlock && (
        <View style={bannerStyles.subjectRow}>
          <View style={[bannerStyles.subjectBadge, bannerStyles.subjectBadgeNext]}>
            <LinearText style={bannerStyles.subjectBadgeText}>NEXT</LinearText>
          </View>
          <LinearText style={[bannerStyles.subjectName, { color: n.colors.textMuted }]}>{nextBlock.subjectName}</LinearText>
          <LinearText style={bannerStyles.subjectMeta}>{nextBlock.days}d</LinearText>
        </View>
      )}
    </LinearSurface>
  );
}