#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { resolveAdbCommand } = require('./android-tooling');

const ADB_PORT = '8081';
const ADB_CMD = resolveAdbCommand();
const REQUESTED_DEVICE_SERIAL = process.env.GURU_ANDROID_SERIAL?.trim() || '';
const MAX_RETRIES = 3;

let activeDeviceSerial = '';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function log(msg) {
  console.log(`[adb-reverse] ${msg}`);
}

function killAllAdb() {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/IM', 'adb.exe', '/F'], { stdio: 'pipe', timeout: 8_000 });
  } else {
    spawnSync('pkill', ['-f', 'adb'], { stdio: 'pipe', timeout: 8_000 });
  }
}

function adbOk(args) {
  const result = spawnSync(ADB_CMD, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 10_000,
  });
  return !result.error && result.status === 0;
}

function adb(args) {
  const scoped = activeDeviceSerial ? ['-s', activeDeviceSerial, ...args] : args;
  return spawnSync(ADB_CMD, scoped, {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function restartAdb() {
  killAllAdb();
  spawnSync(ADB_CMD, ['start-server'], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function ensureHealthyAdb() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (adbOk(['version'])) {
      log('ADB is responsive.');
      return;
    }

    log(attempt === 1
      ? 'ADB not responding. Killing stale processes and restarting...'
      : `ADB retry ${attempt}/${MAX_RETRIES}...`);
    restartAdb();
  }

  fail('ADB could not be made responsive. Is the Android SDK installed?');
}

function parseDevices(stdout) {
  return (stdout || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { serial: parts[0] || '', state: parts[1] || '' };
    })
    .filter((row) => row.serial && row.state === 'device');
}

function ensureDevice() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = spawnSync(ADB_CMD, ['devices', '-l'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 10_000,
    });

    if (result.error || result.status !== 0) {
      log('Failed to query devices. Restarting ADB...');
      restartAdb();
      continue;
    }

    const devices = parseDevices(result.stdout);
    if (!devices.length) {
      if (attempt < MAX_RETRIES) {
        log('No devices found. Retrying...');
        restartAdb();
        continue;
      }
      fail('No adb device detected. Connect a device and enable USB debugging.');
    }

    if (REQUESTED_DEVICE_SERIAL) {
      const match = devices.find((d) => d.serial === REQUESTED_DEVICE_SERIAL);
      if (!match) {
        fail(`Device "${REQUESTED_DEVICE_SERIAL}" not found. Available: ${devices.map((d) => d.serial).join(', ')}`);
      }
      activeDeviceSerial = match.serial;
    } else {
      activeDeviceSerial = devices[0].serial;
    }

    log(`Device: ${activeDeviceSerial}`);
    return;
  }
}

function ensureReverse() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = adb(['reverse', `tcp:${ADB_PORT}`, `tcp:${ADB_PORT}`]);
    if (!result.error && result.status === 0) {
      log(`Reversed tcp:${ADB_PORT} successfully.`);
      return;
    }

    if (attempt < MAX_RETRIES) {
      log('Reverse failed. Restarting ADB and retrying...');
      restartAdb();
    }
  }

  fail(`Could not set adb reverse for port ${ADB_PORT} after ${MAX_RETRIES} attempts.`);
}

ensureHealthyAdb();
ensureDevice();
ensureReverse();

