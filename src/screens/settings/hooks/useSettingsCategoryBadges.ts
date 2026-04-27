/**
 * useSettingsCategoryBadges — derives short badge labels and health tones
 * for each settings category, used in sidebar status dots and mobile nav pills.
 */

import { useMemo } from 'react';
import type { UserProfile, SettingsCategory, CategoryBadgeInfo } from '../../../types';
import type { PermissionStatus } from './useSettingsPermissions';
import { hasValue } from '../utils';

type UseSettingsCategoryBadgesParams = {
  profile: UserProfile | null | undefined;
  permStatus: PermissionStatus;
  providerReadyCount: number;
  dbmciClassStartDate: string;
  btrStartDate: string;
  inicetDate: string;
  neetDate: string;
};

export function useSettingsCategoryBadges({
  profile,
  permStatus,
  providerReadyCount,
  dbmciClassStartDate,
  btrStartDate,
  inicetDate,
  neetDate,
}: UseSettingsCategoryBadgesParams): Record<SettingsCategory, CategoryBadgeInfo | null> {
  return useMemo(() => {
    const permReady = Object.values(permStatus).filter((s) => s === 'granted').length;
    const planAnchors = [dbmciClassStartDate, btrStartDate, inicetDate, neetDate].filter(
      hasValue,
    ).length;

    const strict = Boolean(profile?.strictModeEnabled);
    const hasBackup = Boolean(profile?.lastAutoBackupAt || profile?.lastBackupDate);
    const synced = Boolean(profile?.syncCode);

    return {
      dashboard: null, // no badge on overview
      appearance: null,
      profile: null,
      ai: {
        label: `${providerReadyCount}`,
        tone: providerReadyCount > 0 ? 'success' : 'warning',
      },
      interventions: {
        label: strict ? 'ON' : 'OFF',
        tone: strict ? 'error' : 'muted',
      },
      integrations: {
        label: `${permReady}/4`,
        tone: permReady === 4 ? 'success' : permReady >= 2 ? 'warning' : 'error',
      },
      planning: {
        label: `${planAnchors}/4`,
        tone: planAnchors === 4 ? 'success' : planAnchors >= 2 ? 'accent' : 'warning',
      },
      sync: synced
        ? { label: '●', tone: 'success' as const }
        : null,
      storage: {
        label: hasBackup ? '✓' : '!',
        tone: hasBackup ? 'success' : 'warning',
      },
      advanced: null,
    };
  }, [
    permStatus,
    providerReadyCount,
    dbmciClassStartDate,
    btrStartDate,
    inicetDate,
    neetDate,
    profile,
  ]);
}
