import { EventEmitter } from 'expo-modules-core';
import { GuruAppLauncher } from '../../modules/app-launcher';
import {
  samsungPerf as native,
  SamsungPerfPreset,
  type SamsungPerfPresetType,
  type SamsungPerfCustomTriple,
} from '../../modules/app-launcher';

/**
 * High-level wrapper around the Samsung Performance SDK.
 *
 * - Gated on `isSamsung()` — on every other device all helpers resolve to a
 *   no-op sentinel (boostId = -1) so call sites do not need their own guard.
 * - Tracks active boosts by workload name so overlapping `llm_inference`
 *   requests share a single boost session.
 * - Surfaces thermal warnings via `onThermalWarning(listener)`.
 */

export type Workload =
  | 'llm_inference'
  | 'whisper_transcription'
  | 'face_detection'
  | 'recording_start'
  | 'app_boot';

type Session = { boostId: number; refs: number };

const sessions = new Map<Workload, Session>();
let initialized = false;
let samsung = false;

const warningListeners = new Set<(level: number) => void>();
const releaseListeners = new Set<() => void>();

// Preset durations (ms) per workload. The SDK auto-releases at this timeout;
// call stop() sooner to release earlier. Values chosen conservatively to
// avoid thermal pressure on Tab S10+ / S23 Ultra.
const WORKLOAD_PRESET: Record<Workload, { preset: SamsungPerfPresetType; durationMs: number }> = {
  llm_inference: { preset: SamsungPerfPreset.CPU, durationMs: 15_000 },
  whisper_transcription: { preset: SamsungPerfPreset.CPU, durationMs: 10_000 },
  face_detection: { preset: SamsungPerfPreset.GPU, durationMs: 5_000 },
  recording_start: { preset: SamsungPerfPreset.BUS, durationMs: 2_000 },
  app_boot: { preset: SamsungPerfPreset.CPU, durationMs: 3_000 },
};

export async function init(): Promise<boolean> {
  if (initialized) return samsung;
  samsung = await native.init();
  initialized = true;
  if (samsung) {
    // Wire events once.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const emitter = new EventEmitter(GuruAppLauncher as any) as any;
    emitter.addListener('onSamsungPerfWarning', ({ level }: { level: number }) => {
      warningListeners.forEach((l) => l(level));
    });
    emitter.addListener('onSamsungPerfReleased', ({ ts: _ts }: { ts: number }) => {
      releaseListeners.forEach((l) => l());
    });
  }
  return samsung;
}

export function isActive(): boolean {
  return initialized && samsung;
}

export async function acquire(workload: Workload): Promise<number> {
  if (!isActive()) return -1;
  const existing = sessions.get(workload);
  if (existing) {
    existing.refs += 1;
    return existing.boostId;
  }
  const cfg = WORKLOAD_PRESET[workload];
  const id = await native.startPreset(cfg.preset, cfg.durationMs);
  if (id < 0) return -1;
  sessions.set(workload, { boostId: id, refs: 1 });
  return id;
}

export async function release(workload: Workload): Promise<void> {
  if (!isActive()) return;
  const s = sessions.get(workload);
  if (!s) return;
  s.refs -= 1;
  if (s.refs > 0) return;
  sessions.delete(workload);
  await native.stop(s.boostId);
}

export async function runBoosted<T>(workload: Workload, fn: () => Promise<T>): Promise<T> {
  await acquire(workload);
  try {
    return await fn();
  } finally {
    await release(workload);
  }
}

export async function customBoost(params: SamsungPerfCustomTriple[]): Promise<number> {
  if (!isActive()) return -1;
  return native.startCustom(params);
}

export function onThermalWarning(cb: (level: number) => void): () => void {
  warningListeners.add(cb);
  return () => warningListeners.delete(cb);
}

export function onReleased(cb: () => void): () => void {
  releaseListeners.add(cb);
  return () => releaseListeners.delete(cb);
}

export async function shutdown(): Promise<void> {
  if (!isActive()) return;
  await native.stopAll();
  await native.shutdown();
  sessions.clear();
  initialized = false;
  samsung = false;
}

// Test-only reset.
export function __resetForTests() {
  sessions.clear();
  initialized = false;
  samsung = false;
  warningListeners.clear();
  releaseListeners.clear();
}
