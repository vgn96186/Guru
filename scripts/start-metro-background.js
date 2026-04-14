#!/usr/bin/env node
/**
 * start-metro-background.js — Kill port 8081, start Metro detached.
 * No wmic. No PowerShell. No stop-metro.js dependency.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const LOG_PATH = path.join(ROOT, 'metro-dev.log');
const ERR_PATH = path.join(ROOT, 'metro-dev.err.log');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const CMD_TIMEOUT = 8_000;
function envForMetroChild() {
  const base = { ...process.env, NODE_ENV: 'development' };
  const loaderUrl = pathToFileURL(path.join(ROOT, 'scripts', 'fix-esm-windows.mjs')).href;
  const loaderFlag = `--loader ${loaderUrl}`;
  const cur = String(base.NODE_OPTIONS || '').trim();
  if (!cur.includes(loaderUrl)) {
    base.NODE_OPTIONS = cur ? `${loaderFlag} --no-warnings ${cur}` : `${loaderFlag} --no-warnings`;
  }
  return base;
}

function sleepMs(ms) {
  try {
    const sab = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(sab), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

function findPidsOnPort8081() {
  try {
    const raw = execSync('netstat -ano', {
      encoding: 'utf8',
      timeout: CMD_TIMEOUT,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of raw.split(/\r?\n/)) {
      if (line.includes(':8081') && /LISTENING/i.test(line)) {
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

function killPort8081() {
  if (process.platform !== 'win32') {
    try {
      const raw = execSync('lsof -tiTCP:8081 -sTCP:LISTEN 2>/dev/null || true', {
        encoding: 'utf8',
        shell: true,
        timeout: CMD_TIMEOUT,
      });
      for (const pid of raw.trim().split(/\s+/).filter(Boolean)) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
        } catch {}
      }
    } catch {}
    return;
  }

  // Windows: tree-kill (/T) + verify port is free
  let pids = findPidsOnPort8081();
  if (!pids.length) return;

  for (const pid of pids) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
      console.log(`[metro-bg] Killed old process tree on port 8081 (PID ${pid}).`);
    } catch {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
        console.log(`[metro-bg] Killed old process on port 8081 (PID ${pid}).`);
      } catch {}
    }
  }

  // Verify port is actually free (up to 3 seconds)
  for (let i = 0; i < 6; i++) {
    sleepMs(500);
    pids = findPidsOnPort8081();
    if (!pids.length) return;
    // Kill stragglers
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
      } catch {}
    }
  }
}

function main() {
  const stamp = new Date().toISOString();
  const banner = `===== ${stamp} metro start =====\n`;
  // Truncate logs on each fresh start so stale errors don't persist.
  fs.writeFileSync(LOG_PATH, banner);
  fs.writeFileSync(ERR_PATH, banner);

  killPort8081();

  const outFd = fs.openSync(LOG_PATH, 'a');
  const errFd = fs.openSync(ERR_PATH, 'a');

  const openAndroid = process.argv.includes('--android');
  const metroScript = openAndroid ? 'android:metro -- --android' : 'android:metro';

  const command = process.platform === 'win32' ? 'cmd.exe' : NPM_CMD;
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `${NPM_CMD} run ${metroScript}`]
      : ['run', ...metroScript.split(' ')];

  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    shell: false,
    stdio: ['ignore', outFd, errFd],
    env: envForMetroChild(),
  });

  child.unref();
  fs.closeSync(outFd);
  fs.closeSync(errFd);

  console.log(`[metro-bg] Started Metro in background${child.pid ? ` (pid ${child.pid})` : ''}.`);
  console.log(`[metro-bg] Logs: ${path.basename(LOG_PATH)}, ${path.basename(ERR_PATH)}`);
}

main();
