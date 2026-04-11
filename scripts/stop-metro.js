#!/usr/bin/env node
/**
 * stop-metro.js — Surgical Metro/Expo process killer for Guru only.
 * Only kills Metro processes running from the Guru project directory.
 * Will NOT touch other AI CLIs, other Expo projects, or unrelated Node processes.
 *
 * Works on Windows, Mac, and Linux.
 *
 * Replaces: scripts/stop-metro.sh
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const METRO_PORT = 8081;

function isWindows() {
  return process.platform === 'win32';
}

/**
 * Kill ONLY Metro processes that are running from the Guru project directory.
 * Uses the project path as a unique identifier so no other processes are affected.
 */
function killGuruMetro() {
  const projectPath = ROOT;

  if (isWindows()) {
    try {
      // Use wmic to find node/npx processes whose command line contains the Guru project path
      const escapedPath = projectPath.replace(/\\/g, '\\\\\\\\');
      const wmic = spawnSync(
        'wmic',
        [
          'process',
          'where',
          `CommandLine like '%${METRO_PORT}%' and (CommandLine like '%expo%' or CommandLine like '%npx%')`,
          'get',
          'ProcessId,CommandLine',
        ],
        { encoding: 'utf8', shell: true },
      );

      if (wmic.stdout) {
        const lines = wmic.stdout.split('\n').slice(1);
        for (const line of lines) {
          // Only kill if the command line contains the Guru project path
          if (line.includes(projectPath) || line.includes(ROOT.split('\\').pop())) {
            const pidMatch = line.match(/(\d+)\s+/);
            if (pidMatch) {
              const pid = pidMatch[1];
              try {
                execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
                console.log(`  Killed PID ${pid}`);
              } catch {
                // Process already gone
              }
            }
          }
        }
      }
    } catch {
      // wmic might not be available
    }

    // Fallback: Also check netstat for port 8081 and verify the process is node/npx
    try {
      const netstat = execSync(`netstat -ano | findstr :${METRO_PORT}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      const pids = new Set();
      for (const line of netstat.split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          pids.add(pid);
        }
      }

      for (const pid of pids) {
        // Verify this is a node/npx process before killing
        try {
          const wmic = execSync(`wmic process where ProcessId=${pid} get Name,CommandLine`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          });

          if (wmic.includes('node') || wmic.includes('npx')) {
            if (wmic.includes(ROOT) || wmic.includes('guru') || wmic.includes('neet_study')) {
              execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
              console.log(`  Killed PID ${pid} (port ${METRO_PORT})`);
            }
          }
        } catch {
          // Can't verify process, skip
        }
      }
    } catch {
      // No processes on port
    }
  } else {
    // Unix/macOS: Use lsof + ps to find and kill only Guru Metro processes
    try {
      const lsof = execSync(`lsof -tiTCP:${METRO_PORT} -sTCP:LISTEN 2>/dev/null || true`, {
        encoding: 'utf8',
        shell: true,
      });

      const pids = lsof
        .trim()
        .split('\n')
        .filter((p) => p && /^\d+$/.test(p));
      for (const pid of pids) {
        // Verify this is running from the Guru directory
        try {
          const psOutput = execSync(`ps -p ${pid} -o command=`, {
            encoding: 'utf8',
          });

          if (psOutput.includes(projectPath)) {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            console.log(`  Killed PID ${pid} (port ${METRO_PORT})`);
          }
        } catch {
          // Process already gone
        }
      }
    } catch {
      // lsof not available or no processes
    }

    // Also try pkill with the specific project path
    try {
      execSync(`pkill -f "cd ${projectPath}.*expo" 2>/dev/null || true`, {
        shell: true,
        stdio: 'ignore',
      });
    } catch {
      // No matching processes
    }
  }
}

async function main() {
  console.log('Stopping Metro processes for Guru only...');

  let killedCount = 0;
  const before = getMetroProcessCount();
  killGuruMetro();
  const after = getMetroProcessCount();
  killedCount = before - after;

  console.log(`Stopped ${killedCount} Metro process(es) for Guru.`);
  if (killedCount === 0) {
    console.log('No Guru Metro processes were running.');
  }
}

function getMetroProcessCount() {
  // Count node/npx processes that appear to be Metro (listening on 8081 or have expo in command)
  if (isWindows()) {
    try {
      const result = spawnSync(
        'wmic',
        [
          'process',
          'where',
          "CommandLine like '%expo%' or CommandLine like '%Metro%'",
          'get',
          'CommandLine',
        ],
        { encoding: 'utf8', shell: true },
      );

      if (!result.stdout) return 0;
      return result.stdout.split('\n').filter((l) => l.includes('expo') || l.includes('Metro'))
        .length;
    } catch {
      return 0;
    }
  } else {
    try {
      const result = execSync("ps aux | grep -i 'expo\\|metro' | grep -v grep | wc -l", {
        encoding: 'utf8',
        shell: true,
      });
      return parseInt(result.trim()) || 0;
    } catch {
      return 0;
    }
  }
}

main().catch((error) => {
  console.error('Error stopping Metro:', error.message);
  process.exit(1);
});
