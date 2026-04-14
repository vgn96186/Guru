#!/usr/bin/env node
/**
 * stop-metro.js — Kill whatever is listening on port 8081.
 * Uses /T (tree-kill) so the entire process tree (cmd → npm → node → Metro)
 * is terminated, preventing orphaned Metro processes.
 * Verifies the port is actually free before exiting.
 */

const { execSync } = require('child_process');

const METRO_PORT = 8081;
const CMD_TIMEOUT = 8_000;
const MAX_VERIFY_ATTEMPTS = 10;
const VERIFY_DELAY_MS = 500;

function findPidsOnPort(port) {
  try {
    const raw = execSync('netstat -ano', {
      encoding: 'utf8',
      timeout: CMD_TIMEOUT,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of raw.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && /LISTENING/i.test(line)) {
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

function killPid(pid) {
  // /T = tree kill (entire process tree), /F = force
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
    console.log(`  Killed PID ${pid} (tree).`);
    return true;
  } catch {
    // Tree kill may fail if process already exited — try direct kill as fallback
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
      console.log(`  Killed PID ${pid} (direct).`);
      return true;
    } catch {
      return false;
    }
  }
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

function main() {
  console.log('Stopping Metro processes on port 8081...');
  let pids = findPidsOnPort(METRO_PORT);

  if (!pids.length) {
    console.log('No processes found on port 8081.');
    return;
  }

  let killed = 0;
  for (const pid of pids) {
    if (killPid(pid)) killed++;
  }
  console.log(`Stopped ${killed} process(es).`);

  // Verify the port is actually free — stale processes sometimes linger.
  for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
    sleepMs(VERIFY_DELAY_MS);
    pids = findPidsOnPort(METRO_PORT);
    if (!pids.length) {
      console.log('Port 8081 is free.');
      return;
    }
    console.log(
      `  Port still busy (attempt ${attempt + 1}/${MAX_VERIFY_ATTEMPTS}) — killing again...`,
    );
    for (const pid of pids) {
      killPid(pid);
    }
  }

  // Last resort: warn but don't fail
  console.warn('Warning: port 8081 may still have a lingering process after all kill attempts.');
}

main();
