import { create } from 'zustand';
import type { UserProfile, LevelInfo } from '../types';
import { getUserProfile, updateUserProfile, getDailyLog } from '../db/queries/progress';
import { getLevelInfo } from '../services/xpService';

interface AppState {
  profile: UserProfile | null;
  levelInfo: LevelInfo | null;
  hasCheckedInToday: boolean;
  dailyAvailability: number | null; // minutes available today (user stated)
  // Actions
  loadProfile: () => void;
  refreshProfile: () => void;
  setApiKey: (key: string) => void;
  setDailyAvailability: (mins: number) => void;
  toggleFocusAudio: () => void;
  toggleVisualTimers: () => void;
  toggleFaceTracking: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  levelInfo: null,
  hasCheckedInToday: false,
  dailyAvailability: null,

  loadProfile: () => {
    const profile = getUserProfile();
    const levelInfo = getLevelInfo(profile.totalXp, profile.currentLevel);
    const todayLog = getDailyLog();
    set({
      profile,
      levelInfo,
      hasCheckedInToday: todayLog?.checkedIn ?? false,
    });
  },

  refreshProfile: () => {
    const profile = getUserProfile();
    const levelInfo = getLevelInfo(profile.totalXp, profile.currentLevel);
    const todayLog = getDailyLog();
    set({
      profile,
      levelInfo,
      hasCheckedInToday: todayLog?.checkedIn ?? false,
    });
  },

  setApiKey: (key: string) => {
    updateUserProfile({ openrouterApiKey: key });
    set(state => ({
      profile: state.profile ? { ...state.profile, openrouterApiKey: key } : null,
    }));
  },

  setDailyAvailability: (mins: number) => {
    set({ dailyAvailability: mins });
  },

  toggleFocusAudio: () => {
    set(state => {
      if (!state.profile) return state;
      const newValue = !state.profile.focusAudioEnabled;
      updateUserProfile({ focusAudioEnabled: newValue });
      return { profile: { ...state.profile, focusAudioEnabled: newValue } };
    });
  },

  toggleVisualTimers: () => {
    set(state => {
      if (!state.profile) return state;
      const newValue = !state.profile.visualTimersEnabled;
      updateUserProfile({ visualTimersEnabled: newValue });
      return { profile: { ...state.profile, visualTimersEnabled: newValue } };
    });
  },

  toggleFaceTracking: () => {
    set(state => {
      if (!state.profile) return state;
      const newValue = !state.profile.faceTrackingEnabled;
      updateUserProfile({ faceTrackingEnabled: newValue });
      return { profile: { ...state.profile, faceTrackingEnabled: newValue } };
    });
  },
}));
