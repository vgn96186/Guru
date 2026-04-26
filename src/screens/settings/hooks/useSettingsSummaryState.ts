import { useMemo } from 'react';
import type { UserProfile } from '../../../types';
import {
  FAL_IMAGE_GENERATION_MODEL_OPTIONS,
  IMAGE_GENERATION_MODEL_OPTIONS,
} from '../../../config/appConfig';
import {
  getLocalLlmRamWarning,
  isLocalLlmAllowedOnThisDevice,
} from '../../../services/deviceMemory';
import { hasValue } from '../utils';
import type { PermissionStatus } from './useSettingsPermissions';
import type { SettingsCategory } from '../../../components/settings/SettingsSidebar';

type SummaryTone = 'accent' | 'success' | 'warning' | 'error' | 'secondary' | 'primary';

type SummaryCard = {
  label: string;
  value: string | number;
  tone: SummaryTone;
};

type UseSettingsSummaryStateParams = {
  profile: UserProfile | null | undefined;
  permStatus: PermissionStatus;
  dbmciClassStartDate: string;
  btrStartDate: string;
  inicetDate: string;
  neetDate: string;
  providerReadyCount: number;
  activeCategory: SettingsCategory;
  topProviderName?: string;
  guruChatDefaultModel?: string;
};

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 86400000);
}

function buildCategoryCards(params: {
  category: SettingsCategory;
  profile: UserProfile | null | undefined;
  providerReadyCount: number;
  permissionReadyCount: number;
  planningAnchorCount: number;
  inicetDate: string;
  neetDate: string;
  localLlmReady: boolean;
  localWhisperReady: boolean;
  localAiEnabled: boolean;
  topProviderName?: string;
  guruChatDefaultModel?: string;
  localLlmFileName?: string;
}): SummaryCard[] {
  const {
    category,
    profile,
    providerReadyCount,
    permissionReadyCount,
    planningAnchorCount,
    inicetDate,
    neetDate,
    localLlmReady,
    localWhisperReady,
    localAiEnabled,
    topProviderName,
    guruChatDefaultModel,
    localLlmFileName,
  } = params;

  switch (category) {
    case 'appearance':
      return [
        {
          label: 'Loading orb',
          value: profile?.loadingOrbStyle || 'default',
          tone: 'accent',
        },
        {
          label: 'Theme',
          value: 'Linear Dark',
          tone: 'secondary',
        },
        {
          label: 'Display name',
          value: profile?.displayName ? 'Set' : 'Unset',
          tone: profile?.displayName ? 'success' : 'warning',
        },
        {
          label: 'Visual timers',
          value: profile?.visualTimersEnabled ? 'On' : 'Off',
          tone: profile?.visualTimersEnabled ? 'accent' : 'secondary',
        },
        {
          label: 'Harassment',
          value: profile?.harassmentTone || 'normal',
          tone: profile?.harassmentTone === 'shame' ? 'error' : 'secondary',
        },
      ];

    case 'profile': {
      const xp = profile?.totalXp ?? 0;
      return [
        { label: 'Total XP', value: xp.toLocaleString(), tone: 'accent' },
        { label: 'Level', value: profile?.currentLevel ?? 1, tone: 'success' },
        { label: 'Streak', value: `${profile?.streakCurrent ?? 0}d`, tone: 'warning' },
        { label: 'Best streak', value: `${profile?.streakBest ?? 0}d`, tone: 'secondary' },
        {
          label: 'Resource mode',
          value: profile?.studyResourceMode || 'balanced',
          tone: 'primary',
        },
      ];
    }

    case 'planning': {
      const inicetDays = daysUntil(inicetDate);
      const neetDays = daysUntil(neetDate);
      const nextLabel = inicetDays !== null ? 'INICET' : neetDays !== null ? 'NEET-PG' : 'No exam';
      const nextValue =
        inicetDays !== null ? `${inicetDays}d` : neetDays !== null ? `${neetDays}d` : '—';
      return [
        { label: `Until ${nextLabel}`, value: nextValue, tone: 'accent' },
        {
          label: 'Plan anchors',
          value: `${planningAnchorCount}/4`,
          tone: planningAnchorCount === 4 ? 'success' : 'warning',
        },
        {
          label: 'Daily goal',
          value: `${profile?.dailyGoalMinutes ?? 120}m`,
          tone: 'secondary',
        },
        {
          label: 'Session',
          value: `${profile?.preferredSessionLength ?? 25}m`,
          tone: 'primary',
        },
        {
          label: 'Focus subjects',
          value: profile?.focusSubjectIds?.length || 0,
          tone: (profile?.focusSubjectIds?.length || 0) > 0 ? 'success' : 'secondary',
        },
      ];
    }

    case 'interventions': {
      const strict = Boolean(profile?.strictModeEnabled);
      return [
        {
          label: 'Strict mode',
          value: strict ? 'On' : 'Off',
          tone: strict ? 'error' : 'secondary',
        },
        {
          label: 'Doomshield',
          value: profile?.doomscrollShieldEnabled ? 'On' : 'Off',
          tone: profile?.doomscrollShieldEnabled ? 'success' : 'warning',
        },
        {
          label: 'Break time',
          value: `${profile?.breakDurationMinutes ?? 0}m`,
          tone: 'secondary',
        },
        {
          label: 'Idle timeout',
          value: `${profile?.idleTimeoutMinutes ?? 5}m`,
          tone: 'accent',
        },
        {
          label: 'Pomodoro',
          value: profile?.pomodoroEnabled ? 'On' : 'Off',
          tone: profile?.pomodoroEnabled ? 'success' : 'secondary',
        },
      ];
    }

    case 'ai': {
      let llmLabel = localLlmFileName || 'Missing';
      if (llmLabel.length > 15) {
        llmLabel = llmLabel.slice(0, 15) + '...';
      }
      return [
        {
          label: 'Default chat',
          value: guruChatDefaultModel === 'auto' ? 'Auto' : guruChatDefaultModel || 'Auto',
          tone: 'accent',
        },
        {
          label: 'Fallback router',
          value: topProviderName || 'Auto',
          tone: 'primary',
        },
        {
          label: 'Local model',
          value: localLlmReady ? llmLabel : 'Off',
          tone: localLlmReady ? 'success' : 'warning',
        },
        {
          label: 'Local Whisper',
          value: localWhisperReady ? 'Ready' : 'Off',
          tone: localWhisperReady ? 'success' : 'secondary',
        },
        {
          label: 'JSON parser',
          value: profile?.preferGeminiStructuredJson ? 'Gemini' : 'Standard',
          tone: profile?.preferGeminiStructuredJson ? 'success' : 'secondary',
        },
      ];
    }

    case 'integrations':
      return [
        {
          label: 'Permissions',
          value: `${permissionReadyCount}/4`,
          tone: permissionReadyCount === 4 ? 'success' : 'warning',
        },
        {
          label: 'Connected apps',
          value: providerReadyCount,
          tone: providerReadyCount > 0 ? 'accent' : 'secondary',
        },
        {
          label: 'Google Drive',
          value: profile?.gdriveConnected ? 'Linked' : 'Off',
          tone: profile?.gdriveConnected ? 'success' : 'secondary',
        },
        {
          label: 'Sync Code',
          value: profile?.syncCode ? 'Linked' : 'None',
          tone: profile?.syncCode ? 'accent' : 'secondary',
        },
      ];

    case 'sync': {
      const synced = Boolean(profile?.syncCode);
      return [
        {
          label: 'Sync mode',
          value: synced ? 'Paired' : 'Standalone',
          tone: synced ? 'success' : 'secondary',
        },
        {
          label: 'Body doubling',
          value: profile?.bodyDoublingEnabled ? 'On' : 'Off',
          tone: profile?.bodyDoublingEnabled ? 'success' : 'warning',
        },
        {
          label: 'Sync code',
          value: synced ? 'Set' : 'Unset',
          tone: synced ? 'accent' : 'warning',
        },
        {
          label: 'Face tracking',
          value: profile?.faceTrackingEnabled ? 'On' : 'Off',
          tone: profile?.faceTrackingEnabled ? 'accent' : 'secondary',
        },
      ];
    }

    case 'storage': {
      const lastBackup = profile?.lastAutoBackupAt || profile?.lastBackupDate || null;
      const backupLabel = lastBackup
        ? new Date(lastBackup).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'Never';
      const autoFreq = profile?.autoBackupFrequency;
      const autoOn = Boolean(autoFreq && autoFreq !== 'off');
      return [
        {
          label: 'Last backup',
          value: backupLabel,
          tone: lastBackup ? 'success' : 'warning',
        },
        {
          label: 'Auto backup',
          value: autoOn ? String(autoFreq) : 'Off',
          tone: autoOn ? 'success' : 'secondary',
        },
        {
          label: 'Local folder',
          value: profile?.backupDirectoryUri ? 'Set' : 'Unset',
          tone: profile?.backupDirectoryUri ? 'accent' : 'warning',
        },
        {
          label: 'Drive backup',
          value: profile?.gdriveConnected ? profile.gdriveEmail?.split('@')[0] || 'On' : 'Off',
          tone: profile?.gdriveConnected ? 'success' : 'secondary',
        },
      ];
    }

    case 'advanced':
      return [
        { label: 'Diagnostics', value: 'Available', tone: 'accent' },
        { label: 'App version', value: '1.0.0', tone: 'secondary' },
        {
          label: 'Notif. Hour',
          value: `${profile?.notificationHour ?? 8}:00`,
          tone: 'primary',
        },
        {
          label: 'Local AI',
          value: localAiEnabled ? 'On' : 'Off',
          tone: localAiEnabled ? 'success' : 'secondary',
        },
      ];

    case 'dashboard':
    default:
      return [
        { label: 'Providers ready', value: providerReadyCount, tone: 'accent' },
        { label: 'Permissions ready', value: `${permissionReadyCount}/4`, tone: 'success' },
        { label: 'Plan anchors set', value: `${planningAnchorCount}/4`, tone: 'warning' },
      ];
  }
}

export function useSettingsSummaryState({
  profile,
  permStatus,
  dbmciClassStartDate,
  btrStartDate,
  inicetDate,
  neetDate,
  providerReadyCount,
  activeCategory,
  topProviderName,
  guruChatDefaultModel,
}: UseSettingsSummaryStateParams) {
  return useMemo(() => {
    const localLlmPath = profile?.localModelPath ?? '';
    const localWhisperPath = profile?.localWhisperPath ?? '';
    const permissionReadyCount = Object.values(permStatus).filter(
      (status) => status === 'granted',
    ).length;
    const planningAnchorCount = [dbmciClassStartDate, btrStartDate, inicetDate, neetDate].filter(
      hasValue,
    ).length;

    const localLlmReady = Boolean(localLlmPath);
    const localWhisperReady = Boolean(localWhisperPath);
    const localAiEnabled = Boolean(
      profile?.useLocalModel || profile?.useLocalWhisper || profile?.useNano,
    );

    const localLlmFileName = localLlmPath
      ? decodeURIComponent(localLlmPath.split('/').pop() || localLlmPath)
      : '';
    const localWhisperFileName = localWhisperPath
      ? decodeURIComponent(localWhisperPath.split('/').pop() || localWhisperPath)
      : '';

    return {
      localLlmReady,
      localWhisperReady,
      localAiEnabled,
      localLlmAllowed: isLocalLlmAllowedOnThisDevice(),
      localLlmWarning: getLocalLlmRamWarning(),
      localLlmFileName,
      localWhisperFileName,
      imageGenerationOptions: [
        ...(Array.isArray(FAL_IMAGE_GENERATION_MODEL_OPTIONS)
          ? FAL_IMAGE_GENERATION_MODEL_OPTIONS
          : []),
        ...(Array.isArray(IMAGE_GENERATION_MODEL_OPTIONS) ? IMAGE_GENERATION_MODEL_OPTIONS : []),
      ],
      permissionReadyCount,
      planningAnchorCount,
      settingsSummaryCards: buildCategoryCards({
        category: activeCategory,
        profile,
        providerReadyCount,
        permissionReadyCount,
        planningAnchorCount,
        inicetDate,
        neetDate,
        localLlmReady,
        localWhisperReady,
        localAiEnabled,
        topProviderName,
        guruChatDefaultModel,
        localLlmFileName,
      }),
    };
  }, [
    activeCategory,
    btrStartDate,
    dbmciClassStartDate,
    inicetDate,
    neetDate,
    permStatus,
    profile,
    providerReadyCount,
    topProviderName,
    guruChatDefaultModel,
  ]);
}
