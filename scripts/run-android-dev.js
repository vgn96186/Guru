#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const http = require('http');

const ADB_PORT = '8081';
const METRO_STATUS_URL = `http://127.0.0.1:${ADB_PORT}/status`;
const WAIT_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 1_000;

const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const ADB_CMD = process.platform === 'win32' ? 'adb.exe' : 'adb';
const USE_SHELL_FOR_NPX = process.platform === 'win32';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runSync(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
}

function ensureAdbAvailable() {
  const result = runSync(ADB_CMD, ['version']);
  if (result.error || result.status !== 0) {
    fail('adb is not installed or not on PATH.');
  }
}

function ensureDeviceConnected() {
  const result = runSync(ADB_CMD, ['devices']);
  if (result.error || result.status !== 0) {
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
  runSync(ADB_CMD, ['reverse', `tcp:${ADB_PORT}`, `tcp:${ADB_PORT}`], {
    stdio: 'ignore',
  });
}

function isMetroRunning() {
  return new Promise((resolve) => {
    const req = http.get(METRO_STATUS_URL, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve(body.includes('packager-status:running'));
      });
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1_500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForMetro() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    if (await isMetroRunning()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  fail(`Metro did not become ready on ${METRO_STATUS_URL}.`);
}

function startMetro() {
  return spawn(
    NPX_CMD,
    ['expo', 'start', '--dev-client', '--localhost', '--port', ADB_PORT, '-c'],
    {
      stdio: 'inherit',
      shell: USE_SHELL_FOR_NPX,
    },
  );
}

function runAndroid() {
  const result = spawnSync(NPX_CMD, ['expo', 'run:android', '--no-bundler'], {
    stdio: 'inherit',
    shell: USE_SHELL_FOR_NPX,
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

async function main() {
  ensureAdbAvailable();
  ensureDeviceConnected();
  ensureAdbReverse();

  let metroProcess = null;
  const metroAlreadyRunning = await isMetroRunning();

  if (!metroAlreadyRunning) {
    metroProcess = startMetro();
    metroProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        fail(`Metro exited early with code ${code}.`);
      }
    });
    await waitForMetro();
  } else {
    console.log('Metro already running on localhost:8081, reusing it.');
  }

  runAndroid();

  if (!metroProcess) {
    return;
  }

  const cleanup = () => {
    if (metroProcess && !metroProcess.killed) {
      metroProcess.kill();
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  await new Promise((resolve) => {
    metroProcess.on('exit', resolve);
  });
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
