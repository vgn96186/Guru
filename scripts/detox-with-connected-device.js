#!/usr/bin/env node
/**
 * detox-with-connected-device.js — Cross-platform Detox device resolver
 * Resolves DETOX_ADB_NAME from `adb devices` so Detox can attach without manual serials.
 * Prefers Genymotion; if several Genymotion devices are connected, prefers a tablet.
 *
 * Replaces: scripts/detox-with-connected-device.sh
 */

const { spawnSync } = require('child_process');
const { resolveAdbCommand } = require('./android-tooling');

const ADB_CMD = resolveAdbCommand();

function isWindows() {
  return process.platform === 'win32';
}

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
    fail(`adb command failed: ${result.error.message}`);
  }

  return result;
}

/**
 * Parse adb devices -l output and pick the best device
 */
function pickDevice() {
  // Check if DETOX_ADB_NAME is already set in environment
  if (process.env.DETOX_ADB_NAME) {
    console.error(`[detox] Using preset DETOX_ADB_NAME=${process.env.DETOX_ADB_NAME}`);
    return process.env.DETOX_ADB_NAME;
  }

  // Get detailed device list
  const result = runSync(['devices', '-l']);
  if (result.status !== 0) {
    fail('Failed to get adb devices');
  }

  const lines = result.stdout.split('\n').slice(1); // Skip first line ("List of devices attached")

  // Parse Genymotion devices
  const gmLines = lines.filter(
    (line) => line.includes('device:genymotion') && line.includes(' device '),
  );

  if (gmLines.length > 1) {
    // Multiple Genymotion devices — prefer tablet
    const tabletLine = gmLines.find((line) => /model:.*[Tt]ablet|product:.*[Tt]ablet/i.test(line));

    if (tabletLine) {
      const serial = tabletLine.trim().split(/\s+/)[0];
      return serial;
    }
  }

  // Single (or first) Genymotion
  const gmLine = gmLines[0];
  if (gmLine) {
    const serial = gmLine.trim().split(/\s+/)[0];
    return serial;
  }

  // Fallback: first device in "device" state
  const simpleResult = runSync(['devices']);
  const simpleLines = simpleResult.stdout.split('\n').slice(1);

  for (const line of simpleLines) {
    const parts = line.trim().split(/\s+/);
    if (parts[1] === 'device') {
      return parts[0];
    }
  }

  return null;
}

/**
 * Parse environment variable value from command line
 * Format: KEY=value
 */
function parseEnvArg(arg) {
  const match = arg.match(/^([A-Z_]+)=(.*)$/);
  if (match) {
    return { key: match[1], value: match[2] };
  }
  return null;
}

async function main() {
  // Ensure adb is available
  const adbVersion = spawnSync(ADB_CMD, ['version'], { stdio: 'pipe', encoding: 'utf8' });
  if (adbVersion.status !== 0) {
    fail('adb not found. Install Android platform-tools or set ANDROID_HOME.');
  }

  // Pick device
  const serial = pickDevice();
  if (!serial) {
    fail(
      'No usable Android device in `adb devices`. Start Genymotion (or connect a device), then retry.',
    );
  }

  // Set environment variable
  process.env.DETOX_ADB_NAME = serial;
  console.error(`[detox] Using adb device: ${process.env.DETOX_ADB_NAME}`);

  // Parse command line arguments (the command to execute)
  const args = process.argv.slice(2);
  if (args.length === 0) {
    fail('No command provided. Usage: node detox-with-connected-device.js <command>');
  }

  // Execute the command with DETOX_ADB_NAME set
  const NPX_CMD = isWindows() ? 'npx.cmd' : 'npx';
  const NODE_CMD = isWindows() ? 'node.exe' : 'node';

  // Determine the command to run
  const cmdToRun = args[0].includes('npx') ? NPX_CMD : NODE_CMD;
  const cmdArgs = args[0].includes('npx') ? args.slice(1) : args;

  const child = spawnSync(cmdToRun, cmdArgs, {
    stdio: 'inherit',
    shell: isWindows(),
    env: process.env,
  });

  process.exit(child.status || 0);
}

main();
