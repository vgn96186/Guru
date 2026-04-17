import { create } from 'zustand';
import type { DailyAgenda } from '../services/ai';

/**
 * Transient UI state only.
 *
 * Database-backed state has moved to TanStack Query:
 *   - Profile / levelInfo / loading  →  useProfileQuery()  (src/hooks/queries/useProfile.ts)
 *   - Daily log / hasCheckedInToday  →  Phase 4
 *   - Daily agenda / todayPlan       →  Phase 4
 *
 * Everything remaining here is either:
 *   a) Pure UI phase state with no persistence (bootPhase, start button)
 *   b) Ephemeral session data that is not user-scoped (dailyAvailability, todayPlan)
 *      — these will move to TanStack Query in Phase 4
 */
interface AppState {
  // ── Boot / splash ──────────────────────────────────────────────────────────
  bootPhase: 'booting' | 'calming' | 'settling' | 'done';
  startButtonLayout: { x: number; y: number; width: number; height: number } | null;
  startButtonLabel: string;
  startButtonSublabel: string;
  setBootPhase: (phase: AppState['bootPhase']) => void;
  setStartButtonLayout: (layout: AppState['startButtonLayout']) => void;
  setStartButtonCta: (label: string, sublabel: string) => void;

  // ── Background recovery indicator (lecture transcript) ────────────────────
  isRecoveringBackground: boolean;
  setRecoveringBackground: (value: boolean) => void;

  // ── Planning / session ephemeral state (Phase 4 target) ───────────────────
  dailyAvailability: number | null;
  todayPlan: DailyAgenda | null;
  planGeneratedAt: number | null;
  setDailyAvailability: (mins: number) => void;
  setTodayPlan: (plan: DailyAgenda | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  bootPhase: 'booting',
  startButtonLayout: null,
  startButtonLabel: 'START SESSION',
  startButtonSublabel: '',
  isRecoveringBackground: false,
  dailyAvailability: null,
  todayPlan: null,
  planGeneratedAt: null,

  setBootPhase: (phase) => set({ bootPhase: phase }),
  setStartButtonLayout: (layout) => set({ startButtonLayout: layout }),
  setStartButtonCta: (label, sublabel) => set({ startButtonLabel: label, startButtonSublabel: sublabel }),
  setRecoveringBackground: (value) => set({ isRecoveringBackground: value }),
  setDailyAvailability: (mins) => set({ dailyAvailability: mins }),
  setTodayPlan: (plan) => set({ todayPlan: plan, planGeneratedAt: plan ? Date.now() : null }),
}));
