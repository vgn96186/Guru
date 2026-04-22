#!/usr/bin/env node
/**
 * Install the Guru debug dev client with adb only — no Gradle, no `npm run android`.
 *
 * APK resolution:
 *   1. GURU_DEV_APK — absolute path, or path relative to repo root
 *   2. android/app/build/outputs/apk/debug/app-debug.apk
 *
 * Device: same as other Guru scripts — GURU_ANDROID_SERIAL or first `adb devices` device.
 *
 * Flags:
 *   --if-missing  If the dev package is already installed, exit 0. If not installed and no APK
 *                 file exists, exit 1 (Doctor skips opening the app). If not installed and APK
 *                 exists, install and exit per adb result.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveAdbCommand,
  GURU_DEBUG_PACKAGE,
  isAndroidPackageInstalled,
} = require('./android-tooling');

const ROOT = path.join(__dirname, '..');
const DEFAULT_APK = path.join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk',
);
const REQUESTED_DEVICE_SERIAL = process.env.GURU_ANDROID_SERIAL?.trim() || '';
const IF_MISSING = process.argv.includes('--if-missing');
const ADB_CMD = resolveAdbCommand();
const ADB_TIMEOUT_MS = 120_000;

let activeDeviceSerial = '';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function log(message) {
  console.log(`[adb-install] ${message}`);
}

function runSync(args, options = {}) {
  return spawnSync(ADB_CMD, args, {
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
    timeout: options.timeout ?? ADB_TIMEOUT_MS,
    ...options,
  });
}

function runDeviceSync(args, options = {}) {
  const scoped = activeDeviceSerial ? ['-s', activeDeviceSerial, ...args] : args;
  return runSync(scoped, options);
}

function parseAdbDeviceRows(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { serial: parts[0] || '', state: parts[1] || '' };
    })
    .filter((row) => row.serial);
}

function ensureDeviceConnected() {
  const result = runSync(['devices']);
  if (result.status !== 0) {
    fail('Failed to query adb devices.');
  }
  const ready = parseAdbDeviceRows(result.stdout).filter((row) => row.state === 'device');
  if (!ready.length) {
    fail('No adb device detected. Connect a device and run `adb devices`.');
  }
  if (REQUESTED_DEVICE_SERIAL) {
    const found = ready.find((row) => row.serial === REQUESTED_DEVICE_SERIAL);
    if (!found) {
      fail(
        `Requested device "${REQUESTED_DEVICE_SERIAL}" not found. Available: ${ready
          .map((r) => r.serial)
          .join(', ')}`,
      );
    }
    activeDeviceSerial = found.serial;
  } else {
    activeDeviceSerial = ready[0].serial;
    if (ready.length > 1) {
      log(`Multiple devices — using ${activeDeviceSerial}. Set GURU_ANDROID_SERIAL to override.`);
    }
  }
}

function resolveApkPath() {
  const raw = process.env.GURU_DEV_APK?.trim();
  if (raw) {
    const p = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
    return { path: p, source: `GURU_DEV_APK` };
  }
  return { path: DEFAULT_APK, source: 'default build output' };
}

function uninstallPackage(packageName) {
  log(`Attempting to uninstall ${packageName}...`);
  const result = runDeviceSync(['uninstall', packageName], { stdio: 'pipe' });
  if (result.status === 0) {
    log(`Successfully uninstalled ${packageName}`);
  } else {
    // It's okay if uninstall fails (package might not exist)
    log(
      `Package ${packageName} not installed or couldn't be uninstalled: ${
        result.stderr || 'unknown error'
      }`,
    );
  }
}

function main() {
  ensureDeviceConnected();

  const PRODUCTION_PACKAGE = 'com.anonymous.gurustudy';

  if (IF_MISSING && isAndroidPackageInstalled(ADB_CMD, activeDeviceSerial, GURU_DEBUG_PACKAGE)) {
    log(`${GURU_DEBUG_PACKAGE} is already installed — skipping.`);
    process.exit(0);
  }

  const { path: apkPath, source } = resolveApkPath();
  if (!fs.existsSync(apkPath)) {
    if (IF_MISSING) {
      console.error(
        [
          '[adb-install] The dev client is not on this device and no APK file was found.',
          '',
          `Look for or place the file here:\n  ${apkPath}`,
          '',
          'One-time fix (pick one):',
          '  • Guru Launcher → Builds → "Build Debug APK" (writes that file), then run Doctor again.',
          '  • Copy app-debug.apk from another machine into that folder, or set env GURU_DEV_APK to the full path.',
          '',
          'Doctor will skip "Open Dev Client" until this file exists.',
        ].join('\n'),
      );
      process.exit(1);
    }
    fail(
      [
        `APK not found:\n  ${apkPath}`,
        '',
        'Use a file from a previous debug build, or set:',
        '  set GURU_DEV_APK=C:\\path\\to\\app-debug.apk',
        '',
        'This script does not run Gradle.',
      ].join('\n'),
    );
  }

  // Uninstall any existing packages that might cause version downgrade errors
  // Try both the debug package and the production package
  uninstallPackage(GURU_DEBUG_PACKAGE);
  uninstallPackage(PRODUCTION_PACKAGE);

  log(`Installing ${apkPath} → ${activeDeviceSerial || 'default device'} ...`);
  const result = runDeviceSync(['install', '-r', apkPath], { stdio: 'inherit' });
  if (result.status !== 0) {
    fail(
      'adb install failed. Check USB debugging, storage space, and that the APK matches this device ABI.',
    );
  }
  // Check if either the debug package or production package is installed
  const debugInstalled = isAndroidPackageInstalled(ADB_CMD, activeDeviceSerial, GURU_DEBUG_PACKAGE);
  const prodInstalled = isAndroidPackageInstalled(ADB_CMD, activeDeviceSerial, PRODUCTION_PACKAGE);

  if (!debugInstalled && !prodInstalled) {
    fail(
      [
        'adb install reported success but neither package is installed:',
        `  Debug package: ${GURU_DEBUG_PACKAGE}`,
        `  Production package: ${PRODUCTION_PACKAGE}`,
        'The APK may have a different applicationId. Check build.gradle flavors.',
      ].join('\n'),
    );
  }

  const installedPackage = debugInstalled ? GURU_DEBUG_PACKAGE : PRODUCTION_PACKAGE;
  log(
    `Install finished (package: ${installedPackage}). You can use Open Dev Client or Doctor next.`,
  );
}

main();
