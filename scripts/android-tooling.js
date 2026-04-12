#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/** Debug build `applicationId` (see android/app/build.gradle `applicationIdSuffix '.dev'`). */
const GURU_DEBUG_PACKAGE = 'com.anonymous.gurustudy.dev';
/** Kotlin/Java namespace for MainActivity (unchanged by applicationId suffix). */
const GURU_MAIN_ACTIVITY_CLASS = 'com.anonymous.gurustudy.MainActivity';

/**
 * @param {string} adbCmd
 * @param {string} deviceSerial empty = default device
 * @param {string} packageName
 * @returns {boolean}
 */
function isAndroidPackageInstalled(adbCmd, deviceSerial, packageName) {
  const args = ['shell', 'pm', 'path', packageName];
  const scoped = deviceSerial ? ['-s', deviceSerial, ...args] : args;
  const result = spawnSync(adbCmd, scoped, {
    encoding: 'utf8',
    timeout: 15_000,
    stdio: 'pipe',
  });
  if (result.error || result.status !== 0) return false;
  return /^package:/m.test(String(result.stdout || ''));
}

function guruDevClientMissingMessage(packageName) {
  return [
    `The Guru Expo dev client is not installed on this device (missing package "${packageName}").`,
    '',
    'Put a debug APK on disk, then use Launcher → Install dev APK or run Doctor again:',
    '  • Launcher → Builds → "Build Debug APK" (creates android/app/build/outputs/apk/debug/app-debug.apk), or',
    '  • Copy app-debug.apk there / set GURU_DEV_APK to its full path.',
    '',
    'Command line (same as Launcher buttons): npm run android:adb-install',
    '',
    'More than one device plugged in? Set env GURU_ANDROID_SERIAL to the tablet serial from adb devices.',
    '',
    'Release APKs use a different app id and are not the Expo dev client.',
  ].join('\n');
}

function getAdbFilename() {
  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}

function getAdbCandidates() {
  const adbFile = getAdbFilename();
  const candidates = [];

  if (process.env.ANDROID_SDK_ROOT) {
    candidates.push(path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', adbFile));
  }

  if (process.env.ANDROID_HOME) {
    candidates.push(path.join(process.env.ANDROID_HOME, 'platform-tools', adbFile));
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', adbFile),
    );
  }

  if (process.platform === 'darwin' && process.env.HOME) {
    candidates.push(
      path.join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', adbFile),
    );
  }

  if (process.platform !== 'win32' && process.env.HOME) {
    candidates.push(path.join(process.env.HOME, 'Android', 'Sdk', 'platform-tools', adbFile));
  }

  return [...new Set(candidates)];
}

function resolveAdbCommand() {
  return getAdbCandidates().find((candidate) => fs.existsSync(candidate)) || getAdbFilename();
}

/**
 * Same device selection as `adb-install-dev-apk.js` / `open-android-dev-client.js`:
 * `GURU_ANDROID_SERIAL` if set and present, else first `adb devices` row in `device` state.
 *
 * @param {string} adbCmd
 * @returns {{ serial: string; readyCount: number; requested: string } | { error: string; ready?: { serial: string; state: string }[] } | null}
 */
function resolvePrimaryAdbDevice(adbCmd) {
  const requested = process.env.GURU_ANDROID_SERIAL?.trim() || '';
  const r = spawnSync(adbCmd, ['devices'], {
    encoding: 'utf8',
    timeout: 15_000,
    stdio: 'pipe',
  });
  if (r.error || r.status !== 0) {
    return null;
  }

  const ready = String(r.stdout || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { serial: parts[0] || '', state: parts[1] || '' };
    })
    .filter((row) => row.serial && row.state === 'device');

  if (!ready.length) {
    return null;
  }

  if (requested) {
    const found = ready.find((row) => row.serial === requested);
    if (!found) {
      return {
        error: `Requested device "${requested}" not in adb devices. Available: ${ready.map((x) => x.serial).join(', ')}`,
        ready,
      };
    }
    return { serial: found.serial, readyCount: ready.length, requested };
  }

  return { serial: ready[0].serial, readyCount: ready.length, requested: '' };
}

module.exports = {
  resolveAdbCommand,
  GURU_DEBUG_PACKAGE,
  GURU_MAIN_ACTIVITY_CLASS,
  isAndroidPackageInstalled,
  guruDevClientMissingMessage,
  resolvePrimaryAdbDevice,
};
