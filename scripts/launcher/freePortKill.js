/**
 * Kill whatever is listening on `port` so Guru Launcher can bind a fresh server.
 * Windows: PowerShell Get-NetTCPConnection. Unix: lsof + SIGKILL.
 *
 * Opt out: GURU_LAUNCHER_NO_KILL_PORT=1
 */

const { spawnSync } = require('child_process');

function sleepMs(ms) {
  if (process.platform === 'win32') {
    spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`],
      { stdio: 'pipe', timeout: 30_000, windowsHide: true },
    );
  } else {
    spawnSync('sleep', [String(Math.max(1, Math.ceil(ms / 1000)))], { stdio: 'pipe' });
  }
}

/**
 * @param {number} port
 * @returns {{ reclaimed: boolean, detail?: string }}
 */
function freeListeningPort(port) {
  if (process.env.GURU_LAUNCHER_NO_KILL_PORT === '1') {
    return { reclaimed: false, detail: 'skipped (GURU_LAUNCHER_NO_KILL_PORT=1)' };
  }

  if (process.platform === 'win32') {
    const ps = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; ` +
        'if (-not $c) { exit 2 }; ' +
        '$c | Select-Object -ExpandProperty OwningProcess -Unique | ' +
        'Where-Object { $_ -gt 0 } | ' +
        'ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; ' +
        'exit 0',
    ];
    const r = spawnSync('powershell', ps, {
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    sleepMs(400);
    if (r.error) {
      return { reclaimed: false, detail: r.error.message };
    }
    if (r.status === 2) {
      return { reclaimed: false, detail: 'port was free' };
    }
    return { reclaimed: true, detail: 'Windows: stopped listener process(es) on this port' };
  }

  const r = spawnSync('lsof', [`-ti:${port}`], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = (r.stdout || '').trim();
  if (!stdout) {
    return { reclaimed: false, detail: 'port was free' };
  }
  const pids = [...new Set(stdout.split(/\s+/).map((s) => Number(s)).filter((n) => n > 0))];
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (_) {
      /* ignore */
    }
  }
  sleepMs(400);
  return { reclaimed: pids.length > 0, detail: pids.length ? `killed pids ${pids.join(',')}` : 'none' };
}

module.exports = { freeListeningPort };
