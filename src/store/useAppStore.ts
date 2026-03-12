import { create } from 'zustand';
import type { UserProfile, LevelInfo, StudyResourceMode } from '../types';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { getLevelInfo } from '../services/xpService';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { showToast } from '../components/Toast';

interface AppState {
  profile: UserProfile | null;
  levelInfo: LevelInfo | null;
  hasCheckedInToday: boolean;
  dailyAvailability: number | null;
  loadProfile: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setDailyAvailability: (mins: number) => void;
  toggleFocusAudio: () => Promise<void>;
  toggleVisualTimers: () => Promise<void>;
  toggleFaceTracking: () => Promise<void>;
  setUseLocalModel: (use: boolean) => Promise<void>;
  setLocalModelPath: (path: string | null) => Promise<void>;
  setUseLocalWhisper: (use: boolean) => Promise<void>;
  setLocalWhisperPath: (path: string | null) => Promise<void>;
  setStudyResourceMode: (mode: StudyResourceMode) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  levelInfo: null,
  hasCheckedInToday: false,
  dailyAvailability: null,

  loadProfile: async () => {
    const profile = await profileRepository.getProfile();
    const levelInfo = getLevelInfo(profile.totalXp, profile.currentLevel);
    const todayLog = await dailyLogRepository.getDailyLog();
    set({ profile, levelInfo, hasCheckedInToday: todayLog?.checkedIn ?? false });
  },

  refreshProfile: async () => {
    const profile = await profileRepository.getProfile();
    const levelInfo = getLevelInfo(profile.totalXp, profile.currentLevel);
    const todayLog = await dailyLogRepository.getDailyLog();
    set({ profile, levelInfo, hasCheckedInToday: todayLog?.checkedIn ?? false });
  },

  setDailyAvailability: (mins: number) => {
    set({ dailyAvailability: mins });
  },

  toggleFocusAudio: async () => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    const newValue = !state.profile.focusAudioEnabled;
    await profileRepository.updateProfile({ focusAudioEnabled: newValue });
    set({ profile: { ...state.profile, focusAudioEnabled: newValue } });
  },

  toggleVisualTimers: async () => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    const newValue = !state.profile.visualTimersEnabled;
    await profileRepository.updateProfile({ visualTimersEnabled: newValue });
    set({ profile: { ...state.profile, visualTimersEnabled: newValue } });
  },

  toggleFaceTracking: async () => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    const newValue = !state.profile.faceTrackingEnabled;
    await profileRepository.updateProfile({ faceTrackingEnabled: newValue });
    set({ profile: { ...state.profile, faceTrackingEnabled: newValue } });
  },

  setUseLocalModel: async (use: boolean) => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    if (use && !isLocalLlmAllowedOnThisDevice()) {
      showToast(getLocalLlmRamWarning() ?? 'On-device AI disabled.', 'warning');
      await profileRepository.updateProfile({ useLocalModel: false });
      set({ profile: { ...state.profile, useLocalModel: false } });
      return;
    }
    await profileRepository.updateProfile({ useLocalModel: use });
    set({ profile: { ...state.profile, useLocalModel: use } });
  },

  setLocalModelPath: async (path: string | null) => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    await profileRepository.updateProfile({ localModelPath: path });
    set({ profile: { ...state.profile, localModelPath: path } });
  },

  setUseLocalWhisper: async (use: boolean) => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    await profileRepository.updateProfile({ useLocalWhisper: use });
    set({ profile: { ...state.profile, useLocalWhisper: use } });
  },

  setLocalWhisperPath: async (path: string | null) => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    await profileRepository.updateProfile({ localWhisperPath: path });
    set({ profile: { ...state.profile, localWhisperPath: path } });
  },

  setStudyResourceMode: async (mode: StudyResourceMode) => {
    const state = useAppStore.getState();
    if (!state.profile) return;
    await profileRepository.updateProfile({ studyResourceMode: mode });
    set({ profile: { ...state.profile, studyResourceMode: mode } });
  },
}));
