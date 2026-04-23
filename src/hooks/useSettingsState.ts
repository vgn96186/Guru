import { useState, useEffect, useRef, useCallback } from 'react';
import { useProfileQuery, useRefreshProfile } from './queries/useProfile';
import { updateUserProfile } from '../db/queries/progress';
import { UserProfile } from '../types';

export function useSettingsState<K extends keyof UserProfile>(
  key: K,
  defaultValue: UserProfile[K],
): [UserProfile[K], (val: UserProfile[K]) => void, boolean] {
  const profileQuery = useProfileQuery();
  const profile = profileQuery?.data;
  const refreshProfile = useRefreshProfile();

  const [localValue, setLocalValue] = useState<UserProfile[K]>(
    profile?.[key] !== undefined ? profile[key] : defaultValue,
  );

  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with remote profile ONLY when profile changes and we are not currently editing
  useEffect(() => {
    if (profile && profile[key] !== undefined && !timerRef.current) {
      setLocalValue(profile[key]);
    }
  }, [profile, key]);

  const setValue = useCallback(
    (newValue: UserProfile[K]) => {
      setLocalValue(newValue);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await updateUserProfile({ [key]: newValue });
          await refreshProfile();
        } catch (err) {
          console.warn(`[Settings] Auto-save failed for ${String(key)}:`, err);
        } finally {
          setIsSaving(false);
          timerRef.current = null;
        }
      }, 600);
    },
    [key, refreshProfile],
  );

  return [localValue, setValue, isSaving];
}
