#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const { resolveAdbCommand } = require('./android-tooling');

const ADB_PORT = '8081';
const APP_PACKAGE = 'com.anonymous.gurustudy.dev';
const APP_ACTIVITY = 'com.anonymous.gurustudy.MainActivity';
const DEV_CLIENT_URL =
  `exp+guru-study://expo-development-client/?url=` +
  encodeURIComponent(`http://127.0.0.1:${ADB_PORT}`);
const METRO_STATUS_URL = `http://127.0.0.1:${ADB_PORT}/status`;
const ADB_CMD = resolveAdbCommand();
const GRADLE_CMD = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const ANDROID_DIR = path.join(process.cwd(), 'android');
const METRO_LOG_PATH = path.join(process.cwd(), 'metro-dev.log');
const METRO_ERR_LOG_PATH = path.join(process.cwd(), 'metro-dev.err.log');
const METRO_START_SCRIPT = path.join(__dirname, 'start-metro-background.js');
const REQUESTED_DEVICE_SERIAL = process.env.GURU_ANDROID_SERIAL?.trim() || '';
const MAX_RETRIES = 3;

let activeDeviceSerial = '';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function log(message) {
  console.log(`[android-dev] ${message}`);
}

function killAllAdb() {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/IM', 'adb.exe', '/F'], { stdio: 'pipe', timeout: 8_000 });
  } else {
    spawnSync('pkill', ['-f', 'adb'], { stdio: 'pipe', timeout: 8_000 });
  }
}

function adb(args, options = {}) {
  const timeout = options.timeout ?? 10_000;
  const scoped = activeDeviceSerial && !options.global ? ['-s', activeDeviceSerial, ...args] : args;

  const result = spawnSync(ADB_CMD, scoped, {
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
    timeout,
  });

  return result;
}

function adbOk(args, options = {}) {
  const result = adb(args, options);
  return !result.error && result.status === 0;
}

function readLogTail(filePath, maxLines = 30) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

// ─── Step 1: Get ADB into a healthy state ───────────────────────────────────

function ensureHealthyAdb() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(
      attempt === 1
        ? `Checking adb at ${ADB_CMD}...`
        : `ADB health check attempt ${attempt}/${MAX_RETRIES}...`,
    );

    if (adbOk(['version'], { timeout: 5_000, global: true })) {
      log('ADB is responsive.');
      return;
    }

    log('ADB is not responding. Killing stale processes and restarting...');
    killAllAdb();
    spawnSync(ADB_CMD, ['start-server'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 15_000,
    });
  }

  fail('ADB could not be made responsive after multiple attempts. Is the Android SDK installed?');
}

// ─── Step 2: Find and lock onto a device ────────────────────────────────────

function parseDevices(stdout) {
  return (stdout || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { serial: parts[0] || '', state: parts[1] || '', raw: line };
    })
    .filter((row) => row.serial && row.state === 'device');
}

function ensureDevice() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(
      attempt === 1
        ? 'Checking connected Android devices...'
        : `Device check attempt ${attempt}/${MAX_RETRIES}...`,
    );

    const result = adb(['devices', '-l'], { global: true });
    if (result.error || result.status !== 0) {
      log('Failed to query devices. Restarting ADB server...');
      killAllAdb();
      spawnSync(ADB_CMD, ['start-server'], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 15_000,
      });
      continue;
    }

    const devices = parseDevices(result.stdout);
    if (!devices.length) {
      if (attempt < MAX_RETRIES) {
        log('No devices found. Waiting 3s for device to appear...');
        spawnSync(ADB_CMD, ['wait-for-device'], { timeout: 5_000, stdio: 'pipe' });
        continue;
      }
      fail(
        'No adb device detected. Start an Android emulator (AVD) or connect a device with USB debugging enabled.',
      );
    }

    if (REQUESTED_DEVICE_SERIAL) {
      const match = devices.find((d) => d.serial === REQUESTED_DEVICE_SERIAL);
      if (!match) {
        fail(
          `Requested device "${REQUESTED_DEVICE_SERIAL}" not found. Available: ${devices.map((d) => d.serial).join(', ')}`,
        );
      }
      activeDeviceSerial = match.serial;
    } else {
      activeDeviceSerial = devices[0].serial;
      if (devices.length > 1) {
        log(
          `Multiple devices: ${devices.map((d) => d.serial).join(', ')}. Using ${activeDeviceSerial}. Set GURU_ANDROID_SERIAL to override.`,
        );
      }
    }

    log(`Device ready: ${activeDeviceSerial}`);
    return;
  }
}

// ─── Step 3: Set up reverse port ────────────────────────────────────────────

function ensureReverse() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(
      attempt === 1
        ? `Setting adb reverse tcp:${ADB_PORT}...`
        : `Reverse port attempt ${attempt}/${MAX_RETRIES}...`,
    );

    if (adbOk(['reverse', `tcp:${ADB_PORT}`, `tcp:${ADB_PORT}`], { stdio: 'ignore' })) {
      log('Reverse port tunnel established.');
      return;
    }

    log('Reverse failed. Restarting ADB and retrying...');
    killAllAdb();
    spawnSync(ADB_CMD, ['start-server'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 15_000,
    });
  }

  fail(`Could not set adb reverse for port ${ADB_PORT} after ${MAX_RETRIES} attempts.`);
}

// ─── Step 4: Metro ──────────────────────────────────────────────────────────

function isMetroRunning() {
  return new Promise((resolve) => {
    const req = http.get(METRO_STATUS_URL, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body.includes('packager-status:running')));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startMetro() {
  log(`Starting Metro in background...`);
  const result = spawnSync(process.execPath, [METRO_START_SCRIPT], {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 20_000,
  });

  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    fail(`Failed to start Metro.${detail ? '\n' + detail : ''}`);
  }

  const stdout = (result.stdout || '').trim();
  if (stdout) {
    stdout.split(/\r?\n/).forEach((line) => log(line));
  }
}

async function ensureMetro() {
  if (await isMetroRunning()) {
    log('Metro already running on localhost:8081, reusing it.');
    return;
  }

  startMetro();

  const startTime = Date.now();
  const deadline = startTime + 120_000;
  let lastLog = -1;
  while (Date.now() < deadline) {
    if (await isMetroRunning()) {
      log('Metro is ready.');
      return;
    }

    const sec = Math.floor((Date.now() - startTime) / 1000);
    if (sec > 0 && sec % 5 === 0 && sec !== lastLog) {
      lastLog = sec;
      log(`Waiting for Metro... (${sec}s)`);
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  const logTail = readLogTail(METRO_LOG_PATH);
  const errTail = readLogTail(METRO_ERR_LOG_PATH);
  let msg = 'Metro did not become ready after 120s.';
  if (logTail) msg += `\nLast logs:\n${logTail}`;
  if (errTail) msg += `\nLast errors:\n${errTail}`;
  fail(msg);
}

// ─── Step 5: Build and install ──────────────────────────────────────────────

const KNOWN_ABIS = new Set(['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);

function getDevicePrimaryAbi() {
  const result = adb(['shell', 'getprop', 'ro.product.cpu.abi'], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.error || result.status !== 0) return '';
  const abi = String(result.stdout || '').trim();
  return KNOWN_ABIS.has(abi) ? abi : '';
}

function installApp() {
  log('Building and installing debug app...');
  const envArch = process.env.GURU_REACT_NATIVE_ARCHITECTURES?.trim();
  const deviceAbi = getDevicePrimaryAbi();
  const archArg = envArch || deviceAbi;

  const gradleArgs = [':app:installDevDebug', '--console=plain', '--build-cache'];
  // Speed: single ABI matching the connected device/emulator. Omit to use android/gradle.properties
  // (slower first build). Typical AVDs are x86_64; ARM tablets/phones are arm64-v8a.
  if (archArg) {
    gradleArgs.push(`-PreactNativeArchitectures=${archArg}`);
    log(
      `Native libs: -PreactNativeArchitectures=${archArg}${envArch ? ' (from GURU_REACT_NATIVE_ARCHITECTURES)' : deviceAbi ? ' (from device)' : ''}`,
    );
  } else {
    log(
      'Native libs: using default reactNativeArchitectures from Gradle (no single-ABI override).',
    );
  }

  const result = spawnSync(
    GRADLE_CMD,
    // Product flavor `dev` — plain `installDebug` is ambiguous when multiple flavors exist.
    gradleArgs,
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd: ANDROID_DIR,
      env: process.env,
      timeout: 1_800_000,
    },
  );

  if (result.error?.code === 'ETIMEDOUT') {
    fail('Gradle build timed out after 30 minutes. The build may be stuck — try again.');
  }
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

// ─── Step 6: Open the app ───────────────────────────────────────────────────

function openApp() {
  const preferDeepLink =
    process.env.GURU_OPEN_MODE === 'deeplink' || process.argv.includes('--deeplink');
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(
      attempt === 1
        ? 'Opening Guru dev client on device...'
        : `Open app attempt ${attempt}/${MAX_RETRIES}...`,
    );

    const args = preferDeepLink
      ? [
          'shell',
          'am',
          'start',
          '-n',
          `${APP_PACKAGE}/${APP_ACTIVITY}`,
          '-a',
          'android.intent.action.VIEW',
          '-d',
          DEV_CLIENT_URL,
        ]
      : ['shell', 'am', 'start', '-n', `${APP_PACKAGE}/${APP_ACTIVITY}`];

    const result = adb(args, { stdio: 'inherit', timeout: 10_000 });

    if (!result.error && (result.status === 0 || result.status === null)) {
      return;
    }

    if (attempt < MAX_RETRIES) {
      log('Failed to open app. Re-establishing adb connection...');
      killAllAdb();
      spawnSync(ADB_CMD, ['start-server'], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 15_000,
      });
      adb(['reverse', `tcp:${ADB_PORT}`, `tcp:${ADB_PORT}`], { stdio: 'ignore' });
    }
  }

  fail('Could not open the Guru dev client after multiple attempts.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log('=== Guru Android Dev Launch ===');

  ensureHealthyAdb();
  ensureDevice();
  ensureReverse();
  await ensureMetro();
  installApp();
  openApp();

  log('=== Done. App should be running on the selected device or emulator. ===');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
