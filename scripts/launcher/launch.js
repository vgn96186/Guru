#!/usr/bin/env node
/**
 * launch.js — Self-healing Guru Dev Launcher entry point.
 *
 * Always ensures a working launcher is running and browser opens.
 * Kills stale/stuck instances only when needed. No PowerShell dependency.
 */

const http = require('http');
const path = require('path');
const { execSync, spawn } = require('child_process');

const PORT = 3100;
const SERVER_SCRIPT = path.join(__dirname, 'server.js');
const ROOT = path.join(__dirname, '..', '..');
const READY_TIMEOUT_MS = 20_000;
const READY_POLL_MS = 500;
const EXPECTED_BUILD_ID =
  '2026-04-14 doctor-v10 (patch verification + adbCmd fix + connect/reload recovery + startup health checks)';

function log(msg) {
  console.log(`[launcher] ${msg}`);
}

function openBrowser() {
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "http://localhost:${PORT}"`, {
        shell: true,
        stdio: 'ignore',
        timeout: 5_000,
      });
    } else if (process.platform === 'darwin') {
      execSync(`open "http://localhost:${PORT}"`, { stdio: 'ignore', timeout: 5_000 });
    } else {
      execSync(`xdg-open "http://localhost:${PORT}"`, { stdio: 'ignore', timeout: 5_000 });
    }
  } catch {
    log(`Could not auto-open browser. Go to http://localhost:${PORT}`);
  }
}

function findPidsOnPort() {
  if (process.platform !== 'win32') return [];
  try {
    const raw = execSync('netstat -ano', {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of raw.split(/\r?\n/)) {
      if (line.includes(`:${PORT}`) && /LISTENING/i.test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid) && pid !== '0') {
          pids.add(pid);
        }
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killPids(pids) {
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 5_000 });
      log(`Killed stale process PID ${pid}.`);
    } catch {}
  }
}

function startServer() {
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GURU_LAUNCHER_NO_OPEN: '1',
      GURU_LAUNCHER_PORT: String(PORT),
    },
  });
  child.unref();
  return child.pid;
}

function probeServer() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/status`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({
            ok: true,
            body: parsed,
            matchesExpectedBuild: parsed?.launcherBuildId === EXPECTED_BUILD_ID,
          });
        } catch {
          resolve({ ok: false, body: null, matchesExpectedBuild: false });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, body: null, matchesExpectedBuild: false }));
    req.setTimeout(5_000, () => {
      req.destroy();
      resolve({ ok: false, body: null, matchesExpectedBuild: false });
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const probe = await probeServer();
    if (probe.ok && probe.matchesExpectedBuild) return true;
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
  return false;
}

async function main() {
  // First check: is the launcher already running and healthy?
  log('Checking if launcher is already running...');
  const probe = await probeServer();
  if (probe.ok && probe.matchesExpectedBuild) {
    log('Launcher is already running. Opening browser.');
    openBrowser();
    return;
  }

  if (probe.ok && !probe.matchesExpectedBuild) {
    log(
      `A stale launcher instance is running on port ${PORT} (build: ${
        probe.body?.launcherBuildId || 'unknown'
      }). Replacing it...`,
    );
  }

  // Kill whatever is on the port (stale/crashed instance)
  const pids = findPidsOnPort();
  if (pids.length) {
    log(`Clearing ${pids.length} stale process(es) on port ${PORT}...`);
    killPids(pids);
    await new Promise((r) => setTimeout(r, 1_500));
  }

  // Start fresh
  log('Starting fresh Guru Dev Launcher...');
  const pid = startServer();
  log(`Server process started (PID ${pid}). Waiting for it to be ready...`);

  const ready = await waitForServer();
  if (!ready) {
    log(`Server did not respond in time. Try opening http://localhost:${PORT} manually.`);
    process.exit(1);
  }

  log('Launcher is ready. Opening browser.');
  openBrowser();
}

main().catch((err) => {
  log(`Error: ${err.message || err}`);
  process.exit(1);
});
