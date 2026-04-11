#!/usr/bin/env node
/**
 * start-metro-logs.js — Cross-platform Metro starter with logging
 * Stops old Metro, then starts with cache clear. Logs to terminal AND metro.log
 *
 * Replaces: scripts/start-metro-logs.sh
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const METRO_LOG_PATH = path.join(ROOT, 'metro.log');
const METRO_ERR_LOG_PATH = path.join(ROOT, 'metro.err.log');

function isWindows() {
  return process.platform === 'win32';
}

/**
 * Stop old Metro processes
 */
function stopMetro() {
  const stopScript = path.join(ROOT, 'scripts', 'stop-metro.js');
  const result = spawnSync('node', [stopScript], {
    stdio: 'inherit',
    cwd: ROOT,
  });

  if (result.error) {
    console.error('Warning: Failed to stop old Metro process:', result.error.message);
  }
}

/**
 * Start Metro with logging to files
 */
function startMetroWithLogging() {
  console.log('=== Metro starting (terminal + metro.log) ===');

  // Open log files for appending
  const logFd = fs.openSync(METRO_LOG_PATH, 'a');
  const errFd = fs.openSync(METRO_ERR_LOG_PATH, 'a');

  const NPX_CMD = isWindows() ? 'npx.cmd' : 'npx';
  const USE_SHELL = isWindows();

  const metroEnv = {
    ...process.env,
    CI: process.env.CI || '',
    NODE_ENV: 'development',
  };

  const child = spawn(NPX_CMD, ['expo', 'start', '--clear'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: USE_SHELL,
    cwd: ROOT,
    env: metroEnv,
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    fs.writeSync(logFd, data);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    fs.writeSync(errFd, data);
    fs.writeSync(logFd, data);
  });

  child.on('close', (code) => {
    fs.closeSync(logFd);
    fs.closeSync(errFd);
    process.exit(code);
  });

  child.on('error', (err) => {
    console.error('Metro process error:', err.message);
    fs.closeSync(logFd);
    fs.closeSync(errFd);
    process.exit(1);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

async function main() {
  // Stop old Metro
  stopMetro();

  // Start Metro with logging
  startMetroWithLogging();
}

main();
