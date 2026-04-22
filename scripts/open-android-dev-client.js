#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveAdbCommand,
  GURU_DEBUG_PACKAGE,
  GURU_MAIN_ACTIVITY_CLASS,
  isAndroidPackageInstalled,
  guruDevClientMissingMessage,
} = require('./android-tooling');

const INSTALL_DEV_SCRIPT = path.join(__dirname, 'adb-install-dev-apk.js');
const REPO_ROOT = path.join(__dirname, '..');

const ADB_PORT = '8081';
const APP_PACKAGE = GURU_DEBUG_PACKAGE;
const APP_ACTIVITY = GURU_MAIN_ACTIVITY_CLASS;
const APP_SCHEME = 'exp+guru-study';
const DEV_CLIENT_URL =
  `${APP_SCHEME}://expo-development-client/?url=` +
  encodeURIComponent(`http://127.0.0.1:${ADB_PORT}`);

const ADB_CMD = resolveAdbCommand();
const ADB_TIMEOUT_MS = 30_000;
const APP_READY_TIMEOUT_MS = 45_000;
const HEALTH_LOG_TAG = 'GURU_HEALTH:';
const REQUESTED_DEVICE_SERIAL = process.env.GURU_ANDROID_SERIAL?.trim() || '';
let activeDeviceSerial = '';
const RELOAD_ONLY = process.argv.includes('--reload');
const FORCE_DEEPLINK =
  process.argv.includes('--deeplink') || process.env.GURU_OPEN_MODE === 'deeplink';
// Default to deeplinking the dev client to Metro URL; use --connect-only only when requested.
const CONNECT_ONLY = process.argv.includes('--connect-only') && !FORCE_DEEPLINK;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function logStep(message) {
  console.log(`[android-open] ${message}`);
}

function warnStep(message) {
  console.warn(`[android-open] ${message}`);
}

function runSync(args, options = {}) {
  const timeout = options.timeout ?? ADB_TIMEOUT_MS;
  const result = spawnSync(ADB_CMD, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout,
    ...options,
  });

  if (result.error?.code === 'ETIMEDOUT') {
    logStep(`adb ${args.join(' ')} timed out. Clearing stale adb.exe processes and retrying...`);
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/IM', 'adb.exe', '/F'], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 8_000,
      });
    } else {
      spawnSync('pkill', ['-f', 'adb'], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 8_000,
      });
    }

    const restartResult = spawnSync(ADB_CMD, ['start-server'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: ADB_TIMEOUT_MS,
    });
    if (restartResult.error || restartResult.status !== 0) {
      fail(restartResult.error?.message || restartResult.stderr || 'Failed to restart adb.');
    }

    return spawnSync(ADB_CMD, args, {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout,
      ...options,
    });
  }

  if (result.error) {
    fail(result.error.message);
  }

  return result;
}

function runDeviceSync(args, options = {}) {
  const scopedArgs = activeDeviceSerial ? ['-s', activeDeviceSerial, ...args] : args;
  return runSync(scopedArgs, options);
}

function clearAppHealthLogs() {
  logStep('Clearing app logcat buffer for fresh startup health check...');
  runDeviceSync(['logcat', '-c'], {
    stdio: 'pipe',
    timeout: 15_000,
  });
}

function parseAdbDeviceRows(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        serial: parts[0] || '',
        state: parts[1] || '',
      };
    })
    .filter((row) => row.serial);
}

function ensureAdbAvailable() {
  logStep(`Checking adb at ${ADB_CMD}...`);
  const result = runSync(['version']);
  if (result.status !== 0) {
    fail('adb is not installed or not on PATH.');
  }
}

/**
 * Ensure the adb daemon is up. Do not kill adb on every open — on Windows that often makes
 * `start-server` fail (race after taskkill, AV, or IDE holding adb) and breaks Doctor / Open Client.
 * Set GURU_ADB_HARD_RESET=1 to force kill-all-adb then start-server (last resort).
 */
function ensureAdbServerRunning() {
  if (process.env.GURU_ADB_HARD_RESET === '1') {
    logStep('GURU_ADB_HARD_RESET: killing adb processes, then start-server...');
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/IM', 'adb.exe', '/F'], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 8_000,
      });
    } else {
      spawnSync('pkill', ['-f', 'adb'], { stdio: 'pipe', encoding: 'utf8', timeout: 8_000 });
    }
    if (process.platform === 'win32') {
      spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 400'], {
        stdio: 'pipe',
        timeout: 5_000,
      });
    }
  } else {
    logStep(
      'Ensuring adb server is running (no full reset — set GURU_ADB_HARD_RESET=1 if adb is stuck)...',
    );
  }

  const result = spawnSync(ADB_CMD, ['start-server'], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (result.error || result.status !== 0) {
    const hint =
      process.env.GURU_ADB_HARD_RESET === '1'
        ? 'adb start-server still failed after hard reset. Try closing Android Studio, unplug/replug USB, then run again.'
        : 'adb start-server failed. Close other adb users, or retry with GURU_ADB_HARD_RESET=1 once.';
    fail(
      (result.error && result.error.message) ||
        (result.stderr && String(result.stderr).trim()) ||
        `Failed to start adb server. ${hint}`,
    );
  }
}

function ensureDeviceConnected() {
  logStep('Checking connected Android devices...');
  const result = runSync(['devices', '-l']);
  if (result.status !== 0) {
    fail('Failed to query adb devices.');
  }

  const rows = parseAdbDeviceRows(result.stdout);
  const readyDevices = rows.filter((row) => row.state === 'device');
  const unauthorizedDevices = rows.filter((row) => row.state === 'unauthorized');
  const offlineDevices = rows.filter((row) => row.state === 'offline');

  if (unauthorizedDevices.length) {
    fail(
      [
        `ADB device detected but not authorized: ${unauthorizedDevices
          .map((row) => row.serial)
          .join(', ')}`,
        'Unlock the phone/tablet and accept the USB debugging prompt, then click Connect again.',
      ].join(' '),
    );
  }

  if (offlineDevices.length && !readyDevices.length) {
    warnStep(
      `ADB device is offline: ${offlineDevices
        .map((row) => row.serial)
        .join(', ')}. Restarting adb server once...`,
    );
    runSync(['kill-server']);
    ensureAdbServerRunning();
    const retried = runSync(['devices', '-l']);
    const retriedRows = parseAdbDeviceRows(retried.stdout);
    const retriedReady = retriedRows.filter((row) => row.state === 'device');
    if (!retriedReady.length) {
      fail(
        [
          `ADB device is still offline: ${offlineDevices.map((row) => row.serial).join(', ')}`,
          'Reconnect the USB cable, enable USB debugging, and click Connect again.',
        ].join(' '),
      );
    }
    activeDeviceSerial = retriedReady[0].serial;
    if (REQUESTED_DEVICE_SERIAL) {
      const requestedRetried = retriedReady.find((row) => row.serial === REQUESTED_DEVICE_SERIAL);
      if (!requestedRetried) {
        fail(
          `Requested device "${REQUESTED_DEVICE_SERIAL}" was not found after adb recovery. Available devices: ${retriedReady
            .map((row) => row.serial)
            .join(', ')}.`,
        );
      }
      activeDeviceSerial = requestedRetried.serial;
    }
    logStep(`Using device after adb recovery: ${activeDeviceSerial}`);
    return;
  }

  if (!readyDevices.length) {
    fail('No adb device detected. Connect a device and run `adb devices`.');
  }

  if (REQUESTED_DEVICE_SERIAL) {
    const requestedDevice = readyDevices.find((row) => row.serial === REQUESTED_DEVICE_SERIAL);
    if (!requestedDevice) {
      const available = readyDevices.map((row) => row.serial).join(', ');
      fail(
        `Requested device "${REQUESTED_DEVICE_SERIAL}" was not found. Available devices: ${available}.`,
      );
    }
    activeDeviceSerial = requestedDevice.serial;
    logStep(`Using requested device: ${activeDeviceSerial}`);
    return;
  }

  activeDeviceSerial = readyDevices[0].serial;
  if (readyDevices.length > 1) {
    const available = readyDevices.map((row) => row.serial).join(', ');
    logStep(
      `Multiple devices detected (${available}). Using ${activeDeviceSerial}. Set GURU_ANDROID_SERIAL to override.`,
    );
  }
}

function ensureAdbReverse() {
  logStep(
    `Setting adb reverse for ${
      activeDeviceSerial || 'default device'
    } tcp:${ADB_PORT} -> tcp:${ADB_PORT}...`,
  );
  const result = runDeviceSync(['reverse', `tcp:${ADB_PORT}`, `tcp:${ADB_PORT}`]);
  if (result.status !== 0) {
    fail('Failed to set adb reverse for Metro on port 8081.');
  }

  // Give adb reverse time to propagate to the device
  logStep('Waiting 2s for adb reverse to take effect...');
  sleepMs(2000);
}

function ensureAppProcessStopped() {
  logStep('Stopping Guru app before reopen/reload...');
  runDeviceSync(['shell', 'am', 'force-stop', APP_PACKAGE], {
    stdio: 'pipe',
    timeout: 15_000,
  });
  sleepMs(800);
}

function ensureMainActivityLaunch() {
  logStep('Launching Guru main activity...');
  const result = runDeviceSync(['shell', 'am', 'start', '-n', `${APP_PACKAGE}/${APP_ACTIVITY}`], {
    stdio: 'inherit',
    timeout: ADB_TIMEOUT_MS,
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

/**
 * Read health log lines from device logcat.
 *
 * Previous implementation used `logcat -d -t 200 *:S ReactNativeJS:I ReactNative:V`
 * which had two problems on Windows + Samsung:
 *   1. `*:S` is a glob that Node's spawnSync can silently misinterpret.
 *   2. -t 200 is far too small — Samsung tablets can emit 200+ system log
 *      entries per second, causing GURU_HEALTH lines to rotate out before
 *      the next poll.
 *
 * Fix: dump a large chunk unfiltered and filter GURU_HEALTH in JS.
 */
function readHealthLog() {
  const result = runDeviceSync(['logcat', '-d', '-t', '5000'], {
    stdio: 'pipe',
    timeout: 20_000,
  });

  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(HEALTH_LOG_TAG));
  return lines;
}

function parseLatestHealthState(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const markerIndex = line.indexOf(HEALTH_LOG_TAG);
    if (markerIndex < 0) continue;
    const raw = line.slice(markerIndex + HEALTH_LOG_TAG.length).trim();
    const [stage, ...rest] = raw.split(':');
    return {
      stage: (stage || '').trim(),
      detail: rest.join(':').trim(),
      raw,
    };
  }
  return null;
}

/** Stages that count as "app is running and rendered". */
const READY_STAGES = new Set(['ui_ready', 'route_ready']);
const FAILURE_STAGES = new Set(['bootstrap_failed', 'runtime_error', 'render_error']);

function waitForAppReady() {
  logStep('Waiting for Guru startup health signal...');
  const deadline = Date.now() + APP_READY_TIMEOUT_MS;

  // Accumulate all health lines we've ever seen across polls so we survive
  // ring-buffer rotation.  Map stage → first occurrence detail.
  const seenStages = new Map();

  while (Date.now() < deadline) {
    const freshLines = readHealthLog();
    for (const line of freshLines) {
      const markerIndex = line.indexOf(HEALTH_LOG_TAG);
      if (markerIndex < 0) continue;
      const raw = line.slice(markerIndex + HEALTH_LOG_TAG.length).trim();
      const [stage, ...rest] = raw.split(':');
      const key = (stage || '').trim();
      if (key && !seenStages.has(key)) {
        seenStages.set(key, rest.join(':').trim());
      }
    }

    // Check accumulated stages for success
    for (const readyStage of READY_STAGES) {
      if (seenStages.has(readyStage)) {
        const detail = seenStages.get(readyStage);
        logStep(`Guru reported ${readyStage}${detail ? ` (${detail})` : ''}.`);
        return true;
      }
    }

    // Check accumulated stages for failure
    for (const failStage of FAILURE_STAGES) {
      if (seenStages.has(failStage)) {
        const detail = seenStages.get(failStage);
        fail(`Guru reported startup failure: ${failStage}${detail ? ` — ${detail}` : ''}`);
      }
    }

    sleepMs(800);
  }
  return false;
}

function sleepMs(ms) {
  if (process.platform === 'win32') {
    spawnSync('powershell', ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`], {
      stdio: 'pipe',
      timeout: 5_000,
      windowsHide: true,
    });
  } else {
    spawnSync('sleep', [String(Math.max(1, Math.ceil(ms / 1000)))], { stdio: 'pipe' });
  }
}

function waitForPackageVisible(maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (isAndroidPackageInstalled(ADB_CMD, activeDeviceSerial, APP_PACKAGE)) {
      return true;
    }
    sleepMs(350);
  }
  return isAndroidPackageInstalled(ADB_CMD, activeDeviceSerial, APP_PACKAGE);
}

function tryInstallDevApkWithAdb() {
  logStep(
    'Dev client missing — running adb-install-dev-apk.js --if-missing (needs app-debug.apk on disk)...',
  );
  const r = spawnSync(process.execPath, [INSTALL_DEV_SCRIPT, '--if-missing'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  return r.status === 0;
}

function ensureDevClientInstalled() {
  logStep(`Checking that ${APP_PACKAGE} is installed on the device...`);
  if (isAndroidPackageInstalled(ADB_CMD, activeDeviceSerial, APP_PACKAGE)) {
    return;
  }

  if (!tryInstallDevApkWithAdb()) {
    console.error(guruDevClientMissingMessage(APP_PACKAGE));
    process.exit(1);
  }

  if (!waitForPackageVisible()) {
    console.error(
      [
        `Install step exited 0 but "${APP_PACKAGE}" is still not visible on this device.`,
        'If multiple devices are connected, set GURU_ANDROID_SERIAL to the tablet serial from adb devices.',
        '',
        guruDevClientMissingMessage(APP_PACKAGE),
      ].join('\n'),
    );
    process.exit(1);
  }

  logStep('Dev client is installed on the device.');
}

function openDevClient() {
  logStep('Opening the Guru dev client...');
  const result = runDeviceSync(
    [
      'shell',
      'am',
      'start',
      '-n',
      `${APP_PACKAGE}/${APP_ACTIVITY}`,
      '-a',
      'android.intent.action.VIEW',
      '-d',
      DEV_CLIENT_URL,
    ],
    {
      stdio: 'inherit',
      timeout: ADB_TIMEOUT_MS,
    },
  );

  if (result.error) {
    fail(result.error.message);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function reloadApp() {
  ensureAppProcessStopped();
  if (CONNECT_ONLY) {
    ensureMainActivityLaunch();
    return;
  }
  openDevClient();
}

ensureAdbAvailable();
ensureAdbServerRunning();
ensureDeviceConnected();
ensureDevClientInstalled();
ensureAdbReverse();
clearAppHealthLogs();

if (RELOAD_ONLY) {
  reloadApp();
  if (!waitForAppReady()) {
    fail('Guru did not report ui_ready after reload.');
  }
  logStep('Guru app reload command sent and verified.');
} else {
  if (CONNECT_ONLY) {
    ensureMainActivityLaunch();
  } else {
    openDevClient();
  }
  if (!waitForAppReady()) {
    fail('Guru did not report ui_ready after open.');
  }
  logStep('Dev client open command sent and verified.');
}
