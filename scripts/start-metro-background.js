#!/usr/bin/env node
/**
 * start-metro-background.js — Kill port 8081, start Metro detached.
 * No wmic. No PowerShell. No stop-metro.js dependency.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LOG_PATH = path.join(ROOT, 'metro-dev.log');
const ERR_PATH = path.join(ROOT, 'metro-dev.err.log');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const CMD_TIMEOUT = 8_000;

function killPort8081() {
  if (process.platform !== 'win32') {
    try {
      const raw = execSync('lsof -tiTCP:8081 -sTCP:LISTEN 2>/dev/null || true', {
        encoding: 'utf8',
        shell: true,
        timeout: CMD_TIMEOUT,
      });
      for (const pid of raw.trim().split(/\s+/).filter(Boolean)) {
        try { execSync(`kill -9 ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT }); } catch {}
      }
    } catch {}
    return;
  }

  try {
    const raw = execSync('netstat -ano', {
      encoding: 'utf8',
      timeout: CMD_TIMEOUT,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of raw.split(/\r?\n/)) {
      if (line.includes(':8081') && /LISTENING/i.test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid) && pid !== '0') {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
            console.log(`[metro-bg] Killed old process on port 8081 (PID ${pid}).`);
          } catch {}
        }
      }
    }
  } catch {}
}

function main() {
  const stamp = new Date().toISOString();
  const banner = `\n===== ${stamp} metro start =====\n`;
  fs.appendFileSync(LOG_PATH, banner);
  fs.appendFileSync(ERR_PATH, banner);

  killPort8081();

  const outFd = fs.openSync(LOG_PATH, 'a');
  const errFd = fs.openSync(ERR_PATH, 'a');

  const child = spawn(NPM_CMD, ['run', 'android:metro'], {
    cwd: ROOT,
    detached: true,
    shell: true,
    stdio: ['ignore', outFd, errFd],
    env: { ...process.env, NODE_ENV: 'development' },
  });

  child.unref();
  fs.closeSync(outFd);
  fs.closeSync(errFd);

  console.log(`[metro-bg] Started Metro in background${child.pid ? ` (pid ${child.pid})` : ''}.`);
  console.log(`[metro-bg] Logs: ${path.basename(LOG_PATH)}, ${path.basename(ERR_PATH)}`);
}

main();
