import { create } from 'zustand';
import type { UserProfile, LevelInfo, StudyResourceMode } from '../types';
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
  setUseLocalModel: (use: boolean) => void;
  setLocalModelPath: (path: string | null) => void;
  setUseLocalWhisper: (use: boolean) => void;
  setLocalWhisperPath: (path: string | null) => void;
  setStudyResourceMode: (mode: StudyResourceMode) => void;
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

  setUseLocalModel: (use: boolean) => {
    set(state => {
      if (!state.profile) return state;
      updateUserProfile({ useLocalModel: use });
      return { profile: { ...state.profile, useLocalModel: use } };
    });
  },

  setLocalModelPath: (path: string | null) => {
    set(state => {
      if (!state.profile) return state;
      updateUserProfile({ localModelPath: path });
      return { profile: { ...state.profile, localModelPath: path } };
    });
  },

  setUseLocalWhisper: (use: boolean) => {
    set(state => {
      if (!state.profile) return state;
      updateUserProfile({ useLocalWhisper: use });
      return { profile: { ...state.profile, useLocalWhisper: use } };
    });
  },

  setLocalWhisperPath: (path: string | null) => {
    set(state => {
      if (!state.profile) return state;
      updateUserProfile({ localWhisperPath: path });
      return { profile: { ...state.profile, localWhisperPath: path } };
    });
  },

  setStudyResourceMode: (mode: StudyResourceMode) => {
    set(state => {
      if (!state.profile) return state;
      updateUserProfile({ studyResourceMode: mode });
      return { profile: { ...state.profile, studyResourceMode: mode } };
    });
  },
}));
