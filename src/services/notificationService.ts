import * as Notifications from 'expo-notifications';
import { generateAccountabilityMessages } from './aiService';
import { getUserProfile, getDaysToExam, getLast30DaysLog } from '../db/queries/progress';
import { getWeakestTopics, getTopicsDueForReview, getNemesisTopics } from '../db/queries/topics';
import type { Mood } from '../types';

let areNotificationsSupported = true;

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true, // enabled badge
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
        body: "You haven't studied today. 3 hours left to keep your streak.",
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

export async function scheduleMorningReminder(title: string, body: string, hour = 7): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 30,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule morning reminder:', error);
  }
}

export async function scheduleEveningNudge(title: string, body: string, hour = 18): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule evening nudge:', error);
  }
}

export async function scheduleBossFightTarget(nemesisName: string): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚔️ Daily Boss Fight',
        body: `You've failed on ${nemesisName} enough times. Defeat it today.`,
        sound: true,
        badge: 1,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 12, // Mid-day shame/reminder
        minute: 0,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule boss fight:', error);
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


export async function scheduleHarassment(): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await cancelAllNotifications(); // Clear existing to prevent duplicates
    
    const messages = [
      "Open the app. Now.",
      "You're doomscrolling again, aren't you?",
      "Every minute you scroll, your competition is studying Pathology.",
      "I will literally keep buzzing until you open this app.",
      "Just 1 flashcard. Stop ignoring me.",
      "INICET does not care about your Instagram feed.",
      "This is your last warning. Open the app.",
      "Still scrolling? Pathetic.",
      "Do you want to be a doctor or a professional scroller?",
      "5 minutes. That's all I'm asking for. Open me."
    ];

    // Schedule 10 notifications, starting 5 minutes from now, spaced 3 minutes apart
    for (let i = 0; i < messages.length; i++) {
      const triggerTime = new Date(Date.now() + (i * 3 + 1) * 60000); // 1m, 4m, 7m, 10m...
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 DOOMSCROLL DETECTED',
          body: messages[i],
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 500, 200, 500],
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerTime },
      });
    }
  } catch (error) {
    console.warn('Failed to schedule harassment:', error);
  }
}


export async function scheduleBreakEndAlarms(durationSeconds: number): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await cancelAllNotifications(); // Clear existing to prevent duplicates
    
    const messages = [
      "🚨 BREAK IS OVER. Return to the tablet now.",
      "Are you ignoring me? Close Instagram immediately.",
      "Every second you waste is a lower INICET score.",
      "I told you this would happen. Go back to studying.",
      "Your 5 minutes are up. Stop scrolling.",
      "Get up. Walk to the tablet. Press play.",
      "This is pathetic. Drop the phone.",
      "I will not stop buzzing. Resume the lecture.",
      "Resume the lecture on the tablet to silence me."
    ];

    const startTime = Date.now() + (durationSeconds * 1000);
    
    // Schedule aggressive notifications 15 seconds apart immediately after the break ends
    for (let i = 0; i < messages.length; i++) {
      const triggerTime = new Date(startTime + (i * 15 * 1000));
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 BREAK OVER',
          body: messages[i],
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 500, 200, 500, 200, 1000],
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerTime },
      });
    }
  } catch (error) {
    console.warn('Failed to schedule break alarms:', error);
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

  const nemesisTopics = await getNemesisTopics();
  const weakTopics = getWeakestTopics(3).map(t => t.name);
  const dueTopics = getTopicsDueForReview(1); // Check if any topic is due
  const logs = getLast30DaysLog();
  const lastStudied = logs.find(l => l.sessionCount > 0)?.date ?? 'unknown';
  const daysToInicet = getDaysToExam(profile.inicetDate);
  const studiedDays = logs.filter(l => l.totalMinutes >= 20).length;
  const coveragePercent = Math.round((studiedDays / 30) * 100);
  const lastMood = logs[0]?.mood ?? null;

  try {

    // BADGE UPDATE: Badge = Nemesis Topics + (1 if studied 0 mins today) to cause native anxiety
    const streakDanger = (studiedDays === 0 || (logs[0]?.totalMinutes < 20)) ? 1 : 0;
    const badgeCount = nemesisTopics.length + streakDanger;
    await Notifications.setBadgeCountAsync(badgeCount);

    // 1. Forced SRS Alarm: Check if strictly due
    const notifHour = profile.notificationHour ?? 7;
    if (dueTopics.length > 0) {
      await cancelAllNotifications();
      await scheduleMorningReminder(
        '🚨 CRITICAL REVIEW DUE',
        `Topic "${dueTopics[0].name}" is fading! Quiz now to save your mastery level. Only correct answers count.`,
        notifHour,
      );

      if (nemesisTopics.length > 0) {
        await scheduleBossFightTarget(nemesisTopics[0].name);
      }
      return; // Stop here, SRS priority
    }

    // Wrap AI call in try/catch to prevent crashes
    let messages: Array<{ title: string; body: string; scheduledFor: string }> = [];
    try {
      messages = await generateAccountabilityMessages(
        {
          streak: profile.streakCurrent,
          weakestTopics: weakTopics,
          lastStudied,
          daysToInicet,
          coveragePercent,
          lastMood: lastMood as Mood | null,
        },
        profile.openrouterApiKey,
        profile.openrouterKey || undefined,
      );
    } catch (aiError) {
      console.warn('Failed to generate accountability messages:', aiError);
      // Use default messages if AI fails
      messages = [
        { title: '📚 Time to Study!', body: 'Keep your streak going!', scheduledFor: 'morning' },
        { title: '📖 Last chance today', body: 'Complete one topic before bed.', scheduledFor: 'evening' },
        { title: '🔥 Don\'t break your streak!', body: 'Study for at least 20 minutes.', scheduledFor: 'streak_warning' },
      ];
    }

    await cancelAllNotifications();

    if (nemesisTopics.length > 0) {
      // High priority intrusive notification
      await scheduleBossFightTarget(nemesisTopics[0].name);
    }

    for (const msg of messages) {
      if (msg.scheduledFor === 'morning') {
        await scheduleMorningReminder(msg.title, msg.body, notifHour);
      } else if (msg.scheduledFor === 'evening') {
        await scheduleEveningNudge(msg.title, msg.body, Math.min(23, notifHour + 11));
      } else if (msg.scheduledFor === 'streak_warning') {
        await scheduleStreakWarning();
      }
    }
  } catch {
    // Non-critical — schedule defaults
    await scheduleStreakWarning();
  }
}
