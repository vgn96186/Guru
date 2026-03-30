#!/usr/bin/env node

const { spawnSync } = require('child_process');

const ADB_PORT = '8081';
const APP_SCHEME = 'exp+guru-study';
const APP_PACKAGE = 'com.anonymous.gurustudy';
const DEV_CLIENT_URL =
  `${APP_SCHEME}://expo-development-client/?url=` +
  encodeURIComponent(`http://127.0.0.1:${ADB_PORT}`);

const ADB_CMD = process.platform === 'win32' ? 'adb.exe' : 'adb';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runSync(args, options = {}) {
  const result = spawnSync(ADB_CMD, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    fail(result.error.message);
  }

  return result;
}

function ensureAdbAvailable() {
  const result = runSync(['version']);
  if (result.status !== 0) {
    fail('adb is not installed or not on PATH.');
  }
}

function ensureDeviceConnected() {
  const result = runSync(['devices']);
  if (result.status !== 0) {
    fail('Failed to query adb devices.');
  }

  const hasDevice = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .some((line) => /\bdevice\b/.test(line));

  if (!hasDevice) {
    fail('No adb device detected. Connect a device and run `adb devices`.');
  }
}

function ensureAdbReverse() {
  const result = runSync(['reverse', `tcp:${ADB_PORT}`, `tcp:${ADB_PORT}`]);
  if (result.status !== 0) {
    fail('Failed to set adb reverse for Metro on port 8081.');
  }
}

function stopRunningApp() {
  const result = runSync(['shell', 'am', 'force-stop', APP_PACKAGE]);
  if (result.status !== 0) {
    fail(`Failed to stop ${APP_PACKAGE} before relaunch.`);
  }
}

function openDevClient() {
  const result = spawnSync(
    ADB_CMD,
    ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', DEV_CLIENT_URL],
    {
      stdio: 'inherit',
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
ensureDeviceConnected();
ensureAdbReverse();
stopRunningApp();
openDevClient();
