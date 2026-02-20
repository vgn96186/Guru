import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { getLast30DaysLog, getActivityHistory, getUserProfile, getDaysToExam } from '../db/queries/progress';
import { getSubjectCoverage, getAllSubjects, getWeakestTopics } from '../db/queries/topics';
import { getRecentSessions, getTotalStudyMinutes } from '../db/queries/sessions';
import type { DailyLog, TopicWithProgress } from '../types';

export default function StatsScreen() {
  const { profile, levelInfo, refreshProfile } = useAppStore();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [weakTopics, setWeakTopics] = useState<TopicWithProgress[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [subjectCoverage, setSubjectCoverage] = useState<Map<number, { total: number; seen: number }>>(new Map());
  const [subjects, setSubjects] = useState(getAllSubjects);
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  useEffect(() => {
    refreshProfile();
    setLogs(getActivityHistory(90)); // Fetch 90 days for 12-week heatmap
    setWeakTopics(getWeakestTopics(5));
    setTotalMinutes(getTotalStudyMinutes());
    
    const cov = getSubjectCoverage();
    const covMap = new Map(cov.map(c => [c.subjectId, { total: c.total, seen: c.seen }]));
    setSubjectCoverage(covMap);

    // Sort subjects by progress (lowest % first)
    const sorted = [...getAllSubjects()].sort((a, b) => {
      const covA = covMap.get(a.id) ?? { total: 0, seen: 0 };
      const covB = covMap.get(b.id) ?? { total: 0, seen: 0 };
      const pctA = covA.total > 0 ? covA.seen / covA.total : 0;
      const pctB = covB.total > 0 ? covB.seen / covB.total : 0;
      return pctA - pctB;
    });
    setSubjects(sorted);
  }, []);

  if (!profile || !levelInfo) return null;

  const daysToInicet = getDaysToExam(profile.inicetDate);
  // Calculate active days based on the logs we fetched (90 days window)
  // To match the "this month" label or similar, we might want to filter, but "Active days" usually implies recent history.
  // Let's stick to total active days in the fetched period or just last 30 for the text.
  const recentLogs = logs.filter(l => new Date(l.date) >= new Date(Date.now() - 30 * 86400000));
  const studiedDays = recentLogs.filter(l => l.totalMinutes >= 20).length;
  const totalXpThisMonth = recentLogs.reduce((s, l) => s + l.xpEarned, 0);

  const displayedSubjects = showAllSubjects ? subjects : subjects.slice(0, 5);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your Progress</Text>

        {/* Overview cards */}
        <View style={styles.statsGrid}>
          <StatCard label="Streak" value={`${profile.streakCurrent}🔥`} sub="days" />
          <StatCard label="Best" value={`${profile.streakBest}🏆`} sub="days" />
          <StatCard label="Total time" value={`${Math.round(totalMinutes/60)}h`} sub="studied" />
          <StatCard label="XP (30d)" value={`${totalXpThisMonth}`} sub="points" />
        </View>

        {/* Exam countdowns */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exam Countdown</Text>
          <View style={styles.examRow}>
            <View style={[styles.examCard, { borderColor: '#E74C3C' }]}>
              <Text style={styles.examDays}>{daysToInicet}</Text>
              <Text style={styles.examLabel}>days</Text>
              <Text style={styles.examName}>INICET May</Text>
            </View>
            <View style={[styles.examCard, { borderColor: '#6C63FF' }]}>
              <Text style={styles.examDays}>{getDaysToExam(profile.neetDate)}</Text>
              <Text style={styles.examLabel}>days</Text>
              <Text style={styles.examName}>NEET-PG</Text>
            </View>
          </View>
        </View>

        {/* 12-week GitHub-style heatmap */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity (12 Weeks)</Text>
          <Text style={styles.sectionSub}>{studiedDays} active days in last 30 days</Text>
          <Heatmap logs={logs} />
        </View>

        {/* Subject coverage */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Subject Coverage (Lowest First)</Text>
            <TouchableOpacity onPress={() => setShowAllSubjects(!showAllSubjects)}>
              <Text style={styles.showAllText}>{showAllSubjects ? 'Collapse' : 'Show All'}</Text>
            </TouchableOpacity>
          </View>
          
          {displayedSubjects.map(s => {
            const cov = subjectCoverage.get(s.id) ?? { total: 0, seen: 0 };
            const pct = cov.total > 0 ? Math.round((cov.seen / cov.total) * 100) : 0;
            return (
              <View key={s.id} style={styles.subjectRow}>
                <View style={[styles.subjectDot, { backgroundColor: s.colorHex }]} />
                <Text style={styles.subjectName}>{s.shortCode}</Text>
                <View style={styles.subjectBarTrack}>
                  <View style={[styles.subjectBarFill, { width: `${pct}%`, backgroundColor: s.colorHex }]} />
                </View>
                <Text style={styles.subjectPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>

        {/* Weak topics */}
        {weakTopics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚔️ Nemesis Topics</Text>
            {weakTopics.map(t => (
              <View key={t.id} style={styles.weakRow}>
                <View style={[styles.weakDot, { backgroundColor: t.subjectColor }]} />
                <View style={styles.weakInfo}>
                  <Text style={styles.weakName}>{t.name}</Text>
                  <Text style={styles.weakSub}>{t.subjectName} · studied {t.progress.timesStudied}×</Text>
                </View>
                <View style={styles.confRow}>
                  {[1,2,3,4,5].map(i => (
                    <View key={i} style={[styles.confDot, { backgroundColor: i <= t.progress.confidence ? '#FF9800' : '#333' }]} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const HEAT_COLORS = ['#1A1A24', '#162B2C', '#1A4A4A', '#1A6F6F', '#00BCD4'];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SCREEN_W = Dimensions.get('window').width;
// 16px padding each side + 24px for day labels + gaps
const CELL_SIZE = Math.floor((SCREEN_W - 32 - 24 - 12 * 2) / 12);

function minuteIntensity(mins: number): number {
  if (mins >= 120) return 4;
  if (mins >= 60) return 3;
  if (mins >= 20) return 2;
  if (mins > 0) return 1;
  return 0;
}

function Heatmap({ logs }: { logs: import('../types').DailyLog[] }) {
  // Build a map of date → minutes
  const logMap = new Map(logs.map(l => [l.date, l.totalMinutes]));

  // Build 12 weeks × 7 days grid ending today
  const today = new Date();
  // Align to Monday of current week
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
  const gridEnd = new Date(today);
  gridEnd.setDate(today.getDate() - dayOfWeek + 6); // end on Sunday of current week

  // 12 weeks = 84 days
  const weeks: Array<Array<{ date: string; mins: number }>> = [];
  for (let w = 11; w >= 0; w--) {
    const week: Array<{ date: string; mins: number }> = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(gridEnd);
      cell.setDate(gridEnd.getDate() - w * 7 - (6 - d));
      const dateStr = cell.toISOString().slice(0, 10);
      const isFuture = cell > today;
      week.push({ date: dateStr, mins: isFuture ? -1 : (logMap.get(dateStr) ?? 0) });
    }
    weeks.push(week);
  }

  // Month labels: detect when month changes between week columns
  const monthLabels: Array<string | null> = weeks.map((week, i) => {
    const firstDay = week[0].date;
    const prevWeek = weeks[i - 1];
    if (!prevWeek) return firstDay.slice(5, 7);
    return prevWeek[0].date.slice(5, 7) !== firstDay.slice(5, 7) ? firstDay.slice(5, 7) : null;
  });
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <View>
      {/* Month labels */}
      <View style={heatStyles.monthRow}>
        <View style={{ width: 20 }} />
        {weeks.map((_, i) => (
          <View key={i} style={[heatStyles.monthCell, { width: CELL_SIZE }]}>
            {monthLabels[i] ? (
              <Text style={heatStyles.monthLabel}>
                {MONTHS[parseInt(monthLabels[i]!) - 1]}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      <View style={heatStyles.grid}>
        {/* Day labels */}
        <View style={heatStyles.dayLabels}>
          {DAY_LABELS.map((d, i) => (
            <Text key={i} style={[heatStyles.dayLabel, { height: CELL_SIZE, lineHeight: CELL_SIZE }]}>{i % 2 === 0 ? d : ''}</Text>
          ))}
        </View>
        {/* Cells */}
        {weeks.map((week, wi) => (
          <View key={wi} style={heatStyles.weekCol}>
            {week.map((cell, di) => (
              <View
                key={di}
                style={[
                  heatStyles.cell,
                  {
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: cell.mins < 0 ? 'transparent' : HEAT_COLORS[minuteIntensity(cell.mins)],
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      {/* Legend */}
      <View style={heatStyles.legend}>
        <Text style={heatStyles.legendText}>Less</Text>
        {HEAT_COLORS.map((c, i) => (
          <View key={i} style={[heatStyles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={heatStyles.legendText}>More</Text>
      </View>
    </View>
  );
}

const heatStyles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, gap: 2 },
  monthCell: { alignItems: 'flex-start' },
  monthLabel: { color: '#555', fontSize: 9 },
  grid: { flexDirection: 'row', gap: 2 },
  dayLabels: { width: 20, gap: 2 },
  dayLabel: { color: '#555', fontSize: 9, textAlign: 'center' },
  weekCol: { gap: 2 },
  cell: { borderRadius: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  legendText: { color: '#555', fontSize: 10 },
  legendCell: { width: 12, height: 12, borderRadius: 2 },
});

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 16, paddingBottom: 60 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 20, marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, alignItems: 'center' },
  statValue: { color: '#6C63FF', fontSize: 26, fontWeight: '900', marginBottom: 2 },
  statLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statSub: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },
  section: { marginBottom: 28 },
  sectionTitle: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  sectionSub: { color: '#555', fontSize: 12, marginBottom: 10, marginTop: -6 },
  examRow: { flexDirection: 'row', gap: 12 },
  examCard: { flex: 1, backgroundColor: '#1A1A24', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 2 },
  examDays: { color: '#fff', fontSize: 36, fontWeight: '900' },
  examLabel: { color: '#9E9E9E', fontSize: 12 },
  examName: { color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 4 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  subjectDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  subjectName: { color: '#9E9E9E', fontSize: 12, width: 38 },
  subjectBarTrack: { flex: 1, height: 6, backgroundColor: '#2A2A38', borderRadius: 3, overflow: 'hidden', marginHorizontal: 8 },
  subjectBarFill: { height: '100%', borderRadius: 3 },
  subjectPct: { color: '#fff', fontSize: 12, fontWeight: '700', width: 32, textAlign: 'right' },
  showAllText: { color: '#6C63FF', fontSize: 12, fontWeight: '700' },
  weakRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A0A0A', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F4433622' },
  weakDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  weakInfo: { flex: 1 },
  weakName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  weakSub: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },
  confRow: { flexDirection: 'row', gap: 3 },
  confDot: { width: 7, height: 7, borderRadius: 2 },
});
