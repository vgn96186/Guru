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
const ADB_TIMEOUT_MS = 15_000;
const REQUESTED_DEVICE_SERIAL = process.env.GURU_ANDROID_SERIAL?.trim() || '';
let activeDeviceSerial = '';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function logStep(message) {
  console.log(`[android-open] ${message}`);
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
    logStep('Ensuring adb server is running (no full reset — set GURU_ADB_HARD_RESET=1 if adb is stuck)...');
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

  const readyDevices = parseAdbDeviceRows(result.stdout).filter((row) => row.state === 'device');
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
    `Setting adb reverse for ${activeDeviceSerial || 'default device'} tcp:${ADB_PORT} -> tcp:${ADB_PORT}...`,
  );
  const result = runDeviceSync(['reverse', `tcp:${ADB_PORT}`, `tcp:${ADB_PORT}`]);
  if (result.status !== 0) {
    fail('Failed to set adb reverse for Metro on port 8081.');
  }
}

function sleepMs(ms) {
  if (process.platform === 'win32') {
    spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`],
      { stdio: 'pipe', timeout: 5_000, windowsHide: true },
    );
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
  logStep('Dev client missing — running adb-install-dev-apk.js --if-missing (needs app-debug.apk on disk)...');
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

ensureAdbAvailable();
ensureAdbServerRunning();
ensureDeviceConnected();
ensureDevClientInstalled();
ensureAdbReverse();
openDevClient();
logStep('Dev client open command sent.');
