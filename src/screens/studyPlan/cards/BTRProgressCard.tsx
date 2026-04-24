import React, { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getCompletedLectures,
  markLectureCompleted,
  unmarkLectureCompleted,
  getLectureIndexForSubject,
} from '../../../db/queries/lectureSchedule';
import { getDb } from '../../../db/database';
import type { TopicWithProgress } from '../../../types';
import { SUBJECTS_SEED } from '../../../constants/syllabus';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import { confirmDestructive } from '../../../components/dialogService';
import { showToast } from '../../../components/Toast';

const cardStyles = StyleSheet.create({
  card: { marginBottom: n.spacing.sm, backgroundColor: 'transparent', borderWidth: 0 },
  title: { color: n.colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: n.colors.textSecondary, fontSize: 12, marginBottom: n.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  subjectName: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  days: { color: n.colors.textMuted, fontSize: 12, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  markBtn: { fontSize: 11, fontWeight: '700', color: n.colors.accent },
});

const masteryStyles = StyleSheet.create({
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: n.spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: n.colors.textMuted },
  barTrack: {
    height: 6,
    backgroundColor: n.colors.border,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    marginTop: 4,
  },
  barSeg: { height: '100%', minWidth: 2 },
  quizNudge: { fontSize: 10, color: n.colors.warning, fontWeight: '600' },
  foundationActionRow: { flexDirection: 'row', gap: 8, marginBottom: n.spacing.sm },
  foundationPrimaryBtn: {
    backgroundColor: n.colors.warning,
    borderRadius: n.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
  },
  foundationPrimaryBtnText: { color: '#000', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  foundationGhostBtn: {
    borderWidth: 1,
    borderColor: n.colors.warning,
    borderRadius: n.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  foundationGhostBtnText: {
    color: n.colors.warning,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  funnelCard: { marginBottom: n.spacing.sm },
  funnelBar: {
    height: 12,
    backgroundColor: n.colors.border,
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  funnelSeg: { height: '100%', minWidth: 2 },
  funnelLegendRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 },
  funnelLegendItem: { fontSize: 12, fontWeight: '700' },
});

export default function BTRProgressCard({
  allTopics,
  onRefresh,
}: {
  allTopics: TopicWithProgress[];
  onRefresh: () => void;
}) {
  const subjects = [...SUBJECTS_SEED].sort((a, b) => a.displayOrder - b.displayOrder);
  const [btrCompletedIndices, setBtrCompletedIndices] = useState<Set<number>>(new Set());

  const loadBtrCompletion = useCallback(async () => {
    try {
      const indices = await getCompletedLectures('btr');
      setBtrCompletedIndices(new Set(indices));
    } catch (e) {
      console.warn('[BTRProgress] Failed to load completions:', e);
    }
  }, []);

  useEffect(() => {
    void loadBtrCompletion();
  }, [loadBtrCompletion]);

  const subjectToBtrIndex = new Map<number, number>();
  for (const s of subjects) {
    const idx = getLectureIndexForSubject('btr', s.id);
    if (idx !== undefined) subjectToBtrIndex.set(s.id, idx);
  }

  type SubjectStats = {
    unseen: number;
    seen: number;
    reviewed: number;
    mastered: number;
    total: number;
  };
  const subjectStats = new Map<string, SubjectStats>();
  for (const s of subjects)
    subjectStats.set(s.shortCode, { unseen: 0, seen: 0, reviewed: 0, mastered: 0, total: 0 });
  for (const t of allTopics) {
    if ((t.childCount ?? 0) > 0) continue;
    const stats = subjectStats.get(t.subjectCode);
    if (!stats) continue;
    stats.total++;
    if (t.progress.status === 'mastered') stats.mastered++;
    else if (t.progress.status === 'reviewed') stats.reviewed++;
    else if (t.progress.status === 'seen') stats.seen++;
    else stats.unseen++;
  }

  const btrWatchedCount = btrCompletedIndices.size;
  const btrTotalLectures = subjectToBtrIndex.size;
  const overallMastered = [...subjectStats.values()].reduce((s, v) => s + v.mastered, 0);
  const overallTotal = [...subjectStats.values()].reduce((s, v) => s + v.total, 0);

  const handleMarkDone = async (subjectId: number) => {
    try {
      const db = getDb();
      const now = Date.now();
      await db.runAsync(
        `UPDATE topic_progress SET status = 'seen', last_studied_at = ? WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = ? AND parent_topic_id IS NOT NULL) AND status = 'unseen'`,
        [now, subjectId],
      );
      const lectIndex = getLectureIndexForSubject('btr', subjectId);
      if (lectIndex !== undefined) await markLectureCompleted('btr', lectIndex);
      showToast('BTR lecture marked as watched.', 'success');
      void loadBtrCompletion();
      onRefresh();
    } catch (err) {
      console.error('[BTR] Mark done failed:', err);
      showToast('Failed to mark subject', 'error');
    }
  };

  const handleUnmark = async (subjectId: number) => {
    try {
      const lectIndex = getLectureIndexForSubject('btr', subjectId);
      if (lectIndex !== undefined) await unmarkLectureCompleted('btr', lectIndex);
      showToast('BTR lecture unmarked.', 'success');
      void loadBtrCompletion();
      onRefresh();
    } catch (err) {
      console.error('[BTR] Unmark failed:', err);
      showToast('Failed to unmark', 'error');
    }
  };

  return (
    <LinearSurface style={cardStyles.card}>
      <LinearText style={cardStyles.title}>📊 BTR — Lecture Progress</LinearText>
      <LinearText style={cardStyles.subtitle}>
        {btrWatchedCount}/{btrTotalLectures} BTR lectures watched · {overallMastered}/{overallTotal}{' '}
        topics mastered
      </LinearText>
      <View style={masteryStyles.legendRow}>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.textMuted }]} />
          <LinearText style={masteryStyles.legendText}>Unseen</LinearText>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.accent }]} />
          <LinearText style={masteryStyles.legendText}>Studied</LinearText>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.warning }]} />
          <LinearText style={masteryStyles.legendText}>Reviewed</LinearText>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.success }]} />
          <LinearText style={masteryStyles.legendText}>Mastered</LinearText>
        </View>
      </View>
      {subjects.map((subject) => {
        const stats = subjectStats.get(subject.shortCode) ?? {
          unseen: 0,
          seen: 0,
          reviewed: 0,
          mastered: 0,
          total: 0,
        };
        const watchedOrBetter = stats.seen + stats.reviewed + stats.mastered;
        const masteredPct = stats.total > 0 ? stats.mastered / stats.total : 0;
        const watchedPct = stats.total > 0 ? watchedOrBetter / stats.total : 0;
        const reviewedPct = stats.total > 0 ? (stats.reviewed + stats.mastered) / stats.total : 0;
        const needsQuiz = stats.seen > 0;
        const btrIndex = subjectToBtrIndex.get(subject.id);
        const isBtrWatched = btrIndex !== undefined && btrCompletedIndices.has(btrIndex);
        const hasOrganicStudyOnly = !isBtrWatched && watchedOrBetter > 0;

        return (
          <View
            key={subject.shortCode}
            style={{ flexDirection: 'column', alignItems: 'flex-start', paddingBottom: 10 }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 4 }}
            >
              {isBtrWatched ? (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={n.colors.success}
                  style={{ marginRight: 6 }}
                />
              ) : (
                <View style={[cardStyles.dot, { backgroundColor: subject.colorHex }]} />
              )}
              <LinearText
                style={[
                  cardStyles.subjectName,
                  !isBtrWatched && watchedOrBetter === 0 && { color: n.colors.textMuted },
                ]}
              >
                {subject.name}
              </LinearText>
              {stats.total > 0 && (
                <LinearText style={[cardStyles.days, { marginLeft: 'auto' }]}>
                  {stats.mastered}/{stats.total}
                </LinearText>
              )}
            </View>
            {stats.total > 0 && (
              <View style={masteryStyles.barTrack}>
                <View
                  style={[{ width: `${masteredPct * 100}%`, backgroundColor: n.colors.success }]}
                />
                <View
                  style={[
                    {
                      width: `${(reviewedPct - masteredPct) * 100}%`,
                      backgroundColor: n.colors.warning,
                    },
                  ]}
                />
                <View
                  style={[
                    {
                      width: `${(watchedPct - reviewedPct) * 100}%`,
                      backgroundColor: n.colors.accent,
                    },
                  ]}
                />
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
              {needsQuiz && (
                <LinearText style={masteryStyles.quizNudge}>
                  ⚡ {stats.seen} need quiz/review
                </LinearText>
              )}
              {isBtrWatched ? (
                <TouchableOpacity
                  onPress={async () => {
                    const ok = await confirmDestructive(
                      'Unmark BTR lecture?',
                      `Remove BTR marker for ${subject.name}.`,
                    );
                    if (ok) handleUnmark(subject.id);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <LinearText style={[cardStyles.markBtn, { color: n.colors.textMuted }]}>
                    Unwatch
                  </LinearText>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={async () => {
                    const ok = await confirmDestructive(
                      'Mark BTR lecture as watched?',
                      hasOrganicStudyOnly
                        ? `Some ${subject.name} topics have study progress.`
                        : 'Marks unseen topics as seen.',
                    );
                    if (ok) handleMarkDone(subject.id);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <LinearText style={cardStyles.markBtn}>
                    {hasOrganicStudyOnly ? 'Mark BTR Lecture' : 'Mark Watched'}
                  </LinearText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </LinearSurface>
  );
}
