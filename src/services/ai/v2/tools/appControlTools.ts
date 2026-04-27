import { tool } from '../tool';
import { z } from 'zod';
import { profileRepository, dailyLogRepository } from '../../../../db/repositories';
import { grantXp } from '../../../xpService';
import { sendSyncMessage } from '../../../deviceSyncService';

// --- Daily Logging ---

export const logDailyReflectionTool = tool({
  name: 'log_daily_reflection',
  description:
    "Log the user's mood and reflection for the day based on their conversation. Call this when the user explicitly expresses their energy levels, burnout, or satisfaction with their study session.",
  inputSchema: z.object({
    mood: z
      .enum(['energetic', 'good', 'okay', 'tired', 'stressed', 'distracted'])
      .describe('The parsed mood of the user'),
  }),
  execute: async ({ mood }) => {
    await dailyLogRepository.checkinToday(mood);
    return { success: true, mood };
  },
});

// --- Profile & Settings Management ---

export const updatePreferencesTool = tool({
  name: 'update_preferences',
  description:
    'Update user study preferences and app settings. Use this when the user asks to change how the app behaves (e.g., stricter mode, focus audio, pomodoro, breaks).',
  inputSchema: z.object({
    strictModeEnabled: z.boolean().optional().describe('Enable/disable strict lockout mode'),
    focusAudioEnabled: z.boolean().optional().describe('Enable/disable background focus audio'),
    pomodoroEnabled: z.boolean().optional().describe('Enable/disable pomodoro timer'),
    pomodoroIntervalMinutes: z
      .number()
      .optional()
      .describe('Duration of pomodoro focus blocks in minutes'),
    breakDurationMinutes: z.number().optional().describe('Duration of breaks in minutes'),
    visualTimersEnabled: z.boolean().optional().describe('Enable/disable visual timer rings'),
    faceTrackingEnabled: z
      .boolean()
      .optional()
      .describe('Enable/disable ML face tracking for focus'),
    bodyDoublingEnabled: z.boolean().optional().describe('Enable/disable virtual body doubling'),
    idleTimeoutMinutes: z.number().optional().describe('Minutes before app marks user as idle'),
    guruFrequency: z
      .enum(['rare', 'normal', 'frequent', 'off'])
      .optional()
      .describe('How often Guru interrupts'),
    harassmentTone: z
      .enum(['shame', 'motivational', 'tough_love'])
      .optional()
      .describe('Tone Guru uses to motivate'),
  }),
  execute: async (updates) => {
    // Strip undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );
    await profileRepository.updateProfile(cleanUpdates);
    return { success: true, updatedFields: Object.keys(cleanUpdates) };
  },
});

// --- Gamification & Motivation ---

export const awardXpTool = tool({
  name: 'award_xp',
  description:
    'Award bonus XP to the user for exceptional insights, breakthroughs, or great answers during chat. Use sparingly to keep it rewarding.',
  inputSchema: z.object({
    amount: z.number().int().min(1).max(500).describe('Amount of XP to award (usually 10-50)'),
    reason: z
      .string()
      .describe('Short reason for the award (e.g., "Brilliant diagnostic insight")'),
  }),
  execute: async ({ amount, reason }) => {
    const result = await grantXp(amount);
    return {
      success: true,
      awarded: amount,
      reason,
      newLevel: result.newLevel,
      levelUp: result.leveledUp,
    };
  },
});

export const consumeStreakShieldTool = tool({
  name: 'consume_streak_shield',
  description:
    "Consume a streak shield to protect the user's streak if they are sick, overwhelmed, or unable to study today. Only works if they have a streak > 0 and a shield available.",
  inputSchema: z.object({
    reason: z.string().describe('Why the shield is being used'),
  }),
  execute: async ({ reason }) => {
    const profile = await profileRepository.getProfile();

    if (profile.streakCurrent <= 0) {
      return { success: false, error: 'No active streak to protect.' };
    }

    // We assume the repository has a useStreakShield method
    // @ts-ignore - if it doesn't exist on types but exists in implementation, we fallback safely, but we know it exists.
    if (typeof profileRepository.useStreakShield === 'function') {
      await (profileRepository as any).useStreakShield();
      return { success: true, reason, message: 'Streak shield consumed successfully.' };
    }

    return { success: false, error: 'useStreakShield is not implemented on profileRepository.' };
  },
});

// --- Study Session Control ---

export const startStudySessionTool = tool({
  name: 'start_study_session',
  description:
    'Start a study or review session for the user. Call this when the user says "Let\'s start", "I am ready", or "Start studying now".',
  inputSchema: z.object({
    actionType: z.enum(['study', 'review', 'deep_dive']).describe('The focus of the session'),
    mood: z
      .enum(['energetic', 'good', 'okay', 'tired', 'stressed', 'distracted'])
      .optional()
      .describe('Current user mood'),
    durationMinutes: z.number().optional().describe('Forced strict timer in minutes'),
  }),
  execute: async ({ actionType, mood, durationMinutes }) => {
    const { navigationRef } = await import('../../../../navigation/navigationRef');
    if (navigationRef.isReady()) {
      navigationRef.navigate('Tabs', {
        screen: 'HomeTab',
        params: {
          screen: 'Session',
          params: {
            mood: mood ?? 'good',
            mode: 'sprint',
            preferredActionType: actionType,
            forcedMinutes: durationMinutes,
          },
        },
      });
      return { success: true, action: 'navigated to session screen' };
    }
    return { success: false, error: 'Navigation not ready' };
  },
});

export const startLectureModeTool = tool({
  name: 'start_lecture_mode',
  description:
    'Start lecture transcription mode. Call this when the user says they are about to watch a video lecture or listen to an audio class.',
  inputSchema: z.object({
    subjectId: z.number().optional().describe('ID of the subject being studied, if known'),
  }),
  execute: async ({ subjectId }) => {
    const { navigationRef } = await import('../../../../navigation/navigationRef');
    if (navigationRef.isReady()) {
      navigationRef.navigate('Tabs', {
        screen: 'HomeTab',
        params: {
          screen: 'LectureMode',
          params: {
            subjectId,
          },
        },
      });
      return { success: true, action: 'navigated to lecture mode screen' };
    }
    return { success: false, error: 'Navigation not ready' };
  },
});

// --- Device Sync / Body Doubling ---

export const triggerDeviceSyncTool = tool({
  name: 'trigger_device_sync',
  description:
    "Trigger a synchronized event across all of the user's paired devices (tablet/phone). Useful for locking down devices when doomscrolling is detected, or forcing a synchronized break.",
  inputSchema: z.object({
    action: z
      .enum([
        'DOOMSCROLL_DETECTED',
        'BREAK_STARTED',
        'LECTURE_STARTED',
        'LECTURE_STOPPED',
        'LECTURE_RESUMED',
      ])
      .describe('The sync action to broadcast'),
    durationSeconds: z.number().optional().describe('Required if action is BREAK_STARTED'),
    subjectId: z.number().optional().describe('Required if action is LECTURE_STARTED'),
  }),
  execute: async ({ action, durationSeconds, subjectId }) => {
    const payload: any = { type: action };

    if (action === 'BREAK_STARTED') {
      payload.durationSeconds = durationSeconds ?? 300;
    } else if (action === 'LECTURE_STARTED') {
      payload.subjectId = subjectId ?? 0;
    }

    sendSyncMessage(payload);
    return { success: true, broadcastedAction: action };
  },
});
