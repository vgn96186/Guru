/**
 * TanStack Query hooks for user profile.
 *
 * useProfileQuery  — reads the profile; auto-fetches on mount, re-fetches on invalidation.
 * useUpdateProfileMutation — persists partial updates with optimistic UI.
 * useRefreshProfile — returns a stable callback that invalidates the profile query.
 * useProfileActions — convenience mutations for toggle/set operations.
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileRepositoryDrizzle } from '../../db/repositories/profileRepository.drizzle';
import { getLevelInfo } from '../../services/xpService';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../../services/deviceMemory';
import { showToast } from '../../components/Toast';
import type { UserProfile, LevelInfo, StudyResourceMode } from '../../types';

export const PROFILE_QUERY_KEY = ['profile'] as const;

// ─── Read ─────────────────────────────────────────────────────────────────────

export function useProfileQuery() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => profileRepositoryDrizzle.getProfile(),
    // staleTime=Infinity from QueryClient default — only refetch on invalidation
  });
}

/**
 * Derived levelInfo from the cached profile.
 * Returns null until the profile is loaded.
 */
export function useLevelInfo(): LevelInfo | null {
  const { data: profile } = useProfileQuery();
  if (!profile) return null;
  return getLevelInfo(profile.totalXp, profile.currentLevel);
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<UserProfile>) =>
      profileRepositoryDrizzle.updateProfile(updates),

    // Optimistic update
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: PROFILE_QUERY_KEY });
      const previous = queryClient.getQueryData<UserProfile>(PROFILE_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<UserProfile>(PROFILE_QUERY_KEY, {
          ...previous,
          ...updates,
        });
      }
      return { previous };
    },

    // Rollback on error
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROFILE_QUERY_KEY, context.previous);
      }
    },

    // Sync cache with DB after success (handles server-side transforms)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a stable callback that invalidates the profile query,
 * triggering a background re-fetch.  Drop-in replacement for refreshProfile().
 */
export function useRefreshProfile(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
  }, [queryClient]);
}

// ─── Convenience mutations (replaces useAppStore toggle actions) ───────────────

export function useProfileActions() {
  const { data: profile } = useProfileQuery();
  const { mutate: updateProfile } = useUpdateProfileMutation();

  return {
    toggleFocusAudio: () => {
      if (!profile) return;
      updateProfile(
        { focusAudioEnabled: !profile.focusAudioEnabled },
        { onError: () => showToast('Failed to update audio setting', 'error') },
      );
    },

    toggleVisualTimers: () => {
      if (!profile) return;
      updateProfile(
        { visualTimersEnabled: !profile.visualTimersEnabled },
        { onError: () => showToast('Failed to update timer setting', 'error') },
      );
    },

    toggleFaceTracking: () => {
      if (!profile) return;
      updateProfile(
        { faceTrackingEnabled: !profile.faceTrackingEnabled },
        { onError: () => showToast('Failed to update face tracking setting', 'error') },
      );
    },

    setUseLocalModel: (use: boolean) => {
      if (!profile) return;
      if (use && !isLocalLlmAllowedOnThisDevice()) {
        showToast(getLocalLlmRamWarning() ?? 'On-device AI disabled.', 'warning');
        updateProfile({ useLocalModel: false });
        return;
      }
      updateProfile(
        { useLocalModel: use },
        { onError: () => showToast('Failed to update AI setting', 'error') },
      );
    },

    setLocalModelPath: (path: string | null) => {
      updateProfile(
        { localModelPath: path },
        { onError: () => showToast('Failed to update model path', 'error') },
      );
    },

    setUseLocalWhisper: (use: boolean) => {
      updateProfile(
        { useLocalWhisper: use },
        { onError: () => showToast('Failed to update whisper setting', 'error') },
      );
    },

    setLocalWhisperPath: (path: string | null) => {
      updateProfile(
        { localWhisperPath: path },
        { onError: () => showToast('Failed to update whisper path', 'error') },
      );
    },

    setStudyResourceMode: (mode: StudyResourceMode) => {
      updateProfile(
        { studyResourceMode: mode },
        { onError: () => showToast('Failed to update resource mode', 'error') },
      );
    },
  };
}
