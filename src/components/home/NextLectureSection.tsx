import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import LinearSurface from '../primitives/LinearSurface';
import { linearTheme as n } from '../../theme/linearTheme';
import {
  getNextLectures,
  markLectureCompleted,
  type NextLectureInfo,
} from '../../db/queries/lectureSchedule';
import type { LectureBatchId } from '../../constants/lectureSchedule';
import { SUBJECTS_SEED } from '../../constants/syllabus';
import { launchMedicalApp, type SupportedMedicalApp } from '../../services/appLauncher';
import { useAppStore } from '../../store/useAppStore';
import * as Haptics from 'expo-haptics';

const subjectColorMap = new Map(SUBJECTS_SEED.map((s) => [s.id, s.colorHex]));

function getSubjectColor(subjectId: number): string {
  return subjectColorMap.get(subjectId) ?? n.colors.accent;
}

interface NextLectureSectionProps {
  onLectureCompleted?: () => void;
}

export default function NextLectureSection({ onLectureCompleted }: NextLectureSectionProps) {
  const [lectures, setLectures] = useState<NextLectureInfo[]>([]);
  const [busyBatch, setBusyBatch] = useState<LectureBatchId | null>(null);

  const loadLectures = useCallback(async () => {
    try {
      const next = await getNextLectures();
      setLectures(next);
    } catch (e) {
      console.warn('[NextLecture] Failed to load:', e);
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

  if (lectures.length === 0) return null;

  return (
    <View style={styles.container}>
      {lectures.map((info) => {
        const pct = Math.round((info.completedCount / info.totalCount) * 100);
        const subColor = getSubjectColor(info.lecture.subjectId);
        const isBusy = busyBatch === info.batchId;

        return (
          <View key={info.batchId} style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>{info.batchShortName} LECTURE</Text>
            <Pressable
              onPress={() => handleCardPress(info)}
              style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${info.batchShortName} lecture: ${info.lecture.title}`}
            >
              <LinearSurface compact style={styles.card}>
                {/* Lecture info */}
                <View style={styles.lectureRow}>
                  <View style={[styles.subjectDot, { backgroundColor: subColor }]} />
                  <View style={styles.lectureInfo}>
                    <Text style={styles.lectureTitle} numberOfLines={1}>
                      {info.lecture.title}
                    </Text>
                    <Text style={styles.lectureSubtitle}>
                      Lecture {info.lecture.index} • {info.completedCount}/{info.totalCount} ({pct}
                      %)
                    </Text>
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

                {/* Progress bar */}
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
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // empty container, styling pushed to sectionWrap
  },
  cardPressable: {
    width: '100%',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  sectionWrap: {
    marginBottom: n.spacing.md,
  },
  sectionLabel: {
    color: n.colors.textMuted,
    fontWeight: '800' as const,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: n.spacing.md,
    textTransform: 'uppercase',
  },
  card: {
    marginBottom: 12,
    height: 135,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
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
    height: 4, // thicker
    backgroundColor: n.colors.border,
    overflow: 'hidden',
    borderBottomLeftRadius: 16, // matches typical LinearSurface rounding
    borderBottomRightRadius: 16,
  },
  progressFill: {
    height: '100%',
  },
});
