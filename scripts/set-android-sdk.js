#!/usr/bin/env node
/**
 * set-android-sdk.js — Cross-platform ANDROID_SDK_ROOT resolver
 * Sets ANDROID_SDK_ROOT from environment or common defaults
 *
 * Usage: node scripts/set-android-sdk.js <command>
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getAndroidSdkRoot() {
  // 1. Use existing env var if set
  if (process.env.ANDROID_SDK_ROOT) {
    return process.env.ANDROID_SDK_ROOT;
  }
  if (process.env.ANDROID_HOME) {
    return process.env.ANDROID_HOME;
  }

  // 2. Try common locations based on platform
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows && process.env.LOCALAPPDATA) {
    const candidate = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (isMac && process.env.HOME) {
    const candidate = path.join(process.env.HOME, 'Library', 'Android', 'sdk');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const candidate2 = path.join(process.env.HOME, 'Android', 'Sdk');
    if (fs.existsSync(candidate2)) {
      return candidate2;
    }
  }

  // Linux
  if (process.env.HOME) {
    const candidate = path.join(process.env.HOME, 'Android', 'Sdk');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function main() {
  const sdkRoot = getAndroidSdkRoot();

  if (sdkRoot) {
    process.env.ANDROID_SDK_ROOT = sdkRoot;
    console.error(`[sdk] Using ANDROID_SDK_ROOT=${sdkRoot}`);
  } else {
    console.error(
      '[sdk] Warning: ANDROID_SDK_ROOT not found. Set ANDROID_SDK_ROOT or ANDROID_HOME.',
    );
  }

  // Execute the command with the env var set
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('No command provided');
    process.exit(1);
  }

  const isWindows = process.platform === 'win32';
  const cmd = isWindows && args[0].includes('npx') ? 'npx.cmd' : args[0];
  const cmdArgs = isWindows && args[0].includes('npx') ? args.slice(1) : args.slice(1);

  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: isWindows,
    env: process.env,
    timeout: 600_000,
  });

  process.exit(result.status || 0);
}

main();
