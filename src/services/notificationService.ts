import * as Notifications from 'expo-notifications';
import { generateAccountabilityMessages, generateBreakEndMessages } from './aiService';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import {
  getWeakestTopics,
  getTopicsDueForReview,
  getNemesisTopics,
  getSubjectBreakdown,
} from '../db/queries/topics';
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

export async function scheduleMorningReminder(
  title: string,
  body: string,
  hour = 7,
): Promise<void> {
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
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
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

export async function notifyTranscriptionFailure(
  appName: string,
  durationMinutes: number,
): Promise<void> {
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

/** Shown when the early "transcription evidence" check succeeds — user knows capture + API work. */
export async function notifyTranscriptionEvidenceOk(appName: string): Promise<void> {
  await sendImmediateNag(
    '✅ Transcription working',
    `${appName}: Lecture is being captured. You're good to go.`,
  );
}

/** Shown when the early check finds no speech — user can fix speaker/mic before wasting hours. */
export async function notifyTranscriptionEvidenceNoSpeech(appName: string): Promise<void> {
  await sendImmediateNag(
    '⚠️ No speech detected',
    `${appName}: Use device speakers at 50%+ volume. Recording DOES NOT work with headphones as in-app capture is blocked by medical apps.`,
  );
}

/** Shown when the early transcription check fails (e.g. API error). */
export async function notifyTranscriptionEvidenceError(appName: string): Promise<void> {
  await sendImmediateNag(
    '⚠️ Transcription check failed',
    `${appName}: Check Groq API key or connection. Audio is still recording.`,
  );
}

const HARASSMENT_MESSAGES: Record<string, string[]> = {
  shame: [
    'Open the app. Now.',
    "You're doomscrolling again, aren't you?",
    'Every minute you scroll, your competition is studying Pathology.',
    'I will literally keep buzzing until you open this app.',
    'Just 1 flashcard. Stop ignoring me.',
    'INICET does not care about your Instagram feed.',
    'This is your last warning. Open the app.',
    'Still scrolling? Pathetic.',
    'Do you want to be a doctor or a professional scroller?',
    "5 minutes. That's all I'm asking for. Open me.",
  ],
  motivational: [
    'Your future patients need you. Open Guru and study!',
    "Every doctor you admire studied when they didn't feel like it.",
    "One topic right now. That's all. You can do this.",
    'The next 5 minutes of studying will feel better than this scroll.',
    "You chose medicine to help people. Let's get back to it.",
    'Progress > Perfection. Just open the app.',
    'Your dream is waiting. One card at a time.',
    "Champions study when it's hard. That's what makes them champions.",
    'Close the feed. Open the future.',
    "You're closer than you think. Come back.",
  ],
  tough_love: [
    'You chose medicine. This distraction is choosing failure.',
    "Your rank won't improve by itself. Open the app.",
    'Every scroll is a gift to your competition.',
    "Hard truth: This won't matter. Your exam will.",
    "You'll regret this scroll. You won't regret studying.",
    "The exam doesn't care about your feelings. Study anyway.",
    'Stop negotiating with yourself. Open the app now.',
    'Discipline is the bridge between goals and accomplishment.',
    'Your future self is watching this choice. Make them proud.',
    'No excuses. Open the app.',
  ],
};

export async function scheduleHarassment(
  tone: 'shame' | 'motivational' | 'tough_love' = 'shame',
): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await cancelNotificationsByPrefix(HARASSMENT_ID_PREFIX); // Only clear harassment notifications

    const messages = HARASSMENT_MESSAGES[tone] ?? HARASSMENT_MESSAGES.shame;

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

    const messages = await generateBreakEndMessages();

    const startTime = Date.now() + durationSeconds * 1000;

    // Schedule aggressive notifications 15 seconds apart immediately after the break ends
    for (let i = 0; i < messages.length; i++) {
      const triggerTime = new Date(startTime + i * 15 * 1000);
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
  const profile = await profileRepository.getProfile();
  if (!profile.notificationsEnabled) return;

  const notifHour = profile.notificationHour ?? 7;
  const guruFrequency = profile.guruFrequency ?? 'normal';

  // Real syllabus coverage from subject breakdown
  const [breakdown, nemesisTopics, weakTopicsRaw, dueTopics] = await Promise.all([
    getSubjectBreakdown(),
    getNemesisTopics(),
    getWeakestTopics(3),
    getTopicsDueForReview(1),
  ]);
  const totalTopics = breakdown.reduce((s, r) => s + r.total, 0);
  const coveredTopics = breakdown.reduce((s, r) => s + r.covered, 0);
  const masteredCount = breakdown.reduce((s, r) => s + r.mastered, 0);
  const coveragePercent = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : 0;
  const weakTopics = weakTopicsRaw.map((t) => t.name);
  const logs = await dailyLogRepository.getLast30DaysLog();
  const lastMood = logs[0]?.mood ?? null;

  // Human-readable "last studied" relative to today
  const lastStudiedDate = logs.find((l) => l.sessionCount > 0)?.date ?? null;
  const daysSince = lastStudiedDate
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(`${lastStudiedDate}T00:00:00`).getTime()) / 86400000),
      )
    : null;
  const lastStudied =
    daysSince === null
      ? 'never'
      : daysSince === 0
        ? 'today'
        : daysSince === 1
          ? 'yesterday'
          : `${daysSince} days ago`;

  const daysToInicet = profileRepository.getDaysToExam(profile.inicetDate);
  const daysToNeetPg = profileRepository.getDaysToExam(profile.neetDate);

  try {
    // Badge = nemesis count + 1 if nothing studied today (nudge anxiety)
    const studiedToday = (logs[0]?.totalMinutes ?? 0) >= 20 && logs[0]?.date === todayStr();
    await Notifications.setBadgeCountAsync(nemesisTopics.length + (studiedToday ? 0 : 1));

    await cancelNotificationsByPrefix(ACCOUNTABILITY_ID_PREFIX);

    // — guruFrequency 'off': skip AI, schedule minimal system-level streak warning —
    if (guruFrequency === 'off') {
      const streakBody =
        profile.streakCurrent > 0
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
        nemesisTopics: nemesisTopics.slice(0, 2).map((t) => t.name),
        dueTopics: dueTopics.map((t) => t.name),
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
      if (__DEV__)
        console.warn('[Notifications] AI generation failed, using smart fallbacks:', aiError);

      // Smart fallbacks: use real user data even without AI
      const name = profile.displayName;
      const dueTopic = dueTopics[0]?.name;
      const topic = dueTopic ?? weakTopics[0] ?? 'your weakest topic';
      const streakLine =
        profile.streakCurrent > 0
          ? `${profile.streakCurrent}-day streak on the line.`
          : 'Restart your streak today.';

      aiMessages = [
        {
          title: dueTopic ? '🚨 Critical Review Due' : `📚 Morning, ${name}!`,
          body: dueTopic
            ? `"${dueTopic}" is fading. Quiz it now before your mastery drops.`
            : `${coveragePercent}% covered. Work on ${topic} today.`,
          scheduledFor: 'morning',
        },
        {
          title: nemesisTopics.length > 0 ? '⚔️ Boss Fight' : '📖 Evening check-in',
          body:
            nemesisTopics.length > 0
              ? `${nemesisTopics[0].name} beat you before. Today you finish it.`
              : `${daysToInicet > 0 ? `${daysToInicet}d to INI-CET. ` : ''}One more topic before bed.`,
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
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: notifHour,
            minute: 30,
          },
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
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: eveningHour,
            minute: 0,
          },
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
    } catch {
      /* silent */
    }
  }
}
