#!/usr/bin/env node
/**
 * build-apk.js — Cross-platform APK builder
 * Works on Windows, Mac, and Linux
 *
 * Usage:
 *   node scripts/build-apk.js --abi arm64-v8a --type debug
 *   node scripts/build-apk.js --abi x86_64 --type release
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');

function isWindows() {
  return process.platform === 'win32';
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let abi = 'arm64-v8a';
  let type = 'debug';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--abi' && args[i + 1]) {
      abi = args[i + 1];
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    }
  }

  return { abi, type };
}

/**
 * Run gradle wrapper
 */
function runGradle(task, extraArgs = []) {
  const GRADLE_CMD = isWindows()
    ? path.join(ANDROID_DIR, 'gradlew.bat')
    : path.join(ANDROID_DIR, 'gradlew');

  // Verify gradlew exists
  if (!fs.existsSync(GRADLE_CMD)) {
    fail(`Gradle wrapper not found at ${GRADLE_CMD}`);
  }

  const NODE_BIN = process.env.NODE_BINARY || process.execPath;

  console.log(`Running: ${GRADLE_CMD} ${task} ${extraArgs.join(' ')}`);

  const result = spawnSync(GRADLE_CMD, [task, ...extraArgs], {
    stdio: 'inherit',
    shell: isWindows(),
    cwd: ANDROID_DIR,
    env: {
      ...process.env,
      NODE_BINARY: NODE_BIN,
    },
  });

  if (result.error) {
    fail(`Gradle execution failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status);
  }
}

async function main() {
  const { abi, type } = parseArgs();

  const task = type === 'release' ? 'assembleRelease' : 'assembleDebug';
  const extraArgs = ['--console=plain', '--no-daemon', `-PreactNativeArchitectures=${abi}`];

  console.log(`Building ${type} APK for ${abi}...`);
  runGradle(task, extraArgs);
  console.log(`APK build complete for ${abi} (${type})`);
}

main();
