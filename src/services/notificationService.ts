import * as Notifications from 'expo-notifications';
import { generateAccountabilityMessages } from './aiService';
import { getUserProfile, getDaysToExam, getLast30DaysLog } from '../db/queries/progress';
import { getWeakestTopics, getTopicsDueForReview, getNemesisTopics, getSubjectBreakdown } from '../db/queries/topics';
import { todayStr } from '../db/database';
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
  if (__DEV__) console.warn('Notifications not supported (likely running in Expo Go):', error);
  areNotificationsSupported = false;
}

// Notification identifier prefixes for category-specific cancellation
const HARASSMENT_ID_PREFIX = 'harassment_';
const BREAK_ID_PREFIX = 'break_';
const ACCOUNTABILITY_ID_PREFIX = 'accountability_';

async function cancelNotificationsByPrefix(prefix: string): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.identifier.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch (error) {
    if (__DEV__) console.warn('Failed to cancel notifications by prefix:', error);
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!areNotificationsSupported) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    if (__DEV__) console.warn('Failed to request notification permissions:', error);
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
    if (__DEV__) console.warn('Failed to schedule streak warning:', error);
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
    if (__DEV__) console.warn('Failed to schedule morning reminder:', error);
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
    if (__DEV__) console.warn('Failed to schedule evening nudge:', error);
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
    if (__DEV__) console.warn('Failed to schedule boss fight:', error);
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
    if (__DEV__) console.warn('Failed to send immediate nag:', error);
  }
}

export async function notifyRecordingHealthIssue(appName: string): Promise<void> {
  await sendImmediateNag(
    '⚠️ Recording Issue',
    `Your ${appName} lecture recording may have stopped. Return to Guru to check.`,
  );
}

export async function notifyTranscriptionFailure(appName: string, durationMinutes: number): Promise<void> {
  await sendImmediateNag(
    '❌ Transcription Failed',
    `Your ${appName} lecture (${durationMinutes}min) couldn't be transcribed. Audio is saved — we'll retry later.`,
  );
}

export async function notifyTranscriptionRecovered(appName: string): Promise<void> {
  await sendImmediateNag(
    '✅ Lecture Recovered!',
    `Your ${appName} lecture was transcribed successfully. Check your notes!`,
  );
}


export async function scheduleHarassment(): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await cancelNotificationsByPrefix(HARASSMENT_ID_PREFIX); // Only clear harassment notifications
    
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
        identifier: `${HARASSMENT_ID_PREFIX}${i}`,
        content: {
          title: '🚨 DOOMSCROLL DETECTED',
          body: messages[i],
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerTime },
      });
    }
  } catch (error) {
    if (__DEV__) console.warn('Failed to schedule harassment:', error);
  }
}


export async function scheduleBreakEndAlarms(durationSeconds: number): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await cancelNotificationsByPrefix(BREAK_ID_PREFIX); // Only clear break notifications
    
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
        identifier: `${BREAK_ID_PREFIX}${i}`,
        content: {
          title: '🚨 BREAK OVER',
          body: messages[i],
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerTime },
      });
    }
  } catch (error) {
    if (__DEV__) console.warn('Failed to schedule break alarms:', error);
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    if (__DEV__) console.warn('Failed to cancel notifications:', error);
  }
}

export async function refreshAccountabilityNotifications(): Promise<void> {
  if (!areNotificationsSupported) return;
  const profile = getUserProfile();
  if (!profile.notificationsEnabled) return;

  const notifHour = profile.notificationHour ?? 7;
  const guruFrequency = profile.guruFrequency ?? 'normal';

  // Real syllabus coverage from subject breakdown
  const breakdown = getSubjectBreakdown();
  const totalTopics = breakdown.reduce((s, r) => s + r.total, 0);
  const coveredTopics = breakdown.reduce((s, r) => s + r.covered, 0);
  const masteredCount = breakdown.reduce((s, r) => s + r.mastered, 0);
  const coveragePercent = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : 0;

  const nemesisTopics = getNemesisTopics();
  const weakTopics = getWeakestTopics(3).map(t => t.name);
  const dueTopics = getTopicsDueForReview(1);
  const logs = getLast30DaysLog();
  const lastMood = logs[0]?.mood ?? null;

  // Human-readable "last studied" relative to today
  const lastStudiedDate = logs.find(l => l.sessionCount > 0)?.date ?? null;
  const daysSince = lastStudiedDate
    ? Math.max(0, Math.floor((Date.now() - new Date(`${lastStudiedDate}T00:00:00`).getTime()) / 86400000))
    : null;
  const lastStudied =
    daysSince === null ? 'never'
    : daysSince === 0 ? 'today'
    : daysSince === 1 ? 'yesterday'
    : `${daysSince} days ago`;

  const daysToInicet = getDaysToExam(profile.inicetDate);
  const daysToNeetPg = getDaysToExam(profile.neetDate);

  try {
    // Badge = nemesis count + 1 if nothing studied today (nudge anxiety)
    const studiedToday = (logs[0]?.totalMinutes ?? 0) >= 20 && logs[0]?.date === todayStr();
    await Notifications.setBadgeCountAsync(nemesisTopics.length + (studiedToday ? 0 : 1));

    await cancelNotificationsByPrefix(ACCOUNTABILITY_ID_PREFIX);

    // — SRS Priority path: a review is overdue, skip AI, fire critical alert —
    if (dueTopics.length > 0) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ACCOUNTABILITY_ID_PREFIX}morning`,
        content: {
          title: '🚨 Critical Review Due',
          body: `"${dueTopics[0].name}" is fading. Quiz it now before your mastery drops.`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: notifHour, minute: 30 },
      });
      if (nemesisTopics.length > 0) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${ACCOUNTABILITY_ID_PREFIX}boss`,
          content: {
            title: '⚔️ Boss Fight',
            body: `${nemesisTopics[0].name} beat you before. Today you finish it.`,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 12, minute: 0 },
        });
      }
      return;
    }

    // — guruFrequency 'off': skip AI, schedule minimal system-level streak warning —
    if (guruFrequency === 'off') {
      const streakBody = profile.streakCurrent > 0
        ? `${profile.streakCurrent}-day streak at risk. Study 20 min to keep it alive.`
        : 'No streak yet. Start one today — even 20 minutes counts.';
      await Notifications.scheduleNotificationAsync({
        identifier: `${ACCOUNTABILITY_ID_PREFIX}streak`,
        content: { title: '🔥 Streak Alert', body: streakBody, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 21, minute: 0 },
      });
      return;
    }

    // — AI-generated dynamic messages —
    let aiMessages: Array<{ title: string; body: string; scheduledFor: string }> = [];
    try {
      aiMessages = await generateAccountabilityMessages({
        displayName: profile.displayName,
        streak: profile.streakCurrent,
        weakestTopics: weakTopics,
        nemesisTopics: nemesisTopics.slice(0, 2).map(t => t.name),
        lastStudied,
        daysToInicet,
        daysToNeetPg,
        coveragePercent,
        masteredCount,
        totalTopics,
        lastMood: lastMood as Mood | null,
        guruFrequency,
      });
    } catch (aiError) {
      if (__DEV__) console.warn('[Notifications] AI generation failed, using smart fallbacks:', aiError);
      // Smart fallbacks: use real user data even without AI
      const name = profile.displayName;
      const topic = weakTopics[0] ?? 'your weakest topic';
      const streakLine = profile.streakCurrent > 0
        ? `${profile.streakCurrent}-day streak on the line.`
        : 'Restart your streak today.';
      aiMessages = [
        {
          title: `📚 Morning, ${name}!`,
          body: `${coveragePercent}% covered. Work on ${topic} today.`,
          scheduledFor: 'morning',
        },
        {
          title: '📖 Evening check-in',
          body: `${daysToInicet > 0 ? `${daysToInicet}d to INI-CET. ` : ''}One more topic before bed.`,
          scheduledFor: 'evening',
        },
        {
          title: '🔥 Streak Warning',
          body: streakLine + ' 20 minutes is all it takes.',
          scheduledFor: 'streak_warning',
        },
      ];
    }

    // Schedule each AI message with a stable identifier and correct trigger time
    const eveningHour = Math.min(20, Math.max(17, notifHour + 11));
    for (const msg of aiMessages) {
      if (msg.scheduledFor === 'morning') {
        await Notifications.scheduleNotificationAsync({
          identifier: `${ACCOUNTABILITY_ID_PREFIX}morning`,
          content: { title: msg.title, body: msg.body, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: notifHour, minute: 30 },
        });
      } else if (msg.scheduledFor === 'afternoon') {
        await Notifications.scheduleNotificationAsync({
          identifier: `${ACCOUNTABILITY_ID_PREFIX}afternoon`,
          content: { title: msg.title, body: msg.body, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 12, minute: 0 },
        });
      } else if (msg.scheduledFor === 'evening') {
        await Notifications.scheduleNotificationAsync({
          identifier: `${ACCOUNTABILITY_ID_PREFIX}evening`,
          content: { title: msg.title, body: msg.body, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: eveningHour, minute: 0 },
        });
      } else if (msg.scheduledFor === 'streak_warning') {
        // Always fires at 9pm — use the AI-generated content (not the hardcoded fallback)
        await Notifications.scheduleNotificationAsync({
          identifier: `${ACCOUNTABILITY_ID_PREFIX}streak`,
          content: { title: msg.title, body: msg.body, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 21, minute: 0 },
        });
      }
    }

    // Boss fight notification: noon, separate from Guru messages
    if (nemesisTopics.length > 0) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ACCOUNTABILITY_ID_PREFIX}boss`,
        content: {
          title: '⚔️ Boss Fight Today',
          body: `${nemesisTopics[0].name} is your nemesis. You've failed it before. Not today.`,
          sound: true,
          badge: nemesisTopics.length,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 12, minute: 0 },
      });
    }

  } catch {
    // Last-resort fallback — at minimum schedule a streak reminder
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ACCOUNTABILITY_ID_PREFIX}streak`,
        content: {
          title: '🔥 Streak Alert!',
          body: 'Study for 20 minutes to keep your streak alive.',
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 21, minute: 0 },
      });
    } catch { /* silent */ }
  }
}
