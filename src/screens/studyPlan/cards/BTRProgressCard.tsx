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

import { showToast } from '../components/Toast';


import { linearTheme as n } from '../theme/linearTheme';



import { Ionicons } from '@expo/vector-icons';


import {
  getCompletedLectures,
  markLectureCompleted,
  unmarkLectureCompleted,
  getLectureIndexForSubject,
} from '../db/queries/lectureSchedule';
import { getDb } from '../db/database';
import type { TopicWithProgress, StudyResourceMode } from '../types';


import { SUBJECTS_SEED } from '../constants/syllabus';

import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import { confirmDestructive } from '../components/dialogService';




export default function BTRProgressCard({
  allTopics,
  onRefresh,
}: {
  allTopics: TopicWithProgress[];
  onRefresh: () => void;
}) {
  const subjects = [...SUBJECTS_SEED].sort((a, b) => a.displayOrder - b.displayOrder);
  // BTR-specific lecture completion (from lecture_schedule_progress table)
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

  // Build a map: subjectId → BTR lecture index
  const subjectToBtrIndex = new Map<number, number>();
  for (const s of subjects) {
    const idx = getLectureIndexForSubject('btr', s.id);
    if (idx !== undefined) subjectToBtrIndex.set(s.id, idx);
  }

  // Per-subject mastery pipeline counts (global topic_progress)
  type SubjectStats = {
    unseen: number;
    seen: number;
    reviewed: number;
    mastered: number;
    total: number;
  };
  const subjectStats = new Map<string, SubjectStats>();
  for (const s of subjects) {
    subjectStats.set(s.shortCode, { unseen: 0, seen: 0, reviewed: 0, mastered: 0, total: 0 });
  }
  for (const t of allTopics) {
    if ((t.childCount ?? 0) > 0) continue; // skip containers
    const stats = subjectStats.get(t.subjectCode);
    if (!stats) continue;
    stats.total++;
    if (t.progress.status === 'mastered') stats.mastered++;
    else if (t.progress.status === 'reviewed') stats.reviewed++;
    else if (t.progress.status === 'seen') stats.seen++;
    else stats.unseen++;
  }

  // BTR-specific counts (based on lecture_schedule_progress, not global topic stats)
  const btrWatchedCount = btrCompletedIndices.size;
  const btrTotalLectures = subjectToBtrIndex.size; // 19
  const overallMastered = [...subjectStats.values()].reduce((s, v) => s + v.mastered, 0);
  const overallTotal = [...subjectStats.values()].reduce((s, v) => s + v.total, 0);

  /** Mark a subject as BTR-watched: sets topic_progress AND lecture_schedule_progress. */
  const handleMarkDone = async (subjectId: number) => {
    try {
      const db = getDb();
      const now = Date.now();
      await db.runAsync(
        `UPDATE topic_progress
         SET status = 'seen', last_studied_at = ?
         WHERE topic_id IN (
           SELECT id FROM topics WHERE subject_id = ? AND parent_topic_id IS NOT NULL
         )
         AND status = 'unseen'`,
        [now, subjectId],
      );
      // Also record BTR lecture as completed
      const lectIndex = getLectureIndexForSubject('btr', subjectId);
      if (lectIndex !== undefined) {
        await markLectureCompleted('btr', lectIndex);
      }
      showToast(
        'BTR lecture marked as watched. Guru will now queue these topics for quiz and review.',
        'success',
      );
      void loadBtrCompletion();
      onRefresh();
    } catch (err) {
      console.error('[BTR] Mark done failed:', err);
      showToast('Failed to mark subject', 'error');
    }
  };

  /** Unmark a subject's BTR lecture (does NOT reset topic_progress). */
  const handleUnmark = async (subjectId: number) => {
    try {
      const lectIndex = getLectureIndexForSubject('btr', subjectId);
      if (lectIndex !== undefined) {
        await unmarkLectureCompleted('btr', lectIndex);
      }
      showToast('BTR lecture unmarked.', 'success');
      void loadBtrCompletion();
      onRefresh();
    } catch (err) {
      console.error('[BTR] Unmark failed:', err);
      showToast('Failed to unmark', 'error');
    }
  };

  return (
    <LinearSurface style={dbmciStyles.card}>
      <LinearText style={dbmciStyles.title}>📊 BTR — Lecture Progress</LinearText>
      <LinearText style={dbmciStyles.subtitle}>
        {btrWatchedCount}/{btrTotalLectures} BTR lectures watched · {overallMastered}/{overallTotal}{' '}
        topics mastered
      </LinearText>
      {/* Pipeline legend */}
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
        const needsQuiz = stats.seen > 0; // watched but unquizzed

        // BTR-specific: is this subject's lecture explicitly completed?
        const btrIndex = subjectToBtrIndex.get(subject.id);
        const isBtrWatched = btrIndex !== undefined && btrCompletedIndices.has(btrIndex);
        // Has organic study but no BTR lecture mark
        const hasOrganicStudyOnly = !isBtrWatched && watchedOrBetter > 0;

        return (
          <View
            key={subject.shortCode}
            style={[
              dbmciStyles.row,
              { flexDirection: 'column', alignItems: 'flex-start', paddingBottom: 10 },
            ]}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 4 }}
            >
              {/* BTR lecture status badge */}
              {isBtrWatched ? (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={n.colors.success}
                  style={{ marginRight: 6 }}
                />
              ) : (
                <View style={[dbmciStyles.dot, { backgroundColor: subject.colorHex }]} />
              )}
              <LinearText
                style={[
                  dbmciStyles.subjectName,
                  !isBtrWatched && watchedOrBetter === 0 && { color: n.colors.textMuted },
                ]}
              >
                {subject.name}
              </LinearText>
              {stats.total > 0 && (
                <LinearText style={[dbmciStyles.days, { marginLeft: 'auto' }]}>
                  {stats.mastered}/{stats.total}
                </LinearText>
              )}
            </View>
            {/* Stacked pipeline bar */}
            {stats.total > 0 && (
              <View style={masteryStyles.barTrack}>
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${masteredPct * 100}%` as `${number}%`,
                      backgroundColor: n.colors.success,
                    },
                  ]}
                />
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${(reviewedPct - masteredPct) * 100}%` as `${number}%`,
                      backgroundColor: n.colors.warning,
                    },
                  ]}
                />
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${(watchedPct - reviewedPct) * 100}%` as `${number}%`,
                      backgroundColor: n.colors.accent,
                    },
                  ]}
                />
              </View>
            )}
            {/* Action row */}
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
                      `This removes the BTR lecture marker for ${subject.name}. Topic study progress is not affected.`,
                    );
                    if (ok) handleUnmark(subject.id);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <LinearText style={[dbmciStyles.markBtn, { color: n.colors.textMuted }]}>
                    Unwatch
                  </LinearText>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={async () => {
                    const ok = await confirmDestructive(
                      'Mark BTR lecture as watched?',
                      hasOrganicStudyOnly
                        ? `Some ${subject.name} topics already have study progress (from quizzes/sessions). This will mark the BTR lecture as watched and set remaining unseen topics to "seen".`
                        : 'This marks all unseen leaf topics as "seen" for this subject. Watching ≠ mastery — Guru will then queue them for quiz and review.',
                    );
                    if (ok) handleMarkDone(subject.id);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <LinearText style={dbmciStyles.markBtn}>
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
