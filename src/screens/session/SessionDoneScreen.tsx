import React, { useEffect } from 'react';
import { Animated, SafeAreaView, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../../components/primitives/LinearText';
import LinearSurface from '../../components/primitives/LinearSurface';
import LinearButton from '../../components/primitives/LinearButton';
import { IconCircle } from '../../components/primitives/IconCircle';
import { useEntranceAnimation } from '../../hooks/useEntranceAnimation';
import type { AgendaItem } from '../../types';

export function SessionDoneScreen({
  completedCount,
  elapsedSeconds,
  xpTotal,
  quizResults,
  agendaItems,
  onClose,
  onReviewGaps,
}: {
  completedCount: number;
  elapsedSeconds: number;
  xpTotal: number;
  quizResults: Array<{ topicId: number; correct: number; total: number }>;
  agendaItems: AgendaItem[];
  onClose: () => void;
  onReviewGaps: (topicIds: number[]) => void;
}) {
  const { fade, slide } = useEntranceAnimation();
  const mins = Math.round(elapsedSeconds / 60);

  // Identify topics with knowledge gaps (quiz score < 75% or any wrong answer)
  const gapTopicIds = quizResults
    .filter((r) => r.total > 0 && r.correct / r.total < 0.75)
    .map((r) => r.topicId);

  // Map topic ids to names using agenda
  const topicById = new Map(agendaItems.map((i) => [i.topic.id, i.topic]));
  const gapTopics = gapTopicIds
    .map((id) => topicById.get(id))
    .filter(Boolean) as AgendaItem['topic'][];

  // Quiz summary per topic
  const quizSummary = quizResults
    .filter((r) => r.total > 0)
    .map((r) => ({
      ...r,
      topic: topicById.get(r.topicId),
      pct: Math.round((r.correct / r.total) * 100),
    }))
    .filter((r) => r.topic != null);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[styles.doneContainer, { opacity: fade, transform: [{ translateY: slide }] }]}
          testID="session-done"
        >
          <IconCircle name="trophy" color={n.colors.warning} size={64} />
          <LinearText variant="title" centered style={styles.doneTitle}>
            Session Complete!
          </LinearText>

          {/* Stats row */}
          <LinearSurface style={styles.summaryCard} padded={false}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons
                  name="book-outline"
                  size={18}
                  color={n.colors.textMuted}
                  style={{ marginBottom: 4 }}
                />
                <LinearText variant="display" centered style={styles.summaryValue}>
                  {completedCount}
                </LinearText>
                <LinearText variant="caption" tone="secondary" centered style={styles.summaryLabel}>
                  Topics
                </LinearText>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={n.colors.textMuted}
                  style={{ marginBottom: 4 }}
                />
                <LinearText variant="display" centered style={styles.summaryValue}>
                  {mins}
                </LinearText>
                <LinearText variant="caption" tone="secondary" centered style={styles.summaryLabel}>
                  Minutes
                </LinearText>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Ionicons
                  name="star-outline"
                  size={18}
                  color={n.colors.warning}
                  style={{ marginBottom: 4 }}
                />
                <LinearText
                  variant="display"
                  centered
                  style={[styles.summaryValue, { color: n.colors.warning }]}
                >
                  +{xpTotal}
                </LinearText>
                <LinearText variant="caption" tone="secondary" centered style={styles.summaryLabel}>
                  XP
                </LinearText>
              </View>
            </View>
          </LinearSurface>

          {/* Quiz performance breakdown */}
          {quizSummary.length > 0 && (
            <>
              <LinearText
                variant="chip"
                tone="muted"
                style={[styles.revealSectionLabel, { marginTop: 8, alignSelf: 'flex-start' }]}
              >
                QUIZ PERFORMANCE
              </LinearText>
              <View style={{ width: '100%', marginBottom: 12 }}>
                {quizSummary.map((r) => {
                  const good = r.pct >= 75;
                  const barColor = good
                    ? n.colors.success
                    : r.pct >= 50
                      ? n.colors.warning
                      : n.colors.error;
                  return (
                    <View
                      key={r.topicId}
                      style={{
                        marginBottom: 8,
                        backgroundColor: n.colors.card,
                        borderRadius: n.radius.md,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: `${barColor}44`,
                        borderLeftWidth: 3,
                        borderLeftColor: barColor,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <LinearText variant="label" style={{ flex: 1 }} truncate>
                          {r.topic?.name ?? `Topic ${r.topicId}`}
                        </LinearText>
                        <LinearText
                          variant="bodySmall"
                          style={{ color: barColor, fontWeight: '800', marginLeft: 8 }}
                        >
                          {r.correct}/{r.total} ({r.pct}%)
                        </LinearText>
                      </View>
                      {/* Progress bar */}
                      <View
                        style={{
                          height: 4,
                          backgroundColor: n.colors.border,
                          borderRadius: 2,
                          marginTop: 8,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            height: '100%',
                            width: `${r.pct}%`,
                            backgroundColor: barColor,
                            borderRadius: 2,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Knowledge gaps */}
          {gapTopics.length > 0 && (
            <>
              <LinearSurface
                style={{
                  width: '100%',
                  borderRadius: n.radius.md,
                  padding: n.spacing.lg,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: `${n.colors.error}33`,
                  borderLeftWidth: 3,
                  borderLeftColor: n.colors.error,
                  backgroundColor: n.colors.errorSurface,
                }}
                padded={false}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}
                >
                  <Ionicons name="alert-circle" size={16} color={n.colors.error} />
                  <LinearText variant="chip" style={{ color: n.colors.error, letterSpacing: 1 }}>
                    KNOWLEDGE GAPS ({gapTopics.length})
                  </LinearText>
                </View>
                {gapTopics.map((t) => (
                  <View
                    key={t.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: n.colors.error,
                      }}
                    />
                    <LinearText
                      variant="bodySmall"
                      style={{ color: n.colors.textPrimary, flex: 1 }}
                    >
                      {t.name}
                    </LinearText>
                    <LinearText
                      variant="meta"
                      tone="muted"
                      style={{ color: n.colors.textSecondary }}
                    >
                      {t.subjectCode}
                    </LinearText>
                  </View>
                ))}
              </LinearSurface>
              <LinearButton
                label={`Review ${gapTopics.length} Gap${gapTopics.length > 1 ? 's' : ''} Now`}
                variant="secondary"
                style={[
                  styles.doneSecondaryBtn,
                  { borderColor: `${n.colors.error}44`, marginBottom: 0, marginTop: 0 },
                ]}
                textStyle={{ color: n.colors.error, fontWeight: '700' }}
                onPress={() => onReviewGaps(gapTopicIds)}
              />
            </>
          )}

          {gapTopics.length === 0 && quizSummary.length > 0 && (
            <LinearSurface
              style={{
                width: '100%',
                borderRadius: n.radius.md,
                padding: n.spacing.lg,
                marginBottom: 16,
                borderLeftWidth: 3,
                borderLeftColor: n.colors.success,
              }}
              padded={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color={n.colors.success} />
                <LinearText
                  variant="bodySmall"
                  style={{ color: n.colors.success, fontWeight: '700' }}
                >
                  No knowledge gaps — solid performance!
                </LinearText>
              </View>
            </LinearSurface>
          )}

          <LinearButton
            label="Back to Home"
            variant="primary"
            style={styles.doneBtn}
            onPress={onClose}
            testID="back-to-home-btn"
          />
        </Animated.View>
      </ScrollView>
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
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: n.spacing.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.card,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { color: n.colors.textPrimary, fontSize: 28, fontWeight: '900' },
  summaryLabel: { color: n.colors.textSecondary, fontSize: 12, marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: n.colors.border },
  revealSectionLabel: {
    letterSpacing: 1,
    marginBottom: 10,
  },
  doneSecondaryBtn: {
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: n.spacing.lg,
    marginTop: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    width: '100%',
    alignItems: 'center',
  },
  doneBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: n.spacing.lg,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
});
