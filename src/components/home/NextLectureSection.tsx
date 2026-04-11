import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable, InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import LinearSurface from '../primitives/LinearSurface';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import {
  getNextLectures,
  markLectureCompleted,
  type NextLectureInfo,
} from '../../db/queries/lectureSchedule';
import { getBatchById, type LectureBatchId } from '../../constants/lectureSchedule';
import { SUBJECTS_SEED } from '../../constants/syllabus';
import { launchMedicalApp, type SupportedMedicalApp } from '../../services/appLauncher';
import { useAppStore } from '../../store/useAppStore';
import * as Haptics from 'expo-haptics';
import HomeSectionHeader from './HomeSectionHeader';
import { HOME_SECTION_GAP, HOME_TILE_HEIGHT } from './homeLayout';

const subjectColorMap = new Map(SUBJECTS_SEED.map((s) => [s.id, s.colorHex]));
const HOME_LECTURE_BATCH_ORDER: LectureBatchId[] = ['dbmci_one', 'btr'];

function getSubjectColor(subjectId: number): string {
  return subjectColorMap.get(subjectId) ?? n.colors.accent;
}

function getEmptyStateCopy(batchShortName: string, hasLoaded: boolean, loadFailed: boolean) {
  if (!hasLoaded) {
    return {
      title: 'Loading next lecture',
      body: `Checking your ${batchShortName} schedule.`,
    };
  }

  if (loadFailed) {
    return {
      title: 'Lecture unavailable',
      body: `We could not load the ${batchShortName} slot right now.`,
    };
  }

  return {
    title: `${batchShortName} batch complete`,
    body: 'No pending lecture is left in this batch right now.',
  };
}

interface NextLectureSectionProps {
  onLectureCompleted?: () => void;
}

export default function NextLectureSection({ onLectureCompleted }: NextLectureSectionProps) {
  const [lectures, setLectures] = useState<NextLectureInfo[]>([]);
  const [busyBatch, setBusyBatch] = useState<LectureBatchId | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadLectures = useCallback(async () => {
    try {
      setLoadFailed(false);
      const next = await getNextLectures();
      setLectures(next);
    } catch (e) {
      console.warn('[NextLecture] Failed to load:', e);
      setLoadFailed(true);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void loadLectures();
      });
      return () => task.cancel();
    }, [loadLectures]),
  );

  const handleCardPress = useCallback((info: NextLectureInfo) => {
    const profile = useAppStore.getState().profile;
    const faceTracking = profile?.faceTrackingEnabled ?? false;

    void launchMedicalApp(info.appId as SupportedMedicalApp, faceTracking, {
      groqKey: profile?.groqApiKey,
      deepgramKey: profile?.deepgramApiKey,
      huggingFaceToken: profile?.huggingFaceToken,
      huggingFaceModel: profile?.huggingFaceTranscriptionModel,
      localWhisperPath: profile?.localWhisperPath ?? undefined,
    });
  }, []);

  const handleMarkDone = useCallback(
    async (info: NextLectureInfo) => {
      setBusyBatch(info.batchId);
      try {
        await markLectureCompleted(info.batchId, info.lecture.index);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadLectures();
        onLectureCompleted?.();
      } catch (e) {
        console.warn('[NextLecture] Failed to mark done:', e);
      } finally {
        setBusyBatch(null);
      }
    },
    [loadLectures, onLectureCompleted],
  );

  const lectureByBatch = new Map(lectures.map((info) => [info.batchId, info]));

  return (
    <View style={styles.container}>
      {HOME_LECTURE_BATCH_ORDER.map((batchId) => {
        const batch = getBatchById(batchId);
        if (!batch) return null;

        const info = lectureByBatch.get(batchId);
        const emptyState = getEmptyStateCopy(batch.shortName, hasLoaded, loadFailed);
        const isBusy = info ? busyBatch === info.batchId : false;
        const pct = info ? Math.round((info.completedCount / info.totalCount) * 100) : 0;
        const subColor = info ? getSubjectColor(info.lecture.subjectId) : n.colors.border;

        return (
          <View key={batch.id} style={styles.sectionWrap}>
            <HomeSectionHeader label={`${batch.shortName} LECTURE`} />
            {info ? (
              <Pressable
                onPress={() => handleCardPress(info)}
                style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${info.batchShortName} lecture: ${info.lecture.title}`}
              >
                <LinearSurface compact style={styles.card}>
                  <View style={styles.lectureRow}>
                    <View style={[styles.subjectDot, { backgroundColor: subColor }]} />
                    <View style={styles.lectureInfo}>
                      <LinearText
                        variant="body"
                        tone="primary"
                        style={styles.lectureTitle}
                        numberOfLines={1}
                      >
                        {info.lecture.title}
                      </LinearText>
                      <LinearText variant="caption" tone="muted" style={styles.lectureSubtitle}>
                        Lecture {info.lecture.index} - {info.completedCount}/{info.totalCount} (
                        {pct}%)
                      </LinearText>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.doneBtn,
                        pressed && styles.doneBtnPressed,
                        isBusy && styles.doneBtnBusy,
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleMarkDone(info);
                      }}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${info.lecture.title} as done`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={isBusy ? 'hourglass-outline' : 'checkmark'}
                        size={16}
                        color={isBusy ? n.colors.textMuted : n.colors.success}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${pct}%`, backgroundColor: info.batchColor },
                      ]}
                    />
                  </View>
                </LinearSurface>
              </Pressable>
            ) : (
              <LinearSurface compact style={[styles.card, styles.emptyCard]}>
                <View style={styles.emptyCardContent}>
                  <LinearText variant="bodySmall" tone="primary" style={styles.emptyTitle}>
                    {emptyState.title}
                  </LinearText>
                  <LinearText variant="caption" tone="muted" style={styles.emptyBody}>
                    {emptyState.body}
                  </LinearText>
                </View>
              </LinearSurface>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: HOME_SECTION_GAP,
  },
  cardPressable: {
    width: '100%',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  sectionWrap: {},
  card: {
    height: HOME_TILE_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  emptyCard: {
    justifyContent: 'center',
  },
  emptyCardContent: {
    borderLeftWidth: 2,
    borderLeftColor: n.colors.border,
    paddingLeft: 14,
    paddingRight: 8,
  },
  emptyTitle: {
    color: n.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  emptyBody: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 4,
  },
  lectureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lectureInfo: {
    flex: 1,
  },
  lectureTitle: {
    color: n.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  lectureSubtitle: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  doneBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  doneBtnBusy: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: n.colors.border,
  },
  doneBtnPressed: {
    opacity: 0.88,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: n.colors.border,
    overflow: 'hidden',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  progressFill: {
    height: '100%',
  },
});
