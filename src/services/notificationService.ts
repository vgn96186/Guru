import * as Notifications from 'expo-notifications';
import { generateAccountabilityMessages } from './aiService';
import { getUserProfile, getDaysToExam, getLast30DaysLog } from '../db/queries/progress';
import { getWeakestTopics, getTopicsDueForReview } from '../db/queries/topics';
import type { Mood } from '../types';

let areNotificationsSupported = true;

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (error) {
  console.warn('Notifications not supported (likely running in Expo Go):', error);
  areNotificationsSupported = false;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!areNotificationsSupported) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.warn('Failed to request notification permissions:', error);
    return false;
  }
}

export async function scheduleStreakWarning(): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    // Fire at 9pm if not yet checked in today
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔥 Streak Alert!',
        body: 'You haven\'t studied today. 3 hours left to keep your streak.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 0,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule streak warning:', error);
  }
}

export async function scheduleMorningReminder(title: string, body: string): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 7,
        minute: 30,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule morning reminder:', error);
  }
}

export async function scheduleEveningNudge(title: string, body: string): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 18,
        minute: 0,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule evening nudge:', error);
  }
}

export async function sendImmediateNag(title: string, body: string): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, priority: Notifications.AndroidNotificationPriority.MAX },
      trigger: null,
    });
  } catch (error) {
    console.warn('Failed to send immediate nag:', error);
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn('Failed to cancel notifications:', error);
  }
}

export async function refreshAccountabilityNotifications(): Promise<void> {
  if (!areNotificationsSupported) return;
  const profile = getUserProfile();
  if (!profile.notificationsEnabled || !profile.openrouterApiKey) return;

  const weakTopics = getWeakestTopics(3).map(t => t.name);
  const dueTopics = getTopicsDueForReview(1); // Check if any topic is due
  const logs = getLast30DaysLog();
  const lastStudied = logs.find(l => l.sessionCount > 0)?.date ?? 'unknown';
  const daysToInicet = getDaysToExam(profile.inicetDate);
  const studiedDays = logs.filter(l => l.totalMinutes >= 20).length;
  const coveragePercent = Math.round((studiedDays / 30) * 100);
  const lastMood = logs[0]?.mood ?? null;

  try {
    // 1. Forced SRS Alarm: Check if strictly due
    if (dueTopics.length > 0) {
      await cancelAllNotifications();
      await scheduleMorningReminder(
        '🚨 CRITICAL REVIEW DUE',
        `Topic "${dueTopics[0].name}" is fading! Quiz now to save your mastery level. Only correct answers count.`
      );
      return; // Stop here, SRS priority
    }

    const messages = await generateAccountabilityMessages(
      {
        streak: profile.streakCurrent,
        weakestTopics: weakTopics,
        lastStudied,
        daysToInicet,
        coveragePercent,
        lastMood: lastMood as Mood | null,
      },
      profile.openrouterApiKey,
    );

    await cancelAllNotifications();

    for (const msg of messages) {
      if (msg.scheduledFor === 'morning') {
        await scheduleMorningReminder(msg.title, msg.body);
      } else if (msg.scheduledFor === 'evening') {
        await scheduleEveningNudge(msg.title, msg.body);
      } else if (msg.scheduledFor === 'streak_warning') {
        await scheduleStreakWarning();
      }
    }
  } catch {
    // Non-critical — schedule defaults
    await scheduleStreakWarning();
  }
}
