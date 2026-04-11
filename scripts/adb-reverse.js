#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { resolveAdbCommand } = require('./android-tooling');

const ADB_PORT = '8081';
const ADB_CMD = resolveAdbCommand();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runSync(args) {
  const result = spawnSync(ADB_CMD, args, {
    stdio: 'pipe',
    encoding: 'utf8',
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
    fail(`Failed to set adb reverse for port ${ADB_PORT}.`);
  }
}

ensureAdbAvailable();
ensureDeviceConnected();
ensureAdbReverse();

console.log(`Reversed tcp:${ADB_PORT} to the connected device.`);
