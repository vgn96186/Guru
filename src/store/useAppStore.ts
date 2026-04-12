import { create } from 'zustand';
import type { UserProfile, LevelInfo, StudyResourceMode } from '../types';
import { DailyAgenda } from '../services/ai';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { getLevelInfo } from '../services/xpService';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { showToast } from '../components/Toast';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';

/**
 * Compare two UserProfile objects by value, handling nested objects/arrays
 * (chatgptAccounts, providerOrder, etc.) that get fresh references from JSON.parse
 * on every DB read. Without this, every refreshProfile() creates a "new" profile
 * that triggers re-renders across the entire app even when nothing actually changed.
 */
function profileDataEqual(a: UserProfile | null, b: UserProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a) as (keyof UserProfile)[];
  const keysB = Object.keys(b) as (keyof UserProfile)[];
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const va = a[key];
    const vb = b[key];
    if (va === vb) continue;
    if (va !== null && vb !== null && typeof va === 'object' && typeof vb === 'object') {
      if (JSON.stringify(va) !== JSON.stringify(vb)) return false;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Helper: optimistic profile field update with automatic rollback on DB failure.
 * Eliminates ~150 lines of repeated toggle/set boilerplate.
 */
function makeProfileSetter<K extends keyof UserProfile>(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  key: K,
  errorLabel: string,
) {
  return async (value: UserProfile[K]) => {
    const state = get();
    if (!state.profile) return;
    const prev = state.profile[key];
    set({ profile: { ...state.profile, [key]: value } });
    try {
      await profileRepository.updateProfile({ [key]: value } as Partial<UserProfile>);
    } catch (err) {
      set({ profile: { ...get().profile!, [key]: prev } });
      console.error(`[useAppStore] Failed to ${errorLabel}:`, err);
      showToast(`Failed to update ${errorLabel}`, 'error');
    }
  };
}

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
  bootPhase: 'booting' | 'calming' | 'settling' | 'done';
  startButtonLayout: { x: number; y: number; width: number; height: number } | null;
  startButtonLabel: string;
  startButtonSublabel: string;
  setBootPhase: (phase: AppState['bootPhase']) => void;
  setStartButtonLayout: (layout: AppState['startButtonLayout']) => void;
  setStartButtonCta: (label: string, sublabel: string) => void;
}

/** Trailing-edge debounce timer for refreshProfile to collapse rapid successive calls. */
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * When a refresh is requested while another profile fetch is in flight (e.g. OAuth completes
 * during cold load), run one more fetch after the current one finishes so flags like
 * `gitlabDuoConnected` are not stuck stale.
 */
let pendingCoalescedRefresh = false;

/**
 * Shared profile fetcher used by both loadProfile (cold start) and refreshProfile (hot reload).
 * @param resetOnError — when true (loadProfile), nulls out profile on failure; when false (refreshProfile), preserves existing.
 */
async function fetchProfile(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  resetOnError: boolean,
) {
  if (get().loading) {
    if (!resetOnError) pendingCoalescedRefresh = true;
    return;
  }
  set({ loading: true });
  try {
    const freshProfile = await profileRepository.getProfile();
    const todayLog = await dailyLogRepository.getDailyLog();
    const prev = get().profile;
    const profileChanged = !profileDataEqual(prev, freshProfile);
    const profile = profileChanged ? freshProfile : prev!;
    const prevLevel = get().levelInfo;
    const levelInfo =
      profileChanged || !prevLevel
        ? getLevelInfo(freshProfile.totalXp, freshProfile.currentLevel)
        : prevLevel;
    const checkedIn = todayLog?.checkedIn ?? false;
    if (!profileChanged && levelInfo === prevLevel && checkedIn === get().hasCheckedInToday) {
      return;
    }
    set({ profile, levelInfo, hasCheckedInToday: checkedIn });
  } catch (err) {
    const label = resetOnError ? 'load' : 'refresh';
    console.error(`[useAppStore] Failed to ${label} profile:`, err);
    if (resetOnError) {
      set({ profile: null, levelInfo: null, hasCheckedInToday: false });
    }
  } finally {
    set({ loading: false });
    if (pendingCoalescedRefresh) {
      pendingCoalescedRefresh = false;
      await fetchProfile(get, set, false);
    }
  }
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
    bootPhase: 'booting' as const,
    startButtonLayout: null,
    startButtonLabel: 'START SESSION',
    startButtonSublabel: '',

    setRecoveringBackground: (value: boolean) => set({ isRecoveringBackground: value }),
    setBootPhase: (phase) => set({ bootPhase: phase }),
    setStartButtonLayout: (layout) => set({ startButtonLayout: layout }),
    setStartButtonCta: (label, sublabel) =>
      set({ startButtonLabel: label, startButtonSublabel: sublabel }),

    loadProfile: async () => {
      await fetchProfile(get, set, true);
    },

    refreshProfile: async () => {
      // Trailing-edge debounce: collapse rapid successive calls (DB events, AppState, screens)
      // into a single fetch after 300ms of silence.
      if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
      return new Promise<void>((resolve) => {
        refreshDebounceTimer = setTimeout(async () => {
          refreshDebounceTimer = null;
          await fetchProfile(get, set, false);
          resolve();
        }, 300);
      });
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
      await makeProfileSetter(
        get,
        set,
        'focusAudioEnabled',
        'audio setting',
      )(!state.profile.focusAudioEnabled);
    },

    toggleVisualTimers: async () => {
      const state = get();
      if (!state.profile) return;
      await makeProfileSetter(
        get,
        set,
        'visualTimersEnabled',
        'timer setting',
      )(!state.profile.visualTimersEnabled);
    },

    toggleFaceTracking: async () => {
      const state = get();
      if (!state.profile) return;
      await makeProfileSetter(
        get,
        set,
        'faceTrackingEnabled',
        'face tracking setting',
      )(!state.profile.faceTrackingEnabled);
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
      await makeProfileSetter(get, set, 'useLocalModel', 'AI setting')(use);
    },

    setLocalModelPath: (path: string | null) =>
      makeProfileSetter(get, set, 'localModelPath', 'model path')(path),

    setUseLocalWhisper: (use: boolean) =>
      makeProfileSetter(get, set, 'useLocalWhisper', 'whisper setting')(use),

    setLocalWhisperPath: (path: string | null) =>
      makeProfileSetter(get, set, 'localWhisperPath', 'whisper path')(path),

    setStudyResourceMode: (mode: StudyResourceMode) =>
      makeProfileSetter(get, set, 'studyResourceMode', 'resource mode')(mode),
  };
});
