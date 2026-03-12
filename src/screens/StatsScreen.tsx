import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSubjectBreakdown } from '../db/queries/topics';
import { getDaysToExam, getActiveStudyDays, getDailyMinutesSeries } from '../db/queries/progress';
import { getTotalStudyMinutes, getCompletedSessionCount, getWeeklyComparison, calculateCurrentStreak } from '../db/queries/sessions';
import { getTotalExternalStudyMinutes } from '../db/queries/externalLogs';
import { useAppStore } from '../store/useAppStore';
import LoadingOrb from '../components/LoadingOrb';
import { ResponsiveContainer } from '../hooks/useResponsive';
import ReviewCalendar from '../components/ReviewCalendar';
import { theme } from '../constants/theme';

export default function StatsScreen() {
  const profile = useAppStore(s => s.profile);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCovered: 0,
    totalTopics: 0,
    masteredCount: 0,
    coveragePercent: 0,
    projectedScore: 0,
    subjectBreakdown: [] as any[],
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

  useEffect(() => {
    loadStats();
  }, []);

  function loadStats() {
    // Use SQL aggregation — avoids loading all 5000+ topic rows into JS
    const breakdown = getSubjectBreakdown();

    const covered = breakdown.reduce((s, r) => s + r.covered, 0);
    const mastered = breakdown.reduce((s, r) => s + r.mastered, 0);
    const totalTopics = breakdown.reduce((s, r) => s + r.total, 0);
    const totalHighYield = breakdown.reduce((s, r) => s + r.highYieldTotal, 0);
    const highYieldCovered = breakdown.reduce((s, r) => s + r.highYieldCovered, 0);

    const highYieldPercent = totalHighYield > 0 ? Math.round((highYieldCovered / totalHighYield) * 100) : 0;
    const projectedScore = Math.min(300, Math.round(50 + (highYieldPercent * 2.5)));

    const totalAppMinutes = getTotalStudyMinutes();
    const totalExternalMinutes = getTotalExternalStudyMinutes();
    const totalSessions = getCompletedSessionCount();
    const activeDays30 = getActiveStudyDays(30);
    const last7DayMinutes = getDailyMinutesSeries(7);

    const currentStreak = calculateCurrentStreak();
    const bestStreak = profile?.streakBest ?? currentStreak;
    const weeklyComp = getWeeklyComparison();

    const remaining = totalTopics - covered;
    const avgTopicsPerDay = activeDays30 > 0 ? covered / activeDays30 : 1;
    const projectedCompletionDays = avgTopicsPerDay > 0 ? Math.ceil(remaining / avgTopicsPerDay) : 999;

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
  }

  if (loading) return <LoadingOrb message="Calculating your progress..." />;

  const daysToInicet = profile?.inicetDate ? getDaysToExam(profile.inicetDate) : 0;

  return (
    <SafeAreaView style={styles.safe} testID="stats-screen">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <ResponsiveContainer>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Exam Readiness</Text>
          <Text style={styles.headerSub}>Focus on how far you've come.</Text>
        </View>

        {stats.totalSessions === 0 ? (
          <View style={styles.emptyHeroCard}>
            <Text style={styles.emptyHeroTitle}>No study data yet</Text>
            <Text style={styles.emptyHeroText}>
              Your first session, lecture capture, or review block will unlock streaks, projections, and coverage trends here.
            </Text>
          </View>
        ) : null}

        {/* The Big Projection Card */}
        <View style={styles.projectionCard}>
          <View style={styles.projectionRow}>
            <View style={styles.projectionStat}>
              <Text style={styles.projectionVal}>{stats.coveragePercent}%</Text>
              <Text style={styles.projectionLabel}>High-Yield Covered</Text>
            </View>
            <View style={styles.projectionDivider} />
            <View style={styles.projectionStat}>
              <Text style={[styles.projectionVal, { color: '#FF9800' }]}>~{stats.projectedScore}/300</Text>
              <Text style={styles.projectionLabel}>Projected INICET Score</Text>
            </View>
          </View>
          <Text style={styles.projectionNote}>
            You can answer questions on {stats.coveragePercent}% of historically tested topics. Keep pushing.
          </Text>
        </View>

        {/* Absolute Progress (Anti-Guilt) */}
        <View style={styles.absoluteCard}>
          <Text style={styles.absoluteTitle}>Total Knowledge Acquired</Text>
          <Text style={styles.absoluteBig} numberOfLines={1} adjustsFontSizeToFit>{stats.totalCovered} / {stats.totalTopics}</Text>
          <Text style={styles.absoluteSub}>topics seen at least once</Text>
          
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(stats.totalCovered / Math.max(1, stats.totalTopics)) * 100}%` }]} />
          </View>
        </View>

        {/* Consistency Card utilizing unused getActivityHistory metric */}
        <View style={[styles.absoluteCard, { backgroundColor: '#1A2A1A' }]}>
          <Text style={[styles.absoluteTitle, { color: '#4CAF50' }]}>30-Day Consistency</Text>
          <Text style={[styles.absoluteBig, { color: '#4CAF50' }]} numberOfLines={1} adjustsFontSizeToFit>{stats.activeDays30} / 30 Days</Text>
          <Text style={styles.absoluteSub}>days studied in the past month</Text>
        </View>

        {/* Streak Card */}
        <View style={[styles.absoluteCard, { backgroundColor: '#2A1A0A' }]}>
          <View style={styles.streakRow}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.absoluteTitle, { color: '#FF9800' }]}>Current Streak</Text>
              <Text style={[styles.absoluteBig, { color: '#FF9800' }]} numberOfLines={1} adjustsFontSizeToFit>{stats.currentStreak} Days</Text>
            </View>
            {stats.bestStreak > stats.currentStreak && (
              <View style={styles.bestStreakBadge}>
                <Text style={styles.bestStreakText}>Best: {stats.bestStreak}</Text>
              </View>
            )}
          </View>
          {stats.currentStreak >= 7 && (
            <Text style={styles.streakMotivation}>
              {stats.currentStreak >= 30 ? "🏆 Legendary dedication!" : stats.currentStreak >= 14 ? "💪 Two weeks strong!" : "⭐ One week down!"}
            </Text>
          )}
        </View>

        {/* Week-over-Week Comparison */}
        <View style={styles.absoluteCard}>
          <Text style={styles.absoluteTitle}>This Week vs Last Week</Text>
          <View style={styles.weekCompRow}>
            <View style={styles.weekCol}>
              <Text style={styles.weekLabel}>This Week</Text>
              <Text style={styles.weekVal}>{Math.floor(stats.thisWeek.minutes / 60)}h {stats.thisWeek.minutes % 60}m</Text>
              <Text style={styles.weekSub}>{stats.thisWeek.sessions} sessions · {stats.thisWeek.topics} topics</Text>
            </View>
            <View style={styles.weekDivider}>
              {(() => {
                const diff = stats.thisWeek.minutes - stats.lastWeek.minutes;
                const pct = stats.lastWeek.minutes > 0 ? Math.round((diff / stats.lastWeek.minutes) * 100) : (stats.thisWeek.minutes > 0 ? 100 : 0);
                const isUp = diff >= 0;
                return (
                  <View style={[styles.weekChangeBadge, { backgroundColor: isUp ? '#1A2A1A' : '#2A1A1A' }]}>
                    <Text style={[styles.weekChangeText, { color: isUp ? '#4CAF50' : '#F44336' }]}>
                      {isUp ? '↑' : '↓'} {Math.abs(pct)}%
                    </Text>
                  </View>
                );
              })()}
            </View>
            <View style={styles.weekCol}>
              <Text style={styles.weekLabel}>Last Week</Text>
              <Text style={[styles.weekVal, { color: '#888' }]}>{Math.floor(stats.lastWeek.minutes / 60)}h {stats.lastWeek.minutes % 60}m</Text>
              <Text style={styles.weekSub}>{stats.lastWeek.sessions} sessions · {stats.lastWeek.topics} topics</Text>
            </View>
          </View>
        </View>

        {/* Weekly Activity Sparkline */}
        {stats.last7DayMinutes.length === 7 && (
          <WeeklySparkline minutes={stats.last7DayMinutes} />
        )}

        {/* Projected Completion */}
        {stats.avgTopicsPerDay > 0 && stats.projectedCompletionDays < 365 && (
          <View style={[styles.absoluteCard, { backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#6C63FF44' }]}>
            <Text style={[styles.absoluteTitle, { color: '#6C63FF' }]}>📅 Syllabus Completion Projection</Text>
            <Text style={[styles.absoluteBig, { color: '#6C63FF' }]} numberOfLines={1} adjustsFontSizeToFit>
              {stats.projectedCompletionDays} days
            </Text>
            <Text style={styles.absoluteSub}>
              At your pace of {stats.avgTopicsPerDay} topics/day ({stats.totalTopics - stats.totalCovered} remaining)
            </Text>
            {daysToInicet > 0 && (
              <View style={[styles.projectionNote, { marginTop: 12, backgroundColor: stats.projectedCompletionDays <= daysToInicet ? '#1A2A1A' : '#2A1A1A' }]}>
                <Text style={{ color: stats.projectedCompletionDays <= daysToInicet ? '#4CAF50' : '#F44336', fontSize: 13, textAlign: 'center' }}>
                  {stats.projectedCompletionDays <= daysToInicet 
                    ? `✅ On track! ${daysToInicet - stats.projectedCompletionDays} buffer days before INICET`
                    : `⚠️ Need ${Math.ceil((stats.totalTopics - stats.totalCovered) / daysToInicet)} topics/day to finish before INICET`
                  }
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Time Logged Card */}
        <View style={styles.absoluteCard}>
          <Text style={styles.absoluteTitle}>Time Invested</Text>
          <Text style={styles.absoluteBig} numberOfLines={1} adjustsFontSizeToFit>{Math.floor((stats.totalAppMinutes + stats.totalExternalMinutes) / 60)}h {(stats.totalAppMinutes + stats.totalExternalMinutes) % 60}m</Text>
          <Text style={styles.absoluteSub}>Total study time across {stats.totalSessions} sessions</Text>
        </View>

        {/* Mastered Topics Boost */}
        {stats.masteredCount > 0 && (
          <View style={styles.masteredCard}>
            <Text style={styles.masteredEmoji}>🔥</Text>
            <View style={styles.masteredInfo}>
              <Text style={styles.masteredTitle}>You know {stats.masteredCount} topics cold.</Text>
              <Text style={styles.masteredSub}>
                {stats.masteredTopics.length > 0
                  ? `Including: ${stats.masteredTopics.join(', ')}${stats.masteredCount > 10 ? '...' : '.'}`
                  : 'Keep stacking strong reviews and this bank will grow quickly.'}
              </Text>
            </View>
          </View>
        )}

        {/* Subject Breakdown */}
        <Text style={styles.sectionTitle}>Subject Coverage</Text>
        <View style={styles.subjectGrid}>
          {stats.subjectBreakdown.map(sub => (
            <View key={sub.id} style={styles.subjectRow}>
              <View style={styles.subjectHeader}>
                <View style={styles.subjectNameRow}>
                  <View style={[styles.subjectDot, { backgroundColor: sub.color }]} />
                  <Text style={styles.subjectName}>{sub.name}</Text>
                </View>
                <Text style={styles.subjectPercent}>{sub.percent}%</Text>
              </View>
              <View style={styles.subProgressBar}>
                <View style={[styles.subProgressFill, { width: `${sub.percent}%`, backgroundColor: sub.color }]} />
              </View>
              <Text style={styles.subjectFraction}>{sub.covered} / {sub.total} topics</Text>
            </View>
          ))}
        </View>

        {/* Review Calendar */}
        <Text style={styles.sectionTitle}>Review Schedule</Text>
        <ReviewCalendar />

        <View style={styles.bottomSpacer} />
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function WeeklySparkline({ minutes }: { minutes: number[] }) {
  const { width: screenWidth } = Dimensions.get('window');
  const chartPadding = 32;
  const chartWidth = screenWidth - chartPadding * 2;
  const gap = 4;
  const barWidth = Math.floor((chartWidth - gap * 6) / 7);
  const chartHeight = 60;
  const maxMins = Math.max(...minutes, 1);
  const todayDow = new Date().getDay();

  return (
    <View style={[sparkStyles.card]}>
      <Text style={sparkStyles.title}>7-Day Activity</Text>
      <Svg width={chartWidth} height={chartHeight + 20}>
        {minutes.map((mins, i) => {
          const barH = Math.max(2, Math.round((mins / maxMins) * chartHeight));
          const x = i * (barWidth + gap);
          const isToday = i === 6;
          const fill = isToday ? '#6C63FF' : mins > 0 ? '#4CAF50' : '#2A2A38';
          const label = DAY_LETTERS[(todayDow - (6 - i) + 7) % 7];
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={chartHeight - barH} width={barWidth} height={barH} fill={fill} rx={3} />
              <SvgText x={x + barWidth / 2} y={chartHeight + 14} fontSize={10} fill={isToday ? '#6C63FF' : '#555'} textAnchor="middle">
                {label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  card: { backgroundColor: '#1A1A24', borderRadius: 20, padding: 24, marginBottom: 20 },
  title: { color: '#9E9E9E', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 16 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: { padding: 16 },
  emptyHeroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyHeroTitle: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptyHeroText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  header: { marginBottom: 24, marginTop: 16 },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 0.5 },
  headerSub: { color: '#9E9E9E', fontSize: 14, marginTop: 4 },
  
  projectionCard: { backgroundColor: '#1A1A2E', borderRadius: 20, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: '#6C63FF66' },
  projectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 20 },
  projectionStat: { alignItems: 'center', flex: 1 },
  projectionVal: { color: '#6C63FF', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  projectionLabel: { color: '#9E9E9E', fontSize: 11, marginTop: 4, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
  projectionDivider: { width: 1, height: 40, backgroundColor: '#333344' },
  projectionNote: { color: '#C5C5D2', fontSize: 13, textAlign: 'center', lineHeight: 20, backgroundColor: '#12121A', padding: 12, borderRadius: 12 },

  absoluteCard: { backgroundColor: '#1A1A24', borderRadius: 20, padding: 24, marginBottom: 20 },
  absoluteTitle: { color: '#9E9E9E', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  absoluteBig: { color: '#fff', fontSize: 34, fontWeight: '900' },
  absoluteSub: { color: '#666', fontSize: 13, marginBottom: 16 },
  progressBar: { height: 8, backgroundColor: '#2A2A38', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 4 },

  masteredCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A1A0A', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#FF980066' },
  masteredEmoji: { fontSize: 32, marginRight: 16 },
  masteredInfo: { flex: 1 },
  masteredTitle: { color: '#FF9800', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  masteredSub: { color: '#D29D52', fontSize: 13, lineHeight: 18 },

  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 16, marginTop: 8 },
  subjectGrid: { gap: 16 },
  subjectRow: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 16 },
  subjectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subjectNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  subjectDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10, flexShrink: 0 },
  subjectName: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  subjectPercent: { color: '#fff', fontSize: 15, fontWeight: '900', flexShrink: 0 },
  subProgressBar: { height: 6, backgroundColor: '#2A2A38', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  subProgressFill: { height: '100%', borderRadius: 3 },
  subjectFraction: { color: '#666', fontSize: 11, textAlign: 'right' },
  
  // Streak styles
  streakRow: { flexDirection: 'row', alignItems: 'center' },
  streakEmoji: { fontSize: 40, marginRight: 16 },
  bestStreakBadge: { backgroundColor: '#3A2A1A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  bestStreakText: { color: '#FF9800', fontSize: 12, fontWeight: '700' },
  streakMotivation: { color: '#D29D52', fontSize: 13, marginTop: 12, textAlign: 'center' },
  
  // Week comparison styles
  weekCompRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  weekCol: { flex: 1 },
  weekLabel: { color: '#888', fontSize: 10, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
  weekVal: { color: '#fff', fontSize: 20, fontWeight: '900' },
  weekSub: { color: '#666', fontSize: 10, marginTop: 2, flexWrap: 'wrap' },
  weekDivider: { width: 60, alignItems: 'center', justifyContent: 'center' },
  weekChangeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  weekChangeText: { fontSize: 14, fontWeight: '800' },
  
  bottomSpacer: { height: 60 }
});
