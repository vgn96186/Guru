import { create } from 'zustand';
import type { UserProfile, LevelInfo, StudyResourceMode } from '../types';
import { DailyAgenda } from '../services/ai';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { getLevelInfo } from '../services/xpService';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { showToast } from '../components/Toast';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';

interface AppState {
  profile: UserProfile | null;
  levelInfo: LevelInfo | null;
  loading: boolean;
  hasCheckedInToday: boolean;
  dailyAvailability: number | null;
  todayPlan: DailyAgenda | null;
  planGeneratedAt: number | null;
  /** True while background recovery (orphan transcripts) is running; used for inline ghost row in Notes Hub */
  isRecoveringBackground: boolean;
  loadProfile: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setDailyAvailability: (mins: number) => void;
  setTodayPlan: (plan: DailyAgenda | null) => void;
  setRecoveringBackground: (value: boolean) => void;
  toggleFocusAudio: () => Promise<void>;
  toggleVisualTimers: () => Promise<void>;
  toggleFaceTracking: () => Promise<void>;
  setUseLocalModel: (use: boolean) => Promise<void>;
  setLocalModelPath: (path: string | null) => Promise<void>;
  setUseLocalWhisper: (use: boolean) => Promise<void>;
  setLocalWhisperPath: (path: string | null) => Promise<void>;
  setStudyResourceMode: (mode: StudyResourceMode) => Promise<void>;
}

// Track if listeners are set up
let listenersInitialized = false;

export const useAppStore = create<AppState>((set, get) => {
  // Setup global event listener for background updates (only once)
  if (!listenersInitialized) {
    const refresh = () => {
      const state = get();
      // Only refresh if we have a profile loaded
      if (state.profile) {
        state.refreshProfile().catch((err) => {
          console.warn('[useAppStore] Background refresh failed:', err);
        });
      }
    };

    dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, refresh);
    dbEvents.on(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED, refresh);
    dbEvents.on(DB_EVENT_KEYS.PROGRESS_UPDATED, refresh);
    dbEvents.on(DB_EVENT_KEYS.PROFILE_UPDATED, refresh);

    listenersInitialized = true;
  }

  return {
    profile: null,
    levelInfo: null,
    loading: false,
    hasCheckedInToday: false,
    dailyAvailability: null,
    todayPlan: null,
    planGeneratedAt: null,
    isRecoveringBackground: false,

    setRecoveringBackground: (value: boolean) => set({ isRecoveringBackground: value }),

    loadProfile: async () => {
      if (get().loading) return;
      set({ loading: true });
      try {
        const profile = await profileRepository.getProfile();
        const levelInfo = getLevelInfo(profile.totalXp, profile.currentLevel);
        const todayLog = await dailyLogRepository.getDailyLog();
        set({ profile, levelInfo, hasCheckedInToday: todayLog?.checkedIn ?? false });
      } catch (err) {
        console.error('[useAppStore] Failed to load profile:', err);
        set({ profile: null, levelInfo: null, hasCheckedInToday: false });
      } finally {
        set({ loading: false });
      }
    },

    refreshProfile: async () => {
      if (get().loading) return;
      set({ loading: true });
      try {
        const profile = await profileRepository.getProfile();
        const levelInfo = getLevelInfo(profile.totalXp, profile.currentLevel);
        const todayLog = await dailyLogRepository.getDailyLog();
        set({ profile, levelInfo, hasCheckedInToday: todayLog?.checkedIn ?? false });
      } catch (err) {
        console.error('[useAppStore] Failed to refresh profile:', err);
      } finally {
        set({ loading: false });
      }
    },

    setDailyAvailability: (mins: number) => {
      set({ dailyAvailability: mins });
    },

    setTodayPlan: (plan: DailyAgenda | null) => {
      set({ todayPlan: plan, planGeneratedAt: plan ? Date.now() : null });
    },

    toggleFocusAudio: async () => {
      const state = get();
      if (!state.profile) return;
      const newValue = !state.profile.focusAudioEnabled;
      try {
        await profileRepository.updateProfile({ focusAudioEnabled: newValue });
        set({ profile: { ...state.profile, focusAudioEnabled: newValue } });
      } catch (err) {
        console.error('[useAppStore] Failed to toggle focus audio:', err);
        showToast('Failed to update audio setting', 'error');
      }
    },

    toggleVisualTimers: async () => {
      const state = get();
      if (!state.profile) return;
      const newValue = !state.profile.visualTimersEnabled;
      try {
        await profileRepository.updateProfile({ visualTimersEnabled: newValue });
        set({ profile: { ...state.profile, visualTimersEnabled: newValue } });
      } catch (err) {
        console.error('[useAppStore] Failed to toggle visual timers:', err);
        showToast('Failed to update timer setting', 'error');
      }
    },

    toggleFaceTracking: async () => {
      const state = get();
      if (!state.profile) return;
      const newValue = !state.profile.faceTrackingEnabled;
      try {
        await profileRepository.updateProfile({ faceTrackingEnabled: newValue });
        set({ profile: { ...state.profile, faceTrackingEnabled: newValue } });
      } catch (err) {
        console.error('[useAppStore] Failed to toggle face tracking:', err);
        showToast('Failed to update face tracking setting', 'error');
      }
    },

    setUseLocalModel: async (use: boolean) => {
      const state = get();
      if (!state.profile) return;
      if (use && !isLocalLlmAllowedOnThisDevice()) {
        showToast(getLocalLlmRamWarning() ?? 'On-device AI disabled.', 'warning');
        await profileRepository.updateProfile({ useLocalModel: false });
        set({ profile: { ...state.profile, useLocalModel: false } });
        return;
      }
      try {
        await profileRepository.updateProfile({ useLocalModel: use });
        set({ profile: { ...state.profile, useLocalModel: use } });
      } catch (err) {
        console.error('[useAppStore] Failed to set use local model:', err);
        showToast('Failed to update AI setting', 'error');
      }
    },

    setLocalModelPath: async (path: string | null) => {
      const state = get();
      if (!state.profile) return;
      try {
        await profileRepository.updateProfile({ localModelPath: path });
        set({ profile: { ...state.profile, localModelPath: path } });
      } catch (err) {
        console.error('[useAppStore] Failed to set local model path:', err);
        showToast('Failed to update model path', 'error');
      }
    },

    setUseLocalWhisper: async (use: boolean) => {
      const state = get();
      if (!state.profile) return;
      try {
        await profileRepository.updateProfile({ useLocalWhisper: use });
        set({ profile: { ...state.profile, useLocalWhisper: use } });
      } catch (err) {
        console.error('[useAppStore] Failed to set use local whisper:', err);
        showToast('Failed to update whisper setting', 'error');
      }
    },

    setLocalWhisperPath: async (path: string | null) => {
      const state = get();
      if (!state.profile) return;
      try {
        await profileRepository.updateProfile({ localWhisperPath: path });
        set({ profile: { ...state.profile, localWhisperPath: path } });
      } catch (err) {
        console.error('[useAppStore] Failed to set local whisper path:', err);
        showToast('Failed to update whisper path', 'error');
      }
    },

    setStudyResourceMode: async (mode: StudyResourceMode) => {
      const state = get();
      if (!state.profile) return;
      try {
        await profileRepository.updateProfile({ studyResourceMode: mode });
        set({ profile: { ...state.profile, studyResourceMode: mode } });
      } catch (err) {
        console.error('[useAppStore] Failed to set study resource mode:', err);
        showToast('Failed to update resource mode', 'error');
      }
    },
  };
});
