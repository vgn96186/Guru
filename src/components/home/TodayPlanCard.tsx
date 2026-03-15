import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { generateDailyAgendaWithRouting } from '../../services/ai';
import { dailyAgendaRepository, profileRepository } from '../../db/repositories';
import { showToast } from '../Toast';

export default function TodayPlanCard() {
  const navigation = useNavigation<any>();
  const { profile, todayPlan, setTodayPlan } = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!profile) return;
    setIsGenerating(true);
    try {
      const [dueTopics, weakTopics, recentTopics, coverage] = await Promise.all([
        profileRepository.getReviewDueTopics(),
        profileRepository.getWeakestTopics(5),
        profileRepository.getRecentTopics(10),
        profileRepository.getSubjectCoverage(),
      ]);

      const totalTopics = coverage.reduce((acc, s) => acc + s.total, 0);
      const seenTopics = coverage.reduce((acc, s) => acc + s.seen, 0);
      const coveragePercent = totalTopics > 0 ? Math.round((seenTopics / totalTopics) * 100) : 0;

      const stats = {
        streak: profile.streakCurrent,
        daysToInicet: profileRepository.getDaysToExam(profile.inicetDate),
        daysToNeetPg: profileRepository.getDaysToExam(profile.neetDate),
        coveragePercent,
        dueTopics: dueTopics.map((t) => ({
          id: t.topicId,
          name: t.topicName,
          subject: t.subjectName,
        })),
        weakTopics: weakTopics.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subjectName ?? '',
        })),
        recentTopics,
      };

      const plan = await generateDailyAgendaWithRouting(
        profile.displayName,
        stats,
        profile.dailyGoalMinutes || 480,
      );

      const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
      await dailyAgendaRepository.saveDailyAgenda(date, plan);
      setTodayPlan(plan);
      showToast("Today's plan ready, Doctor.", 'success');
    } catch (e) {
      console.error('Plan generation failed:', e);
      showToast('Guru is busy. Try again later.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const navigateToFullSchedule = () => {
    navigation.navigate('MenuTab', { screen: 'StudyPlan' });
  };

  if (!todayPlan) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>TODAY'S MISSION</Text>
        <Text style={styles.subtitle}>Guru hasn't planned your day yet.</Text>
        <TouchableOpacity style={styles.button} onPress={handleGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>GENERATE DAILY PLAN</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  const nextTask = todayPlan.blocks.find((b) => b.type !== 'break');

  return (
    <View style={[styles.container, styles.activeContainer]}>
      <View style={styles.header}>
        <Text style={styles.title}>TODAY BY GURU</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>ACTIVE</Text>
        </View>
      </View>

      {nextTask && (
        <View style={styles.taskInfo}>
          <Text style={styles.taskTitle}>{nextTask.title}</Text>
          <Text style={styles.taskWhy}>{nextTask.why}</Text>
        </View>
      )}

      <Text style={styles.guruNote}>"{todayPlan.guruNote}"</Text>

      <TouchableOpacity style={styles.viewFullButton} onPress={navigateToFullSchedule}>
        <Text style={styles.viewFullText}>VIEW FULL SCHEDULE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  activeContainer: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: theme.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  taskInfo: {
    marginBottom: 16,
  },
  taskTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  taskWhy: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  guruNote: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 16,
  },
  viewFullButton: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: 12,
    alignItems: 'center',
  },
  viewFullText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
