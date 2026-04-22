# Samsung Performance SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Samsung Performance SDK (`perfsdk-v1.0.0.jar`, already dropped into `modules/app-launcher/android/libs/`) into the `app-launcher` Expo module so Guru can request CPU/GPU/BUS boosts during heavy work (local LLM inference, Whisper transcription, ML Kit face detection) and react to Samsung thermal warnings on Galaxy Tab S10+ / S23 Ultra.

**Architecture:**

- New Kotlin controller `SamsungPerfController.kt` encapsulates `SPerf.initialize`, `SPerfManager`, `PerformanceManager`, and `SPerfListener` lifecycles. Mirrors the existing `SPenController` pattern.
- `AppLauncherModule.kt` owns one lazy `SamsungPerfController` instance and exposes `AsyncFunction` bindings + an `onSamsungPerfWarning` event.
- JS surface lives in `modules/app-launcher/index.ts` with a thin `samsungPerf` namespace. A higher-level helper `src/services/samsungPerf.ts` wraps it with guards (non-Samsung device → no-op), session tracking, and thermal callbacks.
- Call sites: local LLM warmup + generation (`src/services/ai/v2/...`), Whisper transcription start/stop (`src/services/transcription/...`), Recording start, Overlay face detection start.

**Tech Stack:** Kotlin (Expo Module), Samsung SPerf SDK v1.0.0, TypeScript (Expo bridge), Zustand profile, existing `isSamsungDevice()` gate.

---

## File Structure

**Create:**

- `modules/app-launcher/android/src/main/java/expo/modules/applauncher/SamsungPerfController.kt` — Kotlin wrapper around SPerf APIs (init, boost lifecycle, preset, thermal listener).
- `src/services/samsungPerf.ts` — JS service layer: Samsung-device gate, session tracking, boost helpers keyed by workload name, thermal state store.
- `src/services/__tests__/samsungPerf.test.ts` — Jest unit test (logic allowlist) asserting gating, session bookkeeping, and no-op on non-Samsung.
- `docs/superpowers/plans/2026-04-22-samsung-performance-sdk.md` — this plan (already created).

**Modify:**

- `modules/app-launcher/android/src/main/java/expo/modules/applauncher/AppLauncherModule.kt` — register native functions + event.
- `modules/app-launcher/index.ts` — export `samsungPerf` JS bindings.
- `src/services/ai/v2/generateObject.ts` and `src/services/ai/v2/generateText.ts` (or the local-llm entry they call) — request/release `llm_inference` boost around inference.
- `src/services/transcription/index.ts` (or the whisper entry point) — boost around `transcribeAudio`.
- `modules/app-launcher/android/src/main/java/expo/modules/applauncher/RecordingService.kt` — start/stop a short boost on service start.
- `modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt` — boost around face-detector init; listen for thermal warning to throttle face-detect cadence.
- `src/hooks/useAppBootstrap.ts` — call `samsungPerf.init()` once on app boot.
- `modules/app-launcher/android/proguard-rules.pro` (create if missing) — keep `com.samsung.sdk.sperf.**` and `com.samsung.android.sdk.**` classes from R8 stripping.

**Test:**

- `src/services/__tests__/samsungPerf.test.ts` (logic unit test).
- Manual device validation on Galaxy Tab S10+ (documented in plan, no automated Detox coverage — SPerf requires real Samsung hardware).

---

## Task 1: ProGuard keep rules for Samsung SDKs

**Files:**

- Create or modify: `modules/app-launcher/android/proguard-rules.pro`
- Modify: `modules/app-launcher/android/build.gradle`

- [ ] **Step 1: Check whether proguard-rules.pro exists**

Run: `ls modules/app-launcher/android/proguard-rules.pro`
Expected: either the file prints, or "No such file".

- [ ] **Step 2: Create/extend proguard-rules.pro**

Append (or create with) these lines:

```proguard
# Samsung Performance SDK (fileTree jar, not obfuscation-safe)
-keep class com.samsung.sdk.sperf.** { *; }
-keep interface com.samsung.sdk.sperf.** { *; }

# Samsung base SDK (SsdkVendorCheck)
-keep class com.samsung.android.sdk.** { *; }

# S Pen Remote SDK
-keep class com.samsung.android.sdk.penremote.** { *; }
```

- [ ] **Step 3: Wire consumerProguardFiles in build.gradle**

In `modules/app-launcher/android/build.gradle`, inside the `defaultConfig { ... }` block (lines 32–35), add:

```gradle
        consumerProguardFiles 'proguard-rules.pro'
```

So the block becomes:

```gradle
    defaultConfig {
        minSdkVersion safeExtGet("minSdkVersion", 24)
        targetSdkVersion safeExtGet("targetSdkVersion", 36)
        consumerProguardFiles 'proguard-rules.pro'
    }
```

- [ ] **Step 4: Sanity-build the module**

Run: `cd android && ./gradlew :expo-modules-core:assembleDebug :app-launcher:assembleDebug 2>&1 | tail -20`
Expected: `BUILD SUCCESSFUL`. If the project uses a different gradle wrapper path, use `npx expo prebuild --clean` then `./gradlew :app:assembleDebug`. Any SPerf-related R8 warning means the keep rule did not apply — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add modules/app-launcher/android/proguard-rules.pro modules/app-launcher/android/build.gradle
git commit -m "build(app-launcher): keep Samsung SDK classes from R8"
```

---

## Task 2: Kotlin wrapper — SamsungPerfController

**Files:**

- Create: `modules/app-launcher/android/src/main/java/expo/modules/applauncher/SamsungPerfController.kt`

- [ ] **Step 1: Write SamsungPerfController.kt**

```kotlin
package expo.modules.applauncher

import android.content.Context
import android.util.Log
import com.samsung.android.sdk.SsdkVendorCheck
import com.samsung.sdk.sperf.BoostObject
import com.samsung.sdk.sperf.CustomParams
import com.samsung.sdk.sperf.PerformanceManager
import com.samsung.sdk.sperf.SPerf
import com.samsung.sdk.sperf.SPerfListener
import com.samsung.sdk.sperf.SPerfManager

/**
 * Thin wrapper around Samsung Performance SDK (perfsdk-v1.0.0).
 *
 * Lifecycle:
 *   - init(ctx) once at app start. On non-Samsung devices returns false and all
 *     subsequent calls become no-ops (return -1 / false).
 *   - startPresetBoost / startCustomBoost open a session and return a token
 *     (boostId). stopBoost(token) releases it. Caller is responsible for
 *     pairing these — we never auto-release except via SDK timeout.
 *   - Thermal warnings fire via onThermalWarning (Int level) to a single
 *     consumer callback.
 *
 * Thread-safety: all methods are synchronized on `lock`. SDK calls are cheap
 * (binder IPC), so a coarse lock is fine.
 */
class SamsungPerfController(private val appContext: Context) {
    private val lock = Any()
    private var initialized = false
    private var manager: SPerfManager? = null
    private var perfManager: PerformanceManager? = null
    private val activeBoostIds = mutableSetOf<Int>()

    /** Invoked when SDK reports onHighTempWarning(level). Null when unset. */
    var onThermalWarning: ((Int) -> Unit)? = null

    /** Invoked when SDK releases a boost due to its own timeout. */
    var onReleasedByTimeout: (() -> Unit)? = null

    private val listener = object : SPerfListener {
        override fun onHighTempWarning(level: Int) {
            onThermalWarning?.invoke(level)
        }
        override fun onReleasedByTimeout() {
            onReleasedByTimeout?.invoke()
        }
    }

    fun isSamsung(): Boolean = try {
        SsdkVendorCheck.isSamsungDevice()
    } catch (t: Throwable) {
        Log.w(TAG, "SsdkVendorCheck failed", t)
        false
    }

    /** @return true if SDK came up on a Samsung device, false otherwise. */
    fun init(): Boolean = synchronized(lock) {
        if (initialized) return@synchronized true
        if (!isSamsung()) return@synchronized false
        return@synchronized try {
            if (!SPerf.initialize(appContext)) {
                Log.w(TAG, "SPerf.initialize returned false")
                return@synchronized false
            }
            manager = SPerfManager.initSPerfManager()
                ?: SPerfManager.createInstance(appContext)
            manager?.addSPerfListerner(listener)
            perfManager = PerformanceManager.getInstance()
            initialized = true
            Log.i(TAG, "SPerf initialized v=${SPerf.getVersionName()}")
            true
        } catch (t: Throwable) {
            Log.w(TAG, "SPerf init threw", t)
            initialized = false
            false
        }
    }

    /** Returns boost id on success, -1 otherwise. */
    fun startPresetBoost(presetType: Int, durationMs: Int): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        return@synchronized try {
            val rc = manager?.startPresetBoost(presetType, durationMs) ?: -1
            if (rc >= 0) activeBoostIds.add(rc)
            rc
        } catch (t: Throwable) {
            Log.w(TAG, "startPresetBoost threw", t); -1
        }
    }

    /**
     * Custom boost via PerformanceManager.start(CustomParams).
     * pairs = list of (type, value, durationMs) tuples, e.g. (CustomParams.TYPE_CPU_MIN, 1500000, 3000).
     * Returns 0 on success, negative on error.
     */
    fun startCustomBoost(pairs: List<Triple<Int, Int, Int>>): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        return@synchronized try {
            val params = CustomParams()
            pairs.forEach { (type, value, duration) -> params.add(type, value, duration) }
            perfManager?.start(params) ?: -1
        } catch (t: Throwable) {
            Log.w(TAG, "startCustomBoost threw", t); -1
        }
    }

    fun stopBoost(boostId: Int): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        return@synchronized try {
            val rc = manager?.stopBoost(boostId, 0) ?: -1
            activeBoostIds.remove(boostId)
            rc
        } catch (t: Throwable) {
            Log.w(TAG, "stopBoost threw", t); -1
        }
    }

    fun stopAllBoosts(): Int = synchronized(lock) {
        if (!initialized) return@synchronized -1
        val ids = activeBoostIds.toList()
        var last = 0
        ids.forEach { last = stopBoost(it) }
        return@synchronized try {
            perfManager?.stop() ?: last
        } catch (t: Throwable) {
            last
        }
    }

    fun shutdown(): Unit = synchronized(lock) {
        if (!initialized) return@synchronized
        runCatching { stopAllBoosts() }
        initialized = false
        manager = null
        perfManager = null
    }

    companion object {
        private const val TAG = "SamsungPerf"
    }
}
```

- [ ] **Step 2: Confirm native module still compiles**

Run: `cd android && ./gradlew :app-launcher:compileDebugKotlin 2>&1 | tail -20`
Expected: `BUILD SUCCESSFUL`. If Kotlin cannot resolve `com.samsung.sdk.sperf.*` the libs/ fileTree include is wrong — re-verify `modules/app-launcher/android/libs/perfsdk-v1.0.0.jar` and `sdk-v1.0.0.jar` exist.

- [ ] **Step 3: Commit**

```bash
git add modules/app-launcher/android/src/main/java/expo/modules/applauncher/SamsungPerfController.kt
git commit -m "feat(app-launcher): add Kotlin wrapper for Samsung SPerf SDK"
```

---

## Task 3: Expo module bindings + event

**Files:**

- Modify: `modules/app-launcher/android/src/main/java/expo/modules/applauncher/AppLauncherModule.kt`

- [ ] **Step 1: Add field and companion constant**

At line 33 (where `private var spen: SPenController? = null` lives), add below it:

```kotlin
    private var perf: SamsungPerfController? = null
```

- [ ] **Step 2: Extend the Events(...) declaration**

Current line 244 reads:

```kotlin
        Events("guru.fgs.blocked", "onSPenButton", "onSPenAirMotion")
```

Change to:

```kotlin
        Events(
            "guru.fgs.blocked",
            "onSPenButton",
            "onSPenAirMotion",
            "onSamsungPerfWarning",
            "onSamsungPerfReleased"
        )
```

- [ ] **Step 3: Add AsyncFunction bindings**

Insert this block immediately after the existing `AsyncFunction("stopSPenListening")` handler (around line 455):

```kotlin
        AsyncFunction("samsungPerfInit") {
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val c = perf ?: SamsungPerfController(ctx).also { perf = it }
            c.onThermalWarning = { level ->
                sendEvent("onSamsungPerfWarning", mapOf("level" to level))
            }
            c.onReleasedByTimeout = {
                sendEvent("onSamsungPerfReleased", mapOf("ts" to System.currentTimeMillis()))
            }
            c.init()
        }

        AsyncFunction("samsungPerfIsSamsung") {
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            (perf ?: SamsungPerfController(ctx).also { perf = it }).isSamsung()
        }

        AsyncFunction("samsungPerfStartPreset") { presetType: Int, durationMs: Int ->
            perf?.startPresetBoost(presetType, durationMs) ?: -1
        }

        AsyncFunction("samsungPerfStartCustom") { pairs: List<List<Int>> ->
            // Expect [[type, value, duration], ...]
            val triples = pairs.mapNotNull { p ->
                if (p.size >= 3) Triple(p[0], p[1], p[2]) else null
            }
            perf?.startCustomBoost(triples) ?: -1
        }

        AsyncFunction("samsungPerfStop") { boostId: Int ->
            perf?.stopBoost(boostId) ?: -1
        }

        AsyncFunction("samsungPerfStopAll") {
            perf?.stopAllBoosts() ?: -1
        }

        AsyncFunction("samsungPerfShutdown") {
            perf?.shutdown()
            perf = null
            true
        }
```

- [ ] **Step 4: Build and fix import**

Run: `cd android && ./gradlew :app-launcher:compileDebugKotlin 2>&1 | tail -20`
Expected: `BUILD SUCCESSFUL`. No new `import` is required — `SamsungPerfController` is in the same package.

- [ ] **Step 5: Commit**

```bash
git add modules/app-launcher/android/src/main/java/expo/modules/applauncher/AppLauncherModule.kt
git commit -m "feat(app-launcher): expose Samsung perf SDK to JS"
```

---

## Task 4: TypeScript bindings in module index

**Files:**

- Modify: `modules/app-launcher/index.ts`

- [ ] **Step 1: Read current exports near bottom of file**

Run: `wc -l modules/app-launcher/index.ts && tail -40 modules/app-launcher/index.ts`
Expected: know last line number + final export shape. The `samsungPerf` object is appended at the end of the file.

- [ ] **Step 2: Append samsungPerf namespace**

Append to `modules/app-launcher/index.ts`:

```typescript
// ---------------------------------------------------------------------------
// Samsung Performance SDK bridge (perfsdk-v1.0.0)
// ---------------------------------------------------------------------------

/** Mirrors `com.samsung.sdk.sperf.PerformanceManager` preset constants. */
export const SamsungPerfPreset = {
  CPU: 0,
  GPU: 1,
  BUS: 2,
} as const;
export type SamsungPerfPresetType = (typeof SamsungPerfPreset)[keyof typeof SamsungPerfPreset];

/** Mirrors `com.samsung.sdk.sperf.CustomParams` TYPE_* constants. */
export const SamsungPerfCustomType = {
  CPU_MIN: 0,
  CPU_MAX: 1,
  GPU_MIN: 2,
  GPU_MAX: 3,
  BUS_MIN: 4,
  BUS_MAX: 5,
  CPU_CORE_NUM_MIN: 6,
  CPU_CORE_NUM_MAX: 7,
  CPU_AWAKE: 8,
  TASK_PRIORITY: 9,
  TASK_AFFINITY: 10,
} as const;

export type SamsungPerfCustomTriple = [type: number, value: number, durationMs: number];

export const samsungPerf = {
  /** Initialise SPerf. Returns true only on Samsung devices where init succeeded. */
  init(): Promise<boolean> {
    return withTimeout(GuruAppLauncher.samsungPerfInit(), 3_000, 'samsungPerfInit');
  },
  isSamsung(): Promise<boolean> {
    return GuruAppLauncher.samsungPerfIsSamsung();
  },
  /** Returns a boostId (>=0) or -1 on failure. */
  startPreset(preset: SamsungPerfPresetType, durationMs: number): Promise<number> {
    return GuruAppLauncher.samsungPerfStartPreset(preset, durationMs);
  },
  /** Returns 0 on success, negative on failure. */
  startCustom(params: SamsungPerfCustomTriple[]): Promise<number> {
    return GuruAppLauncher.samsungPerfStartCustom(params);
  },
  stop(boostId: number): Promise<number> {
    return GuruAppLauncher.samsungPerfStop(boostId);
  },
  stopAll(): Promise<number> {
    return GuruAppLauncher.samsungPerfStopAll();
  },
  shutdown(): Promise<boolean> {
    return GuruAppLauncher.samsungPerfShutdown();
  },
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "samsungPerf|app-launcher/index" | head -20`
Expected: no errors referencing these symbols. If `GuruAppLauncher.samsungPerfInit` shows as `any`, that is expected — native module types are untyped.

- [ ] **Step 4: Commit**

```bash
git add modules/app-launcher/index.ts
git commit -m "feat(app-launcher): TS bindings for Samsung perf SDK"
```

---

## Task 5: JS service layer with gating and session tracking

**Files:**

- Create: `src/services/samsungPerf.ts`

- [ ] **Step 1: Write the service**

```typescript
import { EventEmitter } from 'expo-modules-core';
import GuruAppLauncher from '../../modules/app-launcher';
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
    const emitter = new EventEmitter(GuruAppLauncher as unknown as object);
    emitter.addListener<{ level: number }>('onSamsungPerfWarning', ({ level }) => {
      warningListeners.forEach((l) => l(level));
    });
    emitter.addListener<{ ts: number }>('onSamsungPerfReleased', () => {
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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/samsungPerf.ts
git commit -m "feat(perf): samsungPerf JS service with workload gating"
```

---

## Task 6: Unit test for the JS service

**Files:**

- Create: `src/services/__tests__/samsungPerf.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import * as samsungPerf from '../samsungPerf';

jest.mock('../../../modules/app-launcher', () => {
  const native = {
    init: jest.fn(),
    isSamsung: jest.fn(),
    startPreset: jest.fn(),
    startCustom: jest.fn(),
    stop: jest.fn(),
    stopAll: jest.fn(),
    shutdown: jest.fn(),
  };
  return {
    __esModule: true,
    default: {},
    samsungPerf: native,
    SamsungPerfPreset: { CPU: 0, GPU: 1, BUS: 2 },
    SamsungPerfCustomType: {},
    _native: native,
  };
});

jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn().mockImplementation(() => ({ addListener: jest.fn() })),
}));

const { _native } = jest.requireMock('../../../modules/app-launcher') as {
  _native: {
    init: jest.Mock;
    startPreset: jest.Mock;
    stop: jest.Mock;
    stopAll: jest.Mock;
    shutdown: jest.Mock;
  };
};

describe('samsungPerf', () => {
  beforeEach(() => {
    samsungPerf.__resetForTests();
    _native.init.mockReset();
    _native.startPreset.mockReset();
    _native.stop.mockReset();
    _native.stopAll.mockReset();
    _native.shutdown.mockReset();
  });

  test('non-Samsung device → all calls resolve to -1 without touching native', async () => {
    _native.init.mockResolvedValue(false);
    await samsungPerf.init();
    expect(samsungPerf.isActive()).toBe(false);
    await expect(samsungPerf.acquire('llm_inference')).resolves.toBe(-1);
    expect(_native.startPreset).not.toHaveBeenCalled();
  });

  test('overlapping acquire() for same workload shares one boost', async () => {
    _native.init.mockResolvedValue(true);
    _native.startPreset.mockResolvedValue(42);
    await samsungPerf.init();

    const a = await samsungPerf.acquire('llm_inference');
    const b = await samsungPerf.acquire('llm_inference');
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(_native.startPreset).toHaveBeenCalledTimes(1);

    await samsungPerf.release('llm_inference');
    expect(_native.stop).not.toHaveBeenCalled(); // still one ref
    await samsungPerf.release('llm_inference');
    expect(_native.stop).toHaveBeenCalledWith(42);
  });

  test('runBoosted releases even when fn throws', async () => {
    _native.init.mockResolvedValue(true);
    _native.startPreset.mockResolvedValue(7);
    await samsungPerf.init();

    await expect(
      samsungPerf.runBoosted('whisper_transcription', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(_native.stop).toHaveBeenCalledWith(7);
  });
});
```

- [ ] **Step 2: Run test (should fail — service not in logic allowlist)**

Run: `npx jest src/services/__tests__/samsungPerf.test.ts --config=jest.unit.logic.config.js 2>&1 | tail -30`
Expected: either PASS (if allowlist picks up the path) or a "no tests found / file not matched" error. If not matched, open `jest.unit.logic.config.js` and add `'src/services/__tests__/samsungPerf.test.ts'` to the `testMatch` allowlist, then rerun.

- [ ] **Step 3: Iterate until green**

Run: `npx jest src/services/__tests__/samsungPerf.test.ts --config=jest.unit.logic.config.js`
Expected: 3 passing tests.

- [ ] **Step 4: Commit**

```bash
git add src/services/__tests__/samsungPerf.test.ts jest.unit.logic.config.js
git commit -m "test(perf): unit-test samsungPerf gating and ref-count"
```

---

## Task 7: Initialize SPerf during app bootstrap

**Files:**

- Modify: `src/hooks/useAppBootstrap.ts`

- [ ] **Step 1: Locate the bootstrap effect**

Run: `grep -n "maybePromptSamsungBattery\|useEffect\|runAppBootstrap" src/hooks/useAppBootstrap.ts | head -20`
Expected: find the main `useEffect` where profile + sync-once tasks run.

- [ ] **Step 2: Add import and init call**

At the top with the other imports, add:

```typescript
import * as samsungPerf from '../services/samsungPerf';
```

Inside the same post-mount effect that currently calls `maybePromptSamsungBattery`, add (before or after that call, not inside a conditional):

```typescript
try {
  const ok = await samsungPerf.init();
  if (ok) {
    // Hold a brief CPU boost during cold boot (service init, profile load,
    // DB warmup). SDK auto-releases after WORKLOAD_PRESET.app_boot duration.
    void samsungPerf.acquire('app_boot').then(() => samsungPerf.release('app_boot'));
  }
} catch (e) {
  console.warn('[samsungPerf] init failed', e);
}
```

- [ ] **Step 3: Verify file still type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "useAppBootstrap" | head -10`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppBootstrap.ts
git commit -m "feat(bootstrap): initialize Samsung perf SDK on app boot"
```

---

## Task 8: Boost local LLM inference

**Files:**

- Modify: `src/services/ai/v2/generateObject.ts`
- Modify: `src/services/ai/v2/generateText.ts` (only if it contains the local-llm branch — skip if routing already lives in one of the above)

- [ ] **Step 1: Find the local-llm call site**

Run: `grep -rn "useLocalModel\|local-llm\|localModelPath\|LocalLlm" src/services/ai/v2/ | head -20`
Expected: identify which file in `src/services/ai/v2/` dispatches to the local model. Most likely `generateObject.ts` or a `providers/local.ts`. Use whichever directly invokes the local inference promise — that is the function to wrap.

- [ ] **Step 2: Wrap the local inference call**

At the top of the file:

```typescript
import * as samsungPerf from '../../samsungPerf';
```

Replace the local-model invocation (the `await someLocalInfer(...)` line) with:

```typescript
const result = await samsungPerf.runBoosted('llm_inference', () => someLocalInfer(prompt, opts));
```

Where `someLocalInfer(...)` is the existing call — do not change its args, only wrap it.

- [ ] **Step 3: Confirm cloud path untouched**

Run: `git diff src/services/ai/v2/generateObject.ts | grep -E "^[+-]" | head -20`
Expected: additions only around the local branch. Cloud/openrouter/groq paths unchanged.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ai/v2/" | head -10`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/v2/generateObject.ts
git commit -m "feat(ai): boost CPU for local LLM inference on Samsung"
```

---

## Task 9: Boost whisper transcription

**Files:**

- Modify: `src/services/transcription/index.ts` (or whichever file owns `transcribeAudio`)

- [ ] **Step 1: Find transcribeAudio**

Run: `grep -rn "export.*transcribeAudio\|function transcribeAudio" src/services/transcription src/services/transcriptionService.ts 2>/dev/null | head -10`
Expected: exact file + line.

- [ ] **Step 2: Wrap with runBoosted only on local-whisper path**

At the top of that file:

```typescript
import * as samsungPerf from '../samsungPerf';
```

Inside `transcribeAudio`, at the point where the code branches into local-whisper (condition like `profile.useLocalWhisper`), wrap the local call:

```typescript
if (useLocalWhisper) {
  return samsungPerf.runBoosted('whisper_transcription', () =>
    runLocalWhisper(audioFilePath, options),
  );
}
```

(Leave the cloud transcription branch unchanged — cloud calls are network-bound and boosting does not help.)

- [ ] **Step 3: Typecheck + unit tests**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:unit:coverage:logic 2>&1 | tail -20`
Expected: typecheck clean, test suite still green.

- [ ] **Step 4: Commit**

```bash
git add src/services/transcription/index.ts
git commit -m "feat(transcription): boost CPU for local whisper runs"
```

---

## Task 10: Boost recording start + face detection

**Files:**

- Modify: `modules/app-launcher/android/src/main/java/expo/modules/applauncher/RecordingService.kt`
- Modify: `modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt`

- [ ] **Step 1: RecordingService — acquire brief BUS boost at startForeground**

At the top of `RecordingService.kt`, in the same package, no new import needed (same package).

Inside `onStartCommand(...)` immediately after `startForeground(...)` returns, add:

```kotlin
        val perfCtx = applicationContext
        runCatching {
            val perf = SamsungPerfController(perfCtx)
            if (perf.init()) {
                // Short BUS boost to reduce latency of MediaCodec init.
                perf.startPresetBoost(/* BUS */ 2, 2_000)
            }
        }
```

(We do not hold a reference — the 2 s preset self-releases via SDK timeout. This keeps the service stateless.)

- [ ] **Step 2: OverlayService — boost around face detector creation + thermal throttle**

In `OverlayService.kt`, find the existing block that constructs the face detector (line ~200 where `.setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)` is called). Immediately before that block, add:

```kotlin
        val sperf = SamsungPerfController(applicationContext)
        val sperfActive = sperf.init()
        val faceBoostId = if (sperfActive) sperf.startPresetBoost(/* GPU */ 1, 5_000) else -1
        sperf.onThermalWarning = { level ->
            // Level >= 2 → throttle: skip every other frame downstream.
            thermalThrottleLevel = level
        }
```

At the top of the class (fields area), add:

```kotlin
    @Volatile private var thermalThrottleLevel: Int = 0
```

In the frame-analysis callback (where each `ImageProxy` is processed), guard the ML Kit call with:

```kotlin
            if (thermalThrottleLevel >= 2 && (frameCounter++ % 2) == 0) {
                imageProxy.close()
                return@setAnalyzer
            }
```

(Declare `private var frameCounter: Int = 0` near the other fields.)

In `onDestroy()`, add:

```kotlin
        runCatching { sperf.stopAllBoosts(); sperf.shutdown() }
```

- [ ] **Step 3: Build**

Run: `cd android && ./gradlew :app-launcher:compileDebugKotlin 2>&1 | tail -20`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
git add modules/app-launcher/android/src/main/java/expo/modules/applauncher/RecordingService.kt \
        modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt
git commit -m "feat(native): boost recording + face-detect on Samsung, throttle on thermal warn"
```

---

## Task 11: Device validation on real Samsung hardware

**Files:** None modified. Document-only task.

- [ ] **Step 1: Install a dev build on Galaxy Tab S10+ (and S23 Ultra if available)**

Run: `npm run detox:build:android:genymotion:dev` then deploy via `adb install -r ...` or `npx expo run:android --device`. Genymotion will NOT exercise SPerf because the SDK requires a real Samsung chipset; device builds are mandatory here.

- [ ] **Step 2: Verify init logs**

Run: `adb logcat -s SamsungPerf:* GuruAppLauncher:*`
Expected: on Samsung, see `SamsungPerf: SPerf initialized v=1.0.0`. On non-Samsung emulator, see no SamsungPerf log and `samsungPerf.init()` returns `false`.

- [ ] **Step 3: Smoke-test boost paths**

Trigger each workload once and confirm no crash + a matching `startPreset`/`stop` pair in logs:

- Open the app → `app_boot` boost logs.
- Start a lecture recording from HomeScreen → `recording_start` + `face_detection` (if overlay enabled) fire.
- Run a quiz that goes through the local Gemma path → `llm_inference` logs.
- Run a local whisper transcription from `LectureReturnSheet` → `whisper_transcription` logs.

- [ ] **Step 4: Force a thermal warning (optional)**

Run several inferences back-to-back. If SDK reports `onHighTempWarning`, confirm the overlay frame skip kicks in (face-detect cadence halves). Record behavior in this checklist even if no warning fires — some devices only fire at genuine thermal stress.

- [ ] **Step 5: No commit**

This task produces device evidence only. If issues surface, raise follow-up tasks.

---

## Self-Review

**Spec coverage:**

- JAR → consumer wiring: Tasks 1–4.
- Non-Samsung fallback: Task 2 (`isSamsung()`), Task 5 (gate), Task 6 (test).
- Heavy-workload boosts: Tasks 7–10 cover boot, LLM, whisper, recording, face detect.
- Thermal reaction: Tasks 2 (listener), 5 (event bus), 10 (OverlayService consumer).

**Placeholder scan:** No TBDs, no "handle appropriately", every code step includes concrete code. Task 8 and Task 9 reference symbols (`someLocalInfer`, `runLocalWhisper`) that the engineer must resolve from a grep in Step 1 of each task — this is by design because the exact function name depends on current state of `src/services/ai/v2/` and `src/services/transcription/` which has been under active refactor (see `git log`).

**Type consistency:** `Workload` type, `WORKLOAD_PRESET` map, `SamsungPerfPreset` constants, and Kotlin `SamsungPerfController` method names (`init`, `startPresetBoost`, `startCustomBoost`, `stopBoost`, `stopAllBoosts`, `shutdown`) are used consistently across Tasks 2–10.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-samsung-performance-sdk.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
