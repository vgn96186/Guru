#!/usr/bin/env node

const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { GURU_DEBUG_PACKAGE } = require('./android-tooling');

function printHelp() {
  console.log(`
Usage: node fetchLogs.js [options]

Options:
  --package, -p <packageName>   Override the Android package name (default: app.config.js, then app.json, then Guru dev client id)
  --level, -l <level>           Log level: V (verbose), D (debug), I (info), W (warn), E (error), S (silent). Default: V
  --help, -h                    Show this help message

Examples:
  node fetchLogs.js
  node fetchLogs.js --package com.myapp --level E
  node fetchLogs.js -l W
`);
}

function getPackageNameFromConfig() {
  const appJsonPath = path.resolve(__dirname, '..', 'app.json');
  const appConfigJsPath = path.resolve(__dirname, '..', 'app.config.js');

  if (fs.existsSync(appConfigJsPath)) {
    try {
      const appConfig = require(appConfigJsPath);
      const fromConfig = appConfig.android?.package || appConfig.package;
      if (fromConfig) return fromConfig;
    } catch (e) {
      console.warn(`Could not load ${appConfigJsPath}: ${e.message}`);
    }
  }

  if (fs.existsSync(appJsonPath)) {
    try {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      return (
        appJson.expo?.android?.package ||
        appJson.android?.package ||
        appJson.expo?.package ||
        appJson.package ||
        null
      );
    } catch (e) {
      console.warn(`Could not parse ${appJsonPath}: ${e.message}`);
    }
  }

  return null;
}

function checkDeviceConnected() {
  try {
    const output = execSync('adb devices', { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    // Skip the header line
    const deviceLines = lines
      .slice(1)
      .filter((line) => line.trim() && !line.startsWith('List of devices attached'));
    if (deviceLines.length === 0) {
      console.error(
        'No Android device connected. Please connect a device and authorize USB debugging.',
      );
      process.exit(1);
    }
    // Optional: check if device is authorized (not offline/unauthorized)
    const unauthorized = deviceLines.some(
      (line) => line.includes('unauthorized') || line.includes('offline'),
    );
    if (unauthorized) {
      console.warn(
        'Some devices are unauthorized or offline. Please check your device and authorize USB debugging if needed.',
      );
    }
  } catch (e) {
    console.error('Failed to run adb devices. Make sure adb is installed and in your PATH.');
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  let packageNameFromArg = null;
  let level = 'V'; // default to verbose

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--package' || arg === '-p') {
      packageNameFromArg = args[++i];
    } else if (arg === '--level' || arg === '-l') {
      level = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  const validLevels = ['V', 'D', 'I', 'W', 'E', 'S'];
  if (!validLevels.includes(level)) {
    console.error(`Invalid level: ${level}. Must be one of ${validLevels.join(', ')}`);
    process.exit(1);
  }

  // Check for connected device
  checkDeviceConnected();

  // Determine package name
  let packageName = packageNameFromArg || getPackageNameFromConfig();
  if (!packageName) {
    console.warn(
      `Could not determine package name from app config. Falling back to dev client package ${GURU_DEBUG_PACKAGE}.`,
    );
    packageName = GURU_DEBUG_PACKAGE;
  }

  console.log(`Fetching logs for package: ${packageName} at level: ${level}`);
  console.log('Press Ctrl+C to stop...\n');

  // Construct adb logcat arguments
  // Format: <tag>:<level> *:S
  // We want to show logs from our package and from ReactNativeJS (for JS console.log)
  const logcatArgs = ['logcat', `${packageName}:${level}`, `ReactNativeJS:${level}`, '*:S'];

  // Spawn adb logcat process
  const logcat = spawn('adb', logcatArgs);

  // Pipe output to stdout/stderr
  logcat.stdout.pipe(process.stdout);
  logcat.stderr.pipe(process.stderr);

  // Handle process exit
  logcat.on('close', (code) => {
    if (code !== 0) {
      console.error(`adb logcat process exited with code ${code}`);
    }
    process.exit(code);
  });

  // Handle interrupt signal (Ctrl+C) to terminate gracefully
  process.on('SIGINT', () => {
    console.log('\nStopping log capture...');
    logcat.kill('SIGINT');
    process.exit(0);
  });
}

main();
