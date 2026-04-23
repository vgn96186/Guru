import React, { useEffect } from 'react';
import {
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../../components/primitives/LinearText';
import LinearSurface from '../../components/primitives/LinearSurface';
import LinearButton from '../../components/primitives/LinearButton';
import { IconCircle } from '../../components/primitives/IconCircle';
import { useEntranceAnimation } from '../../hooks/useEntranceAnimation';
import type { Mood } from '../../types';

export function WarmUpMomentumScreen({
  correctTotal,
  answeredTotal,
  mood: _mood,
  onMCQBlock,
  onContinue,
  onLecture,
  onDone,
}: {
  correctTotal: number;
  answeredTotal: number;
  mood: Mood;
  onMCQBlock: () => void;
  onContinue: () => void;
  onLecture: () => void;
  onDone: () => void;
}) {
  const { fade, slide } = useEntranceAnimation();
  const pct = answeredTotal > 0 ? Math.round((correctTotal / answeredTotal) * 100) : 0;
  const scoreColor = pct >= 70 ? n.colors.success : pct >= 40 ? n.colors.warning : n.colors.error;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <Animated.View
        style={[styles.doneContainer, { opacity: fade, transform: [{ translateY: slide }] }]}
      >
        <IconCircle name="flash" color={n.colors.warning} size={64} />
        <LinearText variant="title" centered style={styles.doneTitle}>
          Nice work, Doctor.
        </LinearText>

        {answeredTotal > 0 ? (
          <LinearSurface style={styles.warmupScoreCard}>
            <LinearText
              variant="display"
              centered
              style={[styles.warmupScoreNumber, { color: scoreColor }]}
            >
              {pct}%
            </LinearText>
            <LinearText
              variant="bodySmall"
              tone="secondary"
              centered
              style={styles.warmupScoreFraction}
            >
              {correctTotal}/{answeredTotal} correct
            </LinearText>
          </LinearSurface>
        ) : (
          <LinearText variant="body" tone="secondary" centered style={styles.doneStat}>
            Session complete
          </LinearText>
        )}

        <LinearText
          variant="body"
          tone="secondary"
          centered
          style={[styles.doneStat, { marginBottom: 24 }]}
        >
          What&apos;s next?
        </LinearText>

        <LinearButton
          label="Watch a lecture"
          variant="primary"
          style={styles.doneBtn}
          onPress={onLecture}
          leftIcon={<Ionicons name="videocam-outline" size={18} color={n.colors.textInverse} />}
        />
        <LinearButton
          label="50 MCQ Block"
          variant="secondary"
          style={styles.doneSecondaryBtn}
          textStyle={styles.doneSecondaryBtnText}
          onPress={onMCQBlock}
          leftIcon={<Ionicons name="list-outline" size={18} color={n.colors.textPrimary} />}
        />
        <LinearButton
          label="Continue studying"
          variant="secondary"
          style={styles.doneSecondaryBtn}
          textStyle={styles.doneSecondaryBtnText}
          onPress={onContinue}
          leftIcon={<Ionicons name="book-outline" size={18} color={n.colors.textPrimary} />}
        />
        <TouchableOpacity style={styles.leaveBtn} onPress={onDone}>
          <View style={styles.btnRow}>
            <Ionicons name="hand-left-outline" size={14} color={n.colors.textMuted} />
            <LinearText variant="bodySmall" tone="muted" style={styles.leaveBtnText}>
              That&apos;s enough for now
            </LinearText>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: n.spacing.xl,
  },
  doneTitle: {
    color: n.colors.textPrimary,
    marginTop: n.spacing.lg,
    marginBottom: n.spacing.xl,
    textAlign: 'center',
  },
  warmupScoreCard: {
    alignItems: 'center',
    marginBottom: 16,
    borderRadius: n.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  warmupScoreNumber: { fontSize: 42, fontWeight: '900' },
  warmupScoreFraction: {
    marginTop: 4,
  },
  doneStat: {
    marginBottom: n.spacing.xl,
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: n.spacing.lg,
    marginBottom: 12,
  },
  doneSecondaryBtn: {
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: n.spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    width: '100%',
    alignItems: 'center',
  },
  doneSecondaryBtnText: {
    color: n.colors.textPrimary,
  },
  leaveBtn: { paddingVertical: 12, minHeight: 44, justifyContent: 'center', marginTop: 12 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaveBtnText: { color: n.colors.textMuted, fontSize: 14 },
});
