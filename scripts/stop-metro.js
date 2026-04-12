#!/usr/bin/env node
/**
 * stop-metro.js — Kill whatever is listening on port 8081.
 * No wmic. No PowerShell. Just netstat + taskkill with hard timeouts.
 */

const { execSync } = require('child_process');

const METRO_PORT = 8081;
const CMD_TIMEOUT = 8_000;

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
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: CMD_TIMEOUT });
    console.log(`  Killed PID ${pid}`);
    return true;
  } catch {
    return false;
  }
}

function main() {
  console.log('Stopping Metro processes on port 8081...');
  const pids = findPidsOnPort(METRO_PORT);

  if (!pids.length) {
    console.log('No processes found on port 8081.');
    return;
  }

  let killed = 0;
  for (const pid of pids) {
    if (killPid(pid)) killed++;
  }
  console.log(`Stopped ${killed} process(es).`);
}

main();
