import React, { useCallback, useEffect, useState } from 'react';
import {
  InteractionManager,
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../components/primitives/LinearText';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSubjectBreakdown, type SubjectBreakdownRow } from '../db/queries/topics';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import {
  getTotalStudyMinutes,
  getCompletedSessionCount,
  getWeeklyComparison,
  calculateCurrentStreak,
} from '../db/queries/sessions';
import { getTotalExternalStudyMinutes } from '../db/queries/externalLogs';
import { useProfileQuery } from '../hooks/queries/useProfile';
import LoadingOrb from '../components/LoadingOrb';
import { ResponsiveContainer } from '../hooks/useResponsive';
import ReviewCalendar from '../components/ReviewCalendar';
import { linearTheme as n } from '../theme/linearTheme';
import { warningAlpha } from '../theme/colorUtils';
import ScreenHeader from '../components/ScreenHeader';
import LinearSurface from '../components/primitives/LinearSurface';
import { EmptyState } from '../components/primitives';
import type { MenuStackParamList } from '../navigation/types';

export default function StatsScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    return () => task.cancel();
  }, []);

  if (!ready) {
    return <LoadingOrb message="Preparing stats..." />;
  }

  return <StatsScreenContent />;
}

function StatsScreenContent() {
  const navigation = useNavigation<NavigationProp<MenuStackParamList>>();
  const { data: profile } = useProfileQuery();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalCovered: 0,
    totalTopics: 0,
    masteredCount: 0,
    coveragePercent: 0,
    projectedScore: 0,
    subjectBreakdown: [] as SubjectBreakdownRow[],
    masteredTopics: [] as string[],
    totalAppMinutes: 0,
    totalExternalMinutes: 0,
    totalSessions: 0,
    activeDays30: 0,
    // New stats
    currentStreak: 0,
    bestStreak: 0,
    thisWeek: { minutes: 0, sessions: 0, topics: 0 },
    lastWeek: { minutes: 0, sessions: 0, topics: 0 },
    projectedCompletionDays: 0,
    avgTopicsPerDay: 0,
    last7DayMinutes: [] as number[],
  });

  // Reload stats every time screen gains focus (not just on mount)
  const loadStats = useCallback(async () => {
    // Use SQL aggregation — avoids loading all 5000+ topic rows into JS
    const breakdown = await getSubjectBreakdown();

    const covered = breakdown.reduce((s, r) => s + r.covered, 0);
    const mastered = breakdown.reduce((s, r) => s + r.mastered, 0);
    const totalTopics = breakdown.reduce((s, r) => s + r.total, 0);
    const totalHighYield = breakdown.reduce((s, r) => s + r.highYieldTotal, 0);
    const highYieldCovered = breakdown.reduce((s, r) => s + r.highYieldCovered, 0);

    const highYieldPercent =
      totalHighYield > 0 ? Math.round((highYieldCovered / totalHighYield) * 100) : 0;
    const projectedScore = Math.min(300, Math.round(50 + highYieldPercent * 2.5));

    const [
      totalAppMinutes,
      totalExternalMinutes,
      totalSessions,
      activeDays30,
      last7DayMinutes,
      currentStreak,
      weeklyComp,
    ] = await Promise.all([
      getTotalStudyMinutes(),
      getTotalExternalStudyMinutes(),
      getCompletedSessionCount(),
      dailyLogRepository.getActiveStudyDays(30),
      dailyLogRepository.getDailyMinutesSeries(7),
      calculateCurrentStreak(),
      getWeeklyComparison(),
    ]);

    const bestStreak = profile?.streakBest ?? currentStreak;

    const remaining = totalTopics - covered;
    const avgTopicsPerDay = activeDays30 > 0 ? covered / activeDays30 : 1;
    const projectedCompletionDays =
      avgTopicsPerDay > 0 ? Math.ceil(remaining / avgTopicsPerDay) : 999;

    setStats({
      totalCovered: covered,
      totalTopics,
      masteredCount: mastered,
      coveragePercent: highYieldPercent,
      projectedScore,
      subjectBreakdown: breakdown.sort((a, b) => b.percent - a.percent),
      masteredTopics: [],
      totalAppMinutes,
      totalExternalMinutes,
      totalSessions,
      activeDays30,
      currentStreak,
      bestStreak,
      thisWeek: weeklyComp.thisWeek,
      lastWeek: weeklyComp.lastWeek,
      projectedCompletionDays,
      avgTopicsPerDay: Math.round(avgTopicsPerDay * 10) / 10,
      last7DayMinutes,
    });

    setLoading(false);
  }, [profile?.streakBest]);

  const loadStatsCb = useCallback(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void loadStats();
    });
    return () => task.cancel();
  }, [loadStats]);
  useFocusEffect(loadStatsCb);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  const { width: screenWidth } = useWindowDimensions();
  // Respect ResponsiveContainer max width (tablet caps at ~600px)
  const containerWidth = Math.min(screenWidth, 600) - n.spacing.lg * 2;

  if (loading) return <LoadingOrb message="Calculating your progress..." />;

  const daysToInicet = profile?.inicetDate
    ? profileRepository.getDaysToExam(profile.inicetDate)
    : 0;
  const totalLoggedMinutes = stats.totalAppMinutes + stats.totalExternalMinutes;
  const totalLoggedHeadline =
    totalLoggedMinutes >= 60
      ? `${Math.floor(totalLoggedMinutes / 60)}h`
      : `${Math.max(0, totalLoggedMinutes)}m`;
  const snapshotCards = [
    { label: 'Coverage', value: `${stats.coveragePercent}%`, tone: 'accent' as const },
    { label: 'Mastered', value: String(stats.masteredCount), tone: 'warning' as const },
    {
      label: 'Streak',
      value: `${stats.currentStreak}d`,
      tone: stats.currentStreak > 0 ? ('success' as const) : ('primary' as const),
    },
    { label: 'Logged', value: totalLoggedHeadline, tone: 'primary' as const },
  ];

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe} testID="stats-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={n.colors.accent}
            colors={[n.colors.accent]}
          />
        }
      >
        <ResponsiveContainer>
          <View style={styles.header}>
            <ScreenHeader
              title="Exam Readiness"
              onBackPress={() => navigation.navigate('MenuHome')}
              showSettings
            />
          </View>

          {stats.totalSessions === 0 ? (
            <EmptyState
              variant="card"
              icon="stats-chart-outline"
              iconSize={48}
              title="No study data yet"
              actions={[
                {
                  label: 'Start Your First Session →',
                  onPress: () => navigation.navigate('HomeTab' as never),
                  buttonVariant: 'primary',
                },
              ]}
              style={styles.emptyHeroCard}
            />
          ) : null}

          {stats.totalSessions > 0 && (
            <LinearSurface compact style={styles.snapshotCard}>
              <View style={styles.snapshotHeader}>
                <View style={styles.snapshotCopy}>
                  <LinearText variant="meta" tone="accent" style={styles.snapshotEyebrow}>
                    READINESS SNAPSHOT
                  </LinearText>
                  <LinearText variant="sectionTitle" style={styles.snapshotTitle}>
                    Coverage is moving in the right direction
                  </LinearText>
                  <LinearText variant="bodySmall" tone="secondary" style={styles.snapshotText}>
                    Track pace, consistency, mastery, and logged effort before diving into the full
                    analytics stack.
                  </LinearText>
                </View>
                <View style={styles.snapshotPill}>
                  <LinearText variant="chip" tone="accent">
                    {stats.totalSessions} sessions
                  </LinearText>
                </View>
              </View>
              <View style={styles.snapshotMetricsRow}>
                {snapshotCards.map((card) => (
                  <View key={card.label} style={styles.snapshotMetricCard}>
                    <LinearText variant="title" tone={card.tone} style={styles.snapshotMetricValue}>
                      {card.value}
                    </LinearText>
                    <LinearText
                      variant="caption"
                      tone="secondary"
                      style={styles.snapshotMetricLabel}
                    >
                      {card.label}
                    </LinearText>
                  </View>
                ))}
              </View>
            </LinearSurface>
          )}

          {/* The Big Projection Card */}
          <LinearSurface
            padded={false}
            borderColor={n.colors.borderHighlight}
            style={styles.projectionCard}
          >
            <View style={styles.projectionRow}>
              <View style={styles.projectionStat}>
                <LinearText style={styles.projectionVal}>{stats.coveragePercent}%</LinearText>
                <LinearText style={styles.projectionLabel}>High-Yield Covered</LinearText>
              </View>
              <View style={styles.projectionDivider} />
              <View style={styles.projectionStat}>
                <LinearText style={[styles.projectionVal, { color: n.colors.warning }]}>
                  ~{stats.projectedScore}/300
                </LinearText>
                <LinearText style={styles.projectionLabel}>Projected INICET Score</LinearText>
              </View>
            </View>
            <LinearText style={styles.projectionNote}>
              You can answer questions on {stats.coveragePercent}% of historically tested topics.
              Keep pushing.
            </LinearText>
            <LinearText style={styles.projectionFormula}>
              Score estimate = 50 base + (high-yield coverage % × 2.5). Covers up to 300.
            </LinearText>
          </LinearSurface>

          {/* Absolute Progress (Anti-Guilt) */}
          <LinearSurface padded={false} style={styles.absoluteCard}>
            <LinearText style={styles.absoluteTitle}>Total Knowledge Acquired</LinearText>
            <LinearText style={styles.absoluteBig}>
              {stats.totalCovered} / {stats.totalTopics}
            </LinearText>
            <LinearText style={styles.absoluteSub}>topics seen at least once</LinearText>

            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(stats.totalCovered / Math.max(1, stats.totalTopics)) * 100}%` },
                ]}
              />
            </View>
          </LinearSurface>

          {/* Consistency Card utilizing unused getActivityHistory metric */}
          <LinearSurface
            padded={false}
            style={[styles.absoluteCard, { backgroundColor: n.colors.successSurface }]}
          >
            <LinearText style={[styles.absoluteTitle, { color: n.colors.success }]}>
              30-Day Consistency
            </LinearText>
            <LinearText style={[styles.absoluteBig, { color: n.colors.success }]}>
              {stats.activeDays30} / 30 Days
            </LinearText>
            <LinearText style={styles.absoluteSub}>days studied in the past month</LinearText>
          </LinearSurface>

          {/* Streak Card */}
          <LinearSurface
            padded={false}
            style={[styles.absoluteCard, { backgroundColor: warningAlpha['10'] }]}
          >
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={32} color={n.colors.warning} />
              <View style={{ flex: 1 }}>
                <LinearText style={[styles.absoluteTitle, { color: n.colors.warning }]}>
                  Current Streak
                </LinearText>
                <LinearText style={[styles.absoluteBig, { color: n.colors.warning }]}>
                  {stats.currentStreak} Days
                </LinearText>
              </View>
              {stats.bestStreak > stats.currentStreak && (
                <View style={styles.bestStreakBadge}>
                  <LinearText style={styles.bestStreakText}>Best: {stats.bestStreak}</LinearText>
                </View>
              )}
            </View>
            {stats.currentStreak >= 7 && (
              <LinearText style={styles.streakMotivation}>
                {stats.currentStreak >= 30
                  ? 'Legendary dedication!'
                  : stats.currentStreak >= 14
                    ? 'Two weeks strong!'
                    : 'One week down!'}
              </LinearText>
            )}
          </LinearSurface>

          {/* Week-over-Week Comparison */}
          <LinearSurface padded={false} style={styles.absoluteCard}>
            <LinearText style={styles.absoluteTitle}>This Week vs Last Week</LinearText>
            <View style={styles.weekCompRow}>
              <View style={styles.weekCol}>
                <LinearText style={styles.weekLabel}>This Week</LinearText>
                <LinearText style={styles.weekVal}>
                  {Math.floor(stats.thisWeek.minutes / 60)}h {stats.thisWeek.minutes % 60}m
                </LinearText>
                <LinearText style={styles.weekSub}>
                  {stats.thisWeek.sessions} sessions · {stats.thisWeek.topics} topics
                </LinearText>
              </View>
              <View style={styles.weekDivider}>
                {(() => {
                  const diff = stats.thisWeek.minutes - stats.lastWeek.minutes;
                  const pct =
                    stats.lastWeek.minutes > 0
                      ? Math.round((diff / stats.lastWeek.minutes) * 100)
                      : stats.thisWeek.minutes > 0
                        ? 100
                        : 0;
                  const isUp = diff >= 0;
                  if (pct === 0) return null;
                  return (
                    <View
                      style={[
                        styles.weekChangeBadge,
                        {
                          backgroundColor: isUp ? n.colors.successSurface : n.colors.errorSurface,
                        },
                      ]}
                    >
                      <LinearText
                        style={[
                          styles.weekChangeText,
                          { color: isUp ? n.colors.success : n.colors.error },
                        ]}
                      >
                        {isUp ? '↑' : '↓'} {Math.abs(pct)}%
                      </LinearText>
                    </View>
                  );
                })()}
              </View>
              <View style={styles.weekCol}>
                <LinearText style={styles.weekLabel}>Last Week</LinearText>
                <LinearText style={[styles.weekVal, { color: n.colors.textMuted }]}>
                  {Math.floor(stats.lastWeek.minutes / 60)}h {stats.lastWeek.minutes % 60}m
                </LinearText>
                <LinearText style={styles.weekSub}>
                  {stats.lastWeek.sessions} sessions · {stats.lastWeek.topics} topics
                </LinearText>
              </View>
            </View>
          </LinearSurface>

          {/* Weekly Activity Sparkline */}
          {stats.last7DayMinutes.length === 7 && (
            <WeeklySparkline minutes={stats.last7DayMinutes} containerWidth={containerWidth} />
          )}

          {/* Projected Completion */}
          {stats.avgTopicsPerDay > 0 && stats.projectedCompletionDays < 365 && (
            <LinearSurface
              padded={false}
              borderColor={n.colors.borderHighlight}
              style={styles.absoluteCard}
            >
              <LinearText style={[styles.absoluteTitle, { color: n.colors.accent }]}>
                📅 Syllabus Completion Projection
              </LinearText>
              <LinearText style={[styles.absoluteBig, { color: n.colors.accent }]}>
                {stats.projectedCompletionDays} days
              </LinearText>
              <LinearText style={styles.absoluteSub}>
                At your pace of {stats.avgTopicsPerDay} topics/day (
                {stats.totalTopics - stats.totalCovered} remaining)
              </LinearText>
              {daysToInicet > 0 && (
                <LinearSurface
                  compact
                  padded={false}
                  style={[
                    styles.projectionNote,
                    {
                      marginTop: 12,
                      backgroundColor:
                        stats.projectedCompletionDays <= daysToInicet
                          ? n.colors.successSurface
                          : n.colors.errorSurface,
                    },
                  ]}
                >
                  <LinearText
                    style={{
                      color:
                        stats.projectedCompletionDays <= daysToInicet
                          ? n.colors.success
                          : n.colors.error,
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                  >
                    {stats.projectedCompletionDays <= daysToInicet
                      ? `On track! ${
                          daysToInicet - stats.projectedCompletionDays
                        } buffer days before INICET`
                      : `Need ${Math.ceil(
                          (stats.totalTopics - stats.totalCovered) / daysToInicet,
                        )} topics/day to finish before INICET`}
                  </LinearText>
                </LinearSurface>
              )}
            </LinearSurface>
          )}

          {/* Time Logged Card */}
          <LinearSurface padded={false} style={styles.absoluteCard}>
            <LinearText style={styles.absoluteTitle}>Time Invested</LinearText>
            <LinearText style={styles.absoluteBig}>
              {Math.floor((stats.totalAppMinutes + stats.totalExternalMinutes) / 60)}h{' '}
              {(stats.totalAppMinutes + stats.totalExternalMinutes) % 60}m
            </LinearText>
            <LinearText style={styles.absoluteSub}>
              Total study time across {stats.totalSessions} sessions
            </LinearText>
          </LinearSurface>

          {/* Mastered Topics Boost */}
          {stats.masteredCount > 0 && (
            <LinearSurface
              padded={false}
              borderColor={warningAlpha['18']}
              style={styles.masteredCard}
            >
              <Ionicons name="flame" size={32} color={n.colors.warning} />
              <View style={styles.masteredInfo}>
                <LinearText style={styles.masteredTitle}>
                  You know {stats.masteredCount} topics cold.
                </LinearText>
                <LinearText style={styles.masteredSub}>
                  {stats.masteredTopics.length > 0
                    ? `Including: ${stats.masteredTopics.join(', ')}${
                        stats.masteredCount > 10 ? '...' : '.'
                      }`
                    : 'Keep stacking strong reviews and this bank will grow quickly.'}
                </LinearText>
              </View>
            </LinearSurface>
          )}

          {/* Subject Breakdown */}
          <LinearSurface compact style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <LinearText variant="meta" tone="muted" style={styles.sectionEyebrow}>
                  SUBJECT COVERAGE
                </LinearText>
                <LinearText style={styles.sectionTitle}>Coverage by subject</LinearText>
              </View>
              <View style={styles.sectionPill}>
                <LinearText variant="chip" tone="accent">
                  {stats.subjectBreakdown.length} tracked
                </LinearText>
              </View>
            </View>
            <View style={styles.subjectGrid}>
              {stats.subjectBreakdown.map((sub) => (
                <LinearSurface key={sub.id} padded={false} style={styles.subjectRow}>
                  <View style={styles.subjectHeaderRow}>
                    <View style={styles.subjectNameRow}>
                      <View style={[styles.subjectDot, { backgroundColor: sub.color }]} />
                      <LinearText style={styles.subjectName}>{sub.name}</LinearText>
                    </View>
                    <LinearText style={styles.subjectPercent}>{sub.percent}%</LinearText>
                  </View>
                  <View style={styles.subProgressBar}>
                    <View
                      style={[
                        styles.subProgressFill,
                        { width: `${sub.percent}%`, backgroundColor: sub.color },
                      ]}
                    />
                  </View>
                  <LinearText style={styles.subjectFraction}>
                    {sub.covered} / {sub.total} topics
                  </LinearText>
                </LinearSurface>
              ))}
            </View>
          </LinearSurface>

          {/* Review Calendar */}
          <LinearSurface compact style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <LinearText variant="meta" tone="muted" style={styles.sectionEyebrow}>
                  REVIEW SCHEDULE
                </LinearText>
                <LinearText style={styles.sectionTitle}>Upcoming revision load</LinearText>
              </View>
              <View style={styles.sectionPill}>
                <LinearText variant="chip" tone={daysToInicet > 0 ? 'accent' : 'secondary'}>
                  {daysToInicet > 0 ? `${daysToInicet}d to INICET` : 'Track reviews'}
                </LinearText>
              </View>
            </View>
            <ReviewCalendar />
          </LinearSurface>

          <View style={styles.bottomSpacer} />
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function WeeklySparkline({
  minutes,
  containerWidth,
}: {
  minutes: number[];
  containerWidth: number;
}) {
  const chartPadding = 32;
  const chartWidth = containerWidth - chartPadding;
  const gap = 4;
  const barWidth = Math.floor((chartWidth - gap * 6) / 7);
  const chartHeight = 60;
  const maxMins = Math.max(...minutes, 1);
  const todayDow = new Date().getDay();

  return (
    <LinearSurface padded={false} style={[sparkStyles.card]}>
      <LinearText style={sparkStyles.title}>7-Day Activity</LinearText>
      <Svg width={chartWidth} height={chartHeight + 20}>
        {minutes.map((mins, i) => {
          const barH = Math.max(2, Math.round((mins / maxMins) * chartHeight));
          const x = i * (barWidth + gap);
          const isToday = i === 6;
          const fill = isToday ? n.colors.accent : mins > 0 ? n.colors.success : n.colors.border;
          const label = DAY_LETTERS[(todayDow - (6 - i) + 7) % 7];
          return (
            <React.Fragment key={i}>
              <Rect
                x={x}
                y={chartHeight - barH}
                width={barWidth}
                height={barH}
                fill={fill}
                rx={3}
              />
              <SvgText
                x={x + barWidth / 2}
                y={chartHeight + 14}
                fontSize={10}
                fill={isToday ? n.colors.accent : n.colors.textMuted}
                textAnchor="middle"
              >
                {label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </LinearSurface>
  );
}

const sparkStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: n.spacing.xl,
    marginBottom: 20,
  },
  title: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: n.spacing.lg,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { padding: n.spacing.lg, paddingBottom: 40 },
  emptyHeroCard: {
    marginBottom: 20,
  },
  header: { marginBottom: n.spacing.xl, marginTop: n.spacing.lg },
  headerTitle: {
    color: n.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerSub: { color: n.colors.textSecondary, fontSize: 14, marginTop: 4 },
  snapshotCard: {
    marginBottom: 20,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: n.spacing.md,
  },
  snapshotCopy: {
    flex: 1,
  },
  snapshotEyebrow: {
    letterSpacing: 1.1,
  },
  snapshotTitle: {
    marginTop: n.spacing.xs,
  },
  snapshotText: {
    marginTop: n.spacing.xs,
  },
  snapshotPill: {
    backgroundColor: n.colors.primaryTintSoft,
    borderRadius: n.radius.full,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  snapshotMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: n.spacing.md,
  },
  snapshotMetricCard: {
    flexGrow: 1,
    minWidth: 110,
    backgroundColor: n.colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  snapshotMetricValue: {
    marginBottom: 2,
  },
  snapshotMetricLabel: {
    lineHeight: 16,
  },

  projectionCard: {
    borderRadius: 20,
    padding: n.spacing.xl,
    marginBottom: 20,
  },
  projectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  projectionStat: { alignItems: 'center', flex: 1 },
  projectionVal: {
    color: n.colors.accent,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  projectionLabel: {
    color: n.colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  projectionDivider: { width: 1, height: 40, backgroundColor: n.colors.borderLight },
  projectionNote: {
    color: n.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    padding: 12,
    borderRadius: 12,
  },

  projectionFormula: {
    color: n.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },

  absoluteCard: {
    borderRadius: 20,
    padding: n.spacing.xl,
    marginBottom: 20,
  },
  absoluteTitle: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  absoluteBig: { color: n.colors.textPrimary, fontSize: 34, fontWeight: '900' },
  absoluteSub: { color: n.colors.textMuted, fontSize: 13, marginBottom: n.spacing.lg },
  progressBar: {
    height: 8,
    backgroundColor: n.colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: n.colors.success, borderRadius: 4 },

  masteredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: warningAlpha['10'],
    padding: 20,
    marginBottom: 24,
  },
  masteredInfo: { flex: 1 },
  masteredTitle: { color: n.colors.warning, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  masteredSub: { color: n.colors.warning, fontSize: 13, lineHeight: 18 },

  sectionCard: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: n.spacing.md,
    marginBottom: n.spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  sectionEyebrow: {
    letterSpacing: 1.1,
  },
  sectionPill: {
    backgroundColor: n.colors.primaryTintSoft,
    borderRadius: n.radius.full,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionTitle: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  subjectGrid: { gap: 16 },
  subjectRow: {
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: n.spacing.lg,
  },
  subjectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  subjectDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10, flexShrink: 0 },
  subjectName: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  subjectPercent: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    flexShrink: 0,
  },
  subProgressBar: {
    height: 6,
    backgroundColor: n.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  subProgressFill: { height: '100%', borderRadius: 3 },
  subjectFraction: { color: n.colors.textMuted, fontSize: 11, textAlign: 'right' },

  // Streak styles
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bestStreakBadge: {
    backgroundColor: warningAlpha['10'],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bestStreakText: { color: n.colors.warning, fontSize: 12, fontWeight: '700' },
  streakMotivation: {
    color: n.colors.warning,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },

  // Week comparison styles
  weekCompRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  weekCol: { flex: 1 },
  weekLabel: {
    color: n.colors.textSecondary,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  weekVal: { color: n.colors.textPrimary, fontSize: 20, fontWeight: '900' },
  weekSub: { color: n.colors.textMuted, fontSize: 11, marginTop: 2, flexWrap: 'wrap' },
  weekDivider: { width: 60, alignItems: 'center', justifyContent: 'center' },
  weekChangeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  weekChangeText: { fontSize: 14, fontWeight: '800' },

  bottomSpacer: { height: 60 },
});
