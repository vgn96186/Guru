#!/usr/bin/env node
/**
 * server.js - Guru Dev Launcher server.
 * Serves the launcher UI and runs dev commands via SSE.
 *
 * Usage: node scripts/launcher/server.js
 * Opens http://localhost:3100 in your browser.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { exec } = require('child_process');
const { Runner } = require('./runner');
const { waitForMetroReady, getMetroHealthSnapshot, isMetroRunning } = require('./metroHealth');
const { freeListeningPort } = require('./freePortKill');
const {
  resolveAdbCommand,
  isGuruDevClientInstalled,
  GURU_DEBUG_PACKAGE,
  resolvePrimaryAdbDevice,
} = require('../android-tooling');

/** Check whether critical node_modules patches are applied. */
function getPatchHealth() {
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'verify-patches.js'), '--json'],
      {
        timeout: 5000,
        encoding: 'utf8',
      },
    );
    if (result.status === 0) {
      return { ok: true, detail: 'All patches applied' };
    }
    try {
      const parsed = JSON.parse(result.stdout);
      const failed = parsed.results.filter((r) => !r.ok).map((r) => r.file);
      return { ok: false, detail: `Missing patches in: ${failed.join(', ')}` };
    } catch {
      return { ok: false, detail: (result.stderr || result.stdout || '').trim().slice(0, 200) };
    }
  } catch (err) {
    return { ok: false, detail: `Patch check error: ${err.message}` };
  }
}

// ── Pre-flight helpers (used by doctor/connect to fail fast with clear messages) ──

const DEBUG_APK_PATH = path.join(
  __dirname,
  '..',
  '..',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk',
);

/** Returns { ok, issues[] }. Each issue: { level: 'error'|'warning', message } */
function runPreflight(runner) {
  const issues = [];

  // 1. node_modules exists?
  const nmPath = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nmPath)) {
    issues.push({
      level: 'error',
      message: 'node_modules/ folder is missing. Run "npm install" first, then try again.',
    });
  }

  // 2. Patches applied?
  const patches = getPatchHealth();
  if (!patches.ok) {
    issues.push({
      level: 'error',
      message: `Patches not applied: ${patches.detail}. Run "npx patch-package" to fix.`,
    });
  }

  // 3. APK exists?
  const apkPath = process.env.GURU_DEV_APK || DEBUG_APK_PATH;
  if (!fs.existsSync(apkPath)) {
    issues.push({
      level: 'warning',
      message: `Debug APK not found at ${apkPath}. You will need to click "Build Debug APK" first.`,
    });
  } else {
    // 4. APK freshness — compare APK mtime vs latest source file change
    const staleness = checkApkStaleness(apkPath);
    if (staleness.stale) {
      issues.push({
        level: 'warning',
        message: staleness.message,
      });
    }
  }

  // 5. Device connected and authorized?
  try {
    const adbCmd = resolveAdbCommand();
    const devResult = spawnSync(adbCmd, ['devices'], {
      encoding: 'utf8',
      timeout: 8000,
      stdio: 'pipe',
    });
    if (devResult.error || devResult.status !== 0) {
      issues.push({
        level: 'error',
        message: 'ADB not working. Is Android SDK installed? Is the device plugged in via USB?',
      });
    } else {
      const lines = (devResult.stdout || '').split(/\r?\n/).filter(Boolean).slice(1);
      const devices = lines
        .map((l) => {
          const parts = l.trim().split(/\s+/);
          return { serial: parts[0], state: parts[1] };
        })
        .filter((d) => d.serial);

      if (devices.length === 0) {
        issues.push({
          level: 'error',
          message:
            'No Android device found. Plug in your tablet via USB and make sure USB debugging is enabled in Developer Options.',
        });
      } else {
        const unauthorized = devices.filter((d) => d.state === 'unauthorized');
        const offline = devices.filter((d) => d.state === 'offline');
        const ready = devices.filter((d) => d.state === 'device');

        if (unauthorized.length > 0 && ready.length === 0) {
          issues.push({
            level: 'error',
            message: `Device "${unauthorized[0].serial}" needs USB debugging authorization. Check your tablet screen for a popup asking "Allow USB debugging?" and tap Allow.`,
          });
        } else if (offline.length > 0 && ready.length === 0) {
          issues.push({
            level: 'error',
            message: `Device "${offline[0].serial}" is offline. Try unplugging and re-plugging the USB cable.`,
          });
        } else if (ready.length === 0) {
          issues.push({
            level: 'error',
            message: `Device found but not ready (state: ${devices[0].state}). Try unplugging and re-plugging.`,
          });
        }
      }
    }
  } catch {
    issues.push({
      level: 'warning',
      message: 'Could not check device status (ADB not in PATH?).',
    });
  }

  const hasError = issues.some((i) => i.level === 'error');
  return { ok: !hasError, issues };
}

/** Compare APK mtime vs source directory mtimes. Returns { stale, message } */
function checkApkStaleness(apkPath) {
  try {
    const apkStat = fs.statSync(apkPath);
    const apkTime = apkStat.mtimeMs;

    // Check key source directories that would require a rebuild
    const dirsToCheck = [path.join(ROOT, 'android', 'app', 'src'), path.join(ROOT, 'modules')];

    let newestSource = 0;
    let newestFile = '';

    for (const dir of dirsToCheck) {
      if (!fs.existsSync(dir)) continue;
      const newest = findNewestFile(dir, 3); // max depth 3
      if (newest.mtime > newestSource) {
        newestSource = newest.mtime;
        newestFile = newest.path;
      }
    }

    if (newestSource > apkTime) {
      const apkAge = Math.round((Date.now() - apkTime) / 60000);
      return {
        stale: true,
        message: `Debug APK is ${apkAge} min old but native source has changed since (${path.basename(
          newestFile || 'unknown',
        )}). You should rebuild with "Build Debug APK" to avoid crashes.`,
      };
    }

    return { stale: false };
  } catch {
    return { stale: false }; // Can't check, don't block
  }
}

/** Walk a directory (limited depth) and return { path, mtime } of the newest file. */
function findNewestFile(dir, maxDepth, _depth = 0) {
  let result = { path: '', mtime: 0 };
  if (_depth > maxDepth) return result;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'build' || entry.name === '.gradle' || entry.name === 'node_modules')
        continue;
      const sub = findNewestFile(full, maxDepth, _depth + 1);
      if (sub.mtime > result.mtime) result = sub;
    } else {
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs > result.mtime) {
          result = { path: full, mtime: stat.mtimeMs };
        }
      } catch {
        /* skip unreadable */
      }
    }
  }
  return result;
}

const DEFAULT_PORT = 3100;
const parsedPort = Number.parseInt(process.env.GURU_LAUNCHER_PORT || '', 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOT = path.join(__dirname, '..', '..');
const NPM_CMD = 'npm';
const START_METRO_SCRIPT = path.join(ROOT, 'scripts', 'start-metro-background.js');
const OPEN_DEV_CLIENT_SCRIPT = path.join(ROOT, 'scripts', 'open-android-dev-client.js');
/** Same Node binary as the launcher — avoids npm.cmd + shell on Windows hiding real exit codes. */
const NODE_BIN = process.execPath;

/** Shown in the browser and terminal so you can confirm this Node process matches your latest pull. */
const LAUNCHER_BUILD_ID =
  '2026-04-14 doctor-v10 (patch verification + adbCmd fix + connect/reload recovery + startup health checks)';

/** Wall-clock when this Node process loaded `server.js` — compare with the browser banner. */
const LAUNCHER_STARTED_AT_MS = Date.now();

const runner = new Runner();

let shuttingDown = false;

async function stopMetroInternal() {
  const managedStopped = runner.stopBackgroundTask('metro');
  if (managedStopped) {
    return true;
  }
  try {
    return await runner.run('Stop Metro', NODE_BIN, [path.join(ROOT, 'scripts', 'stop-metro.js')], {
      shell: false,
    });
  } catch {
    return false;
  }
}

function scheduleLauncherShutdown(reason = 'Launcher shutdown requested') {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  runner.log(`[launcher] ${reason}`, 'warning');
  setTimeout(() => {
    void stopMetroInternal().finally(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500);
    });
  }, 150);
}

function getLauncherInstanceInfo() {
  return {
    launcherBuildId: LAUNCHER_BUILD_ID,
    launcherPid: process.pid,
    launcherPort: PORT,
    launcherStartedAtMs: LAUNCHER_STARTED_AT_MS,
    nodeExecPath: process.execPath,
  };
}

async function getPublicStatus() {
  const metroHealth = await getMetroHealthSnapshot().catch(() => ({
    running: false,
    bundleCompletionCount: 0,
    latestBundleCompletionLine: '',
    hasFailure: false,
    latestFailureLine: '',
  }));
  const apkPath = process.env.GURU_DEV_APK || DEBUG_APK_PATH;
  const apkExists = fs.existsSync(apkPath);
  const staleness = apkExists ? checkApkStaleness(apkPath) : { stale: false };
  return {
    ...runner.getStatus(),
    ...getLauncherInstanceInfo(),
    metroHealth,
    patchHealth: getPatchHealth(),
    buildHealth: {
      apkExists,
      stale: staleness.stale || false,
      detail: !apkExists
        ? 'No debug APK found. Click "Build Debug APK" or run Doctor.'
        : staleness.stale
        ? staleness.message
        : 'APK is up to date.',
    },
  };
}

async function ensureMetroHealthy(taskPrefix) {
  // Don't require bundle completion — Metro only bundles when a client (the app)
  // requests one, which happens AFTER this check in the Doctor/Connect flow.
  const result = await waitForMetroReady({
    timeoutMs: 60_000,
    requireBundleCompletion: false,
    onLog: (message) => runner.log(`[metro] ${message}`, 'info'),
  });
  if (result.ok) {
    return true;
  }
  runner.log(`[${taskPrefix}] ${result.message}`, 'error');
  return false;
}

// NOTE: No bundle pre-warming. Metro in --dev-client mode only bundles when
// the Expo dev client app connects (WebSocket handshake). Plain HTTP bundle
// requests hang until an internal timeout. The app triggers bundling instantly
// when opened — just ensure Metro is running and open the app.

function normalizeUrlPath(pathname) {
  let p = String(pathname || '/').trim();
  if (!p.startsWith('/')) {
    p = `/${p}`;
  }
  if (p.length > 1) {
    p = p.replace(/\/+$/, '');
  }
  return p.toLowerCase();
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const headers = { 'Content-Type': mimeType };
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      headers.Pragma = 'no-cache';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

function openBrowser(url) {
  if (process.env.GURU_LAUNCHER_NO_OPEN === '1') {
    return;
  }

  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else if (process.platform === 'darwin') {
    exec(`open ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
}

function safePublicPath(urlPath) {
  const requestedPath = urlPath === '/' ? '/index.html' : urlPath;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    return path.join(PUBLIC_DIR, 'index.html');
  }
  return resolvedPath;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const body = [];

    req.on('data', (chunk) => body.push(chunk));
    req.on('end', () => {
      if (!body.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(body).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const SSE_KEEPALIVE_MS = 25_000;

function handleSSE(req, res) {
  if (req.socket && typeof req.socket.setTimeout === 'function') {
    req.socket.setTimeout(0);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.on('error', () => {
    /* ECONNRESET / ETIMEDOUT — avoid unhandled 'error' on ServerResponse */
  });

  let cleaned = false;
  let keepAlive = null;

  const detach = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }
    runner.removeListener('status', pushStatus);
    runner.removeListener('log', pushLog);
    runner.removeListener('done', pushDone);
  };

  function sseWrite(chunk) {
    if (cleaned || res.writableEnded) {
      return;
    }
    try {
      res.write(chunk);
    } catch {
      detach();
    }
  }

  const pushStatus = (status) => {
    sseWrite(
      `data: ${JSON.stringify({
        type: 'status',
        ...status,
        ...getLauncherInstanceInfo(),
      })}\n\n`,
    );
  };
  const pushLog = (entry) => {
    sseWrite(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`);
  };
  const pushDone = (result) => {
    sseWrite(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
  };

  void getPublicStatus().then((status) => pushStatus(status));

  runner.on('status', pushStatus);
  runner.on('log', pushLog);
  runner.on('done', pushDone);

  keepAlive = setInterval(() => {
    sseWrite(': keepalive\n\n');
  }, SSE_KEEPALIVE_MS);

  req.on('close', detach);
  req.on('aborted', detach);
}

function buildActions() {
  return {
    dev: {
      label: 'Run on Tablet',
      start: () => runner.run('Run on Tablet', NPM_CMD, ['run', 'android']),
    },
    'hot-reload': {
      label: 'Open Dev Client',
      start: () =>
        runner.run('Open Dev Client', NODE_BIN, [OPEN_DEV_CLIENT_SCRIPT], { shell: false }),
    },
    connect: {
      label: 'Connect Device',
      start: async () => {
        runner.log('═══════════════════════════════════════', 'info');
        runner.log('[connect] Pre-flight checks...', 'info');
        const preflight = runPreflight(runner);
        for (const issue of preflight.issues) {
          runner.log(
            `[connect] ${issue.level === 'error' ? '✖' : '⚠'} ${issue.message}`,
            issue.level === 'error' ? 'error' : 'warning',
          );
        }
        if (!preflight.ok) {
          runner.log(
            '[connect] Pre-flight failed — fix the errors above before continuing.',
            'error',
          );
          return false;
        }

        runner.log(
          '[connect] Starting one-click recovery: adb → device → install → Metro → reverse → open app.',
          'info',
        );

        const adbHealthy = await runner.runAdb('Connect: Check ADB', ['version']);
        if (!adbHealthy) {
          runner.log('[connect] ADB not healthy — continuing with recovery steps.', 'warning');
        }

        const installDev = await runner.run(
          'Connect: Install dev APK (adb only)',
          NODE_BIN,
          [path.join(ROOT, 'scripts', 'adb-install-dev-apk.js'), '--if-missing'],
          { shell: false },
        );
        if (!installDev) {
          runner.log(
            '[connect] Install step failed or APK missing on disk. Use Build Debug APK once if needed; continuing with remaining recovery steps.',
            'warning',
          );
        }

        // ── Metro: reuse if healthy, restart only if broken ──
        const connectMetroRunning = await isMetroRunning();
        let connectFreshStart = false;

        if (connectMetroRunning) {
          runner.log('[connect] Metro is already running on :8081 — skipping restart.', 'info');
        } else {
          runner.log(
            '[connect] Metro not responding — stopping stale processes and starting fresh.',
            'info',
          );

          await runner.run(
            'Connect: Stop Metro',
            NODE_BIN,
            [path.join(ROOT, 'scripts', 'stop-metro.js')],
            { shell: false },
          );

          const startMetro = await runner.run(
            'Connect: Start Metro',
            NODE_BIN,
            [START_METRO_SCRIPT, '--android'],
            { shell: false },
          );
          if (!startMetro) {
            runner.log('[connect] Start Metro had issues — continuing.', 'warning');
          } else if (!(await ensureMetroHealthy('connect'))) {
            return false;
          } else {
            connectFreshStart = true;
          }
        }

        const reverseOk = await runner.run(
          'Connect: Restore ADB Reverse',
          NODE_BIN,
          [path.join(ROOT, 'scripts', 'adb-reverse.js')],
          { shell: false },
        );
        if (!reverseOk) {
          runner.log('[connect] ADB reverse had issues — continuing.', 'warning');
        }

        let opened = await runner.run('Connect: Open App', NODE_BIN, [OPEN_DEV_CLIENT_SCRIPT], {
          shell: false,
        });
        if (!opened) {
          runner.log(
            '[connect] First open attempt failed — retrying with Metro restart.',
            'warning',
          );
          await runner.run(
            'Connect: Stop Metro (retry)',
            NODE_BIN,
            [path.join(ROOT, 'scripts', 'stop-metro.js')],
            {
              shell: false,
            },
          );
          await runner.run(
            'Connect: Start Metro (retry)',
            NODE_BIN,
            [START_METRO_SCRIPT, '--android'],
            { shell: false },
          );
          if (!(await ensureMetroHealthy('connect retry'))) {
            return false;
          }
          // App will trigger bundling on connect — no pre-warm needed.
          await runner.run(
            'Connect: Restore ADB Reverse (retry)',
            NODE_BIN,
            [path.join(ROOT, 'scripts', 'adb-reverse.js')],
            { shell: false },
          );
          opened = await runner.run(
            'Connect: Open App (retry)',
            NODE_BIN,
            [OPEN_DEV_CLIENT_SCRIPT],
            {
              shell: false,
            },
          );
        }
        if (!opened) {
          runner.log('[connect] Open app failed after recovery attempts — see log above.', 'error');
          return false;
        }

        runner.log('[connect] Device connection flow completed.', 'success');
        return true;
      },
    },
    reload: {
      label: 'Reload App',
      start: async () => {
        let ok = await runner.run('Reload App', NODE_BIN, [OPEN_DEV_CLIENT_SCRIPT, '--reload'], {
          shell: false,
        });
        if (ok) return true;

        runner.log('[reload] Reload failed — retrying with Metro recovery.', 'warning');
        await runner.run(
          'Reload: Stop Metro',
          NODE_BIN,
          [path.join(ROOT, 'scripts', 'stop-metro.js')],
          {
            shell: false,
          },
        );
        await runner.run('Reload: Start Metro', NODE_BIN, [START_METRO_SCRIPT], {
          shell: false,
        });
        await runner.run(
          'Reload: Restore ADB Reverse',
          NODE_BIN,
          [path.join(ROOT, 'scripts', 'adb-reverse.js')],
          {
            shell: false,
          },
        );
        ok = await runner.run(
          'Reload App (retry)',
          NODE_BIN,
          [OPEN_DEV_CLIENT_SCRIPT, '--reload'],
          {
            shell: false,
          },
        );
        return ok;
      },
    },
    quit: {
      label: 'Quit Launcher',
      start: async () => {
        scheduleLauncherShutdown('Quit requested from launcher UI.');
        return true;
      },
    },
    doctor: {
      label: 'Auto Fix / Doctor',
      start: async () => {
        // ── Pre-flight checks: fail fast with clear messages ──
        runner.log('═══════════════════════════════════════', 'info');
        runner.log('[doctor] Pre-flight checks...', 'info');
        const preflight = runPreflight(runner);
        for (const issue of preflight.issues) {
          runner.log(
            `[doctor] ${issue.level === 'error' ? '✖' : '⚠'} ${issue.message}`,
            issue.level === 'error' ? 'error' : 'warning',
          );
        }

        if (!preflight.ok) {
          runner.log(
            '[doctor] Pre-flight failed — fix the errors above before continuing.',
            'error',
          );
          return false;
        }

        if (preflight.issues.length === 0) {
          runner.log('[doctor] All pre-flight checks passed.', 'success');
        }

        // ── Check if APK needs rebuild (stale native code) ──
        const apkPath = process.env.GURU_DEV_APK || DEBUG_APK_PATH;
        const apkExists = fs.existsSync(apkPath);
        const apkStale = apkExists ? checkApkStaleness(apkPath) : { stale: false };
        let needsBuild = !apkExists;

        if (apkStale.stale) {
          runner.log(`[doctor] ${apkStale.message}`, 'warning');
          runner.log(
            '[doctor] Auto-rebuilding debug APK to include latest native changes...',
            'info',
          );
          needsBuild = true;
        }

        if (needsBuild) {
          if (!apkExists) {
            runner.log(
              '[doctor] No debug APK found — building one now (this takes a few minutes the first time)...',
              'info',
            );
          }
          const buildOk = await runner.run('Doctor: Build Debug APK', NPM_CMD, [
            'run',
            'android:apk:device',
          ]);
          if (!buildOk) {
            runner.log('[doctor] APK build failed. Check the log above for errors.', 'error');
            return false;
          }
          runner.log('[doctor] APK build complete.', 'success');
        }

        runner.log(
          '[doctor] Starting full setup: ADB → install dev APK → Metro → reverse → open app.',
          'info',
        );

        const adbHealthy = await runner.runAdb('Doctor: Check ADB', ['version']);
        if (!adbHealthy) {
          runner.log('[doctor] ADB not healthy — trying to continue anyway.', 'warning');
        }

        const installDev = await runner.run(
          'Doctor: Install dev APK (adb only)',
          NODE_BIN,
          [path.join(ROOT, 'scripts', 'adb-install-dev-apk.js'), '--if-missing'],
          { shell: false },
        );
        if (!installDev) {
          runner.log(
            '[doctor] Install step failed. Check if the tablet has enough storage space and that USB debugging is authorized.',
            'error',
          );
        } else {
          // Post-install verification: confirm the package is actually on the device
          const earlyAdbCmd = resolveAdbCommand();
          const earlyPicked = resolvePrimaryAdbDevice(earlyAdbCmd);
          if (earlyPicked && !('error' in earlyPicked && earlyPicked.error)) {
            if (!isGuruDevClientInstalled(earlyAdbCmd, earlyPicked.serial)) {
              runner.log(
                '[doctor] ⚠ APK install command succeeded but the app is not showing on the device. This can happen if the device was busy. Trying a forced install...',
                'warning',
              );
              await runner.run(
                'Doctor: Forced install',
                NODE_BIN,
                [path.join(ROOT, 'scripts', 'adb-install-dev-apk.js')],
                { shell: false },
              );
            }
          }
        }

        // ── Metro: reuse if healthy, restart only if broken ──
        const metroAlreadyRunning = await isMetroRunning();
        let metroFreshStart = false;

        if (metroAlreadyRunning) {
          runner.log('[doctor] Metro is already running on :8081 — skipping restart.', 'info');
        } else {
          runner.log(
            '[doctor] Metro not responding — stopping stale processes and starting fresh.',
            'info',
          );

          await runner.run(
            'Doctor: Stop Metro',
            NODE_BIN,
            [path.join(ROOT, 'scripts', 'stop-metro.js')],
            { shell: false },
          );

          const startMetro = await runner.run(
            'Doctor: Start Metro',
            NODE_BIN,
            [START_METRO_SCRIPT, '--android'],
            { shell: false },
          );
          if (!startMetro) {
            runner.log(
              '[doctor] Metro failed to start. Common causes: port 8081 is still in use, node_modules corrupted, or a syntax error in your code. Try "Stop Metro" then "Connect Tablet" again.',
              'error',
            );
            return false;
          } else if (!(await ensureMetroHealthy('doctor'))) {
            runner.log(
              '[doctor] Metro started but is not responding on port 8081. Try "Stop Metro" then "Connect Tablet" again.',
              'error',
            );
            return false;
          } else {
            metroFreshStart = true;
          }
        }

        const reverseOk = await runner.run(
          'Doctor: Restore ADB Reverse',
          NODE_BIN,
          [path.join(ROOT, 'scripts', 'adb-reverse.js')],
          { shell: false },
        );
        if (!reverseOk) {
          runner.log('[doctor] ADB reverse had issues — continuing.', 'warning');
        }

        const adbCmd = resolveAdbCommand();
        const picked = resolvePrimaryAdbDevice(adbCmd);
        if (picked && 'error' in picked && picked.error) {
          runner.log(`[doctor] ${picked.error}`, 'error');
        } else if (picked && picked.readyCount > 1 && !process.env.GURU_ANDROID_SERIAL?.trim()) {
          runner.log(
            `[doctor] Multiple adb devices (${picked.readyCount}); using ${picked.serial}. Set env GURU_ANDROID_SERIAL to the tablet serial if this is the wrong one.`,
            'warning',
          );
        }

        let canOpen =
          installDev &&
          picked &&
          !('error' in picked && picked.error) &&
          isGuruDevClientInstalled(adbCmd, picked.serial);

        if (installDev && picked && !('error' in picked && picked.error) && !canOpen) {
          runner.log(
            '[doctor] Dev client not on the adb target device (e.g. another device had it, or install was skipped) — running adb install -r once.',
            'warning',
          );
          const forced = await runner.run(
            'Doctor: Install dev APK (forced)',
            NODE_BIN,
            [path.join(ROOT, 'scripts', 'adb-install-dev-apk.js')],
            { shell: false },
          );
          canOpen = Boolean(forced) && isGuruDevClientInstalled(adbCmd, picked.serial);
          if (installDev && forced && !canOpen) {
            runner.log(
              '[doctor] Forced install finished but the dev package is still missing on the target device. Check GURU_ANDROID_SERIAL if multiple devices are connected.',
              'error',
            );
          }
        }

        if (picked && 'error' in picked && picked.error) {
          canOpen = false;
        }

        let openClient = false;
        if (!installDev) {
          openClient = false;
        } else if (picked && 'error' in picked && picked.error) {
          runner.log(
            '[doctor] Skipping Open Dev Client — fix GURU_ANDROID_SERIAL or unplug extra devices.',
            'error',
          );
        } else if (!canOpen) {
          runner.log(
            '[doctor] Skipping Open Dev Client — dev package not on the target device. Build or copy app-debug.apk, set GURU_DEV_APK if needed, or GURU_ANDROID_SERIAL when several devices are plugged in.',
            'error',
          );
        } else {
          const opened = await runner.run(
            'Doctor: Open Dev Client',
            NODE_BIN,
            [OPEN_DEV_CLIENT_SCRIPT],
            { shell: false },
          );
          openClient = Boolean(opened);
          if (!opened) {
            runner.log('[doctor] Open Dev Client failed — check log above.', 'warning');
          }
        }

        if (installDev && openClient) {
          runner.log('[doctor] All steps succeeded (install + Metro + reverse + open).', 'success');
        } else if (installDev && !openClient) {
          runner.log(
            '[doctor] Recovery sequence complete (Metro/reverse ran; open did not succeed — see log above).',
            'warning',
          );
        }
        return installDev && openClient;
      },
    },
    'start-metro': {
      label: 'Metro Bundler',
      start: () =>
        runner.startBackgroundTask('metro', 'Metro Bundler', NPM_CMD, ['run', 'android:metro']),
    },
    'stop-metro': {
      label: 'Stop Metro',
      start: async () => {
        const managedStopped = runner.stopBackgroundTask('metro');

        if (managedStopped) {
          runner.log('[info] Managed Metro process stop requested.', 'info');
          return true;
        }

        return runner.run('Stop Metro', NODE_BIN, [path.join(ROOT, 'scripts', 'stop-metro.js')], {
          shell: false,
        });
      },
    },
    'build-debug': {
      label: 'Build Debug APK',
      start: () => runner.run('Build Debug APK', NPM_CMD, ['run', 'android:apk:device']),
    },
    'build-release': {
      label: 'Build Release APK',
      start: () => runner.run('Build Release APK', NPM_CMD, ['run', 'android:apk:release:device']),
    },
    'adb-install-dev': {
      label: 'Install dev APK (adb only)',
      start: () =>
        runner.run(
          'Install dev APK',
          NODE_BIN,
          [path.join(ROOT, 'scripts', 'adb-install-dev-apk.js')],
          {
            shell: false,
          },
        ),
    },
    'adb-devices': {
      label: 'ADB Devices',
      start: () => runner.runAdb('ADB Devices', ['devices', '-l']),
    },
    'adb-restart-app': {
      label: 'Restart App',
      start: async () => {
        const appPackage = 'com.anonymous.gurustudy.dev';
        const stopped = await runner.runAdb('Force Stop App', [
          'shell',
          'am',
          'force-stop',
          appPackage,
        ]);
        if (!stopped) {
          return false;
        }

        return runner.runAdb('Launch App', [
          'shell',
          'monkey',
          '-p',
          appPackage,
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ]);
      },
    },
    'adb-screenshot': {
      label: 'Take Screenshot',
      start: () => {
        const screenshotPath = path.join(ROOT, 'device-screen.png');
        return runner
          .run(
            'Take Screenshot',
            NODE_BIN,
            [path.join(ROOT, 'scripts', 'adb-screenshot.js'), screenshotPath],
            { shell: false },
          )
          .then((ok) => {
            if (ok) {
              runner.log(`[ok] Screenshot saved → ${screenshotPath}`, 'success');
            }
            return ok;
          });
      },
    },
    'adb-logcat': {
      label: 'Android Logs',
      start: () =>
        runner.runAdb('Android Logs', [
          'logcat',
          '-d',
          '-t',
          '200',
          '*:S',
          'ReactNative:V',
          'ReactNativeJS:V',
          'AndroidRuntime:E',
        ]),
    },
    'create-shortcut': {
      label: 'Create Desktop Shortcut',
      start: () =>
        runner.run('Create Desktop Shortcut', 'node', [
          path.join(ROOT, 'scripts', 'create-desktop-shortcut.js'),
        ]),
    },
  };
}

async function handleAPI(req, res, url) {
  const apiPath = normalizeUrlPath(url.pathname);

  if (req.method === 'GET' && apiPath === '/api/version') {
    sendJson(res, 200, getLauncherInstanceInfo());
    return;
  }

  if (req.method === 'GET' && apiPath === '/api/status') {
    sendJson(res, 200, await getPublicStatus());
    return;
  }

  if (req.method === 'GET' && apiPath === '/api/logs') {
    // Stream ADB logcat output
    const { spawn } = require('child_process');
    const { resolveAdbCommand } = require('../android-tooling');

    // Get query parameters
    const level = url.searchParams.get('level') || 'V';
    const packageName = url.searchParams.get('package') || GURU_DEBUG_PACKAGE;
    const follow = url.searchParams.get('follow') !== 'false'; // default true

    const validLevels = ['V', 'D', 'I', 'W', 'E', 'S'];
    if (!validLevels.includes(level)) {
      sendJson(res, 400, {
        error: `Invalid level: ${level}. Must be one of ${validLevels.join(', ')}`,
      });
      return;
    }

    // Check if ADB is available
    let adbCmd;
    try {
      adbCmd = resolveAdbCommand();
    } catch (error) {
      sendJson(res, 500, { error: 'ADB not available. Make sure Android SDK is installed.' });
      return;
    }

    // Set up streaming response
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Construct logcat command
    const logcatArgs = ['logcat'];
    if (!follow) {
      logcatArgs.push('-d'); // dump and exit
    }
    logcatArgs.push(`${packageName}:${level}`, `ReactNativeJS:${level}`, '*:S');

    const logcat = spawn(adbCmd, logcatArgs);

    // Pipe output to response
    logcat.stdout.on('data', (chunk) => {
      res.write(chunk);
    });

    logcat.stderr.on('data', (chunk) => {
      res.write(chunk);
    });

    logcat.on('close', (code) => {
      res.end(`\n[logcat process exited with code ${code}]\n`);
    });

    logcat.on('error', (err) => {
      res.write(`[logcat error: ${err.message}]\n`);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      if (!logcat.killed) {
        logcat.kill('SIGINT');
      }
    });

    return;
  }

  if (req.method === 'POST' && apiPath === '/api/run') {
    let data = {};

    try {
      data = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON request body.' });
      return;
    }

    const actions = buildActions();
    const action = data.action;
    const definition = actions[action];

    if (!definition) {
      sendJson(res, 400, { error: `Unknown action: ${action}` });
      return;
    }

    if (runner.isBusy()) {
      sendJson(res, 409, {
        error: 'Another launcher task is already running.',
        status: await getPublicStatus(),
      });
      return;
    }

    const preflightError = definition.preflight?.();
    if (preflightError) {
      sendJson(res, 409, { error: preflightError, status: await getPublicStatus() });
      return;
    }

    try {
      const result = definition.start();
      Promise.resolve(result).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        runner.log(`[error] ${definition.label}: ${message}`, 'error');
      });

      sendJson(res, 200, {
        started: true,
        action,
        label: definition.label,
        status: await getPublicStatus(),
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: message, status: await getPublicStatus() });
      return;
    }
  }

  if (req.method === 'POST' && apiPath === '/api/quit') {
    sendJson(res, 200, {
      ok: true,
      message: 'Launcher shutdown started.',
      status: await getPublicStatus(),
    });
    scheduleLauncherShutdown('Quit requested via /api/quit.');
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathKey = normalizeUrlPath(requestUrl.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && pathKey === '/guru-launcher-version.json') {
    sendJson(res, 200, getLauncherInstanceInfo());
    return;
  }

  if (
    pathKey === '/events' &&
    typeof req.headers.accept === 'string' &&
    req.headers.accept.includes('text/event-stream')
  ) {
    handleSSE(req, res);
    return;
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    handleAPI(req, res, requestUrl);
    return;
  }

  let filePath = safePublicPath(requestUrl.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  serveStatic(res, filePath);
});

if (typeof server.requestTimeout === 'number') {
  server.requestTimeout = 0;
}

let listenAttempts = 0;
const MAX_LISTEN_ATTEMPTS = 3;

// Auto-restart launcher on file changes (delayed to avoid startup conflicts)
const watchedLauncherFiles = [
  __filename,
  path.join(__dirname, 'runner.js'),
  path.join(__dirname, '..', 'open-android-dev-client.js'),
];

let restartTimer = null;
let isRestarting = false;

function startFileWatcher() {
  watchedLauncherFiles.forEach((file) => {
    try {
      if (fs.existsSync(file)) {
        fs.watch(file, { persistent: false }, (eventType) => {
          if (isRestarting) return;
          isRestarting = true;

          if (restartTimer) clearTimeout(restartTimer);
          restartTimer = setTimeout(() => {
            runner.log(`[launcher] File changed: ${path.basename(file)}. Restarting...`, 'info');
            console.log(`\n[launcher] Restarting due to file change...`);

            let didRestart = false;
            const doRestart = () => {
              if (didRestart) return;
              didRestart = true;
              setTimeout(() => {
                const child = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
                  stdio: 'ignore',
                  detached: true,
                  env: { ...process.env, GURU_LAUNCHER_NO_KILL_PORT: '1' },
                });
                child.unref();
                process.exit(0);
              }, 500);
            };

            server.close(doRestart);
            setTimeout(doRestart, 1500);
          }, 1500);
        });
      }
    } catch {}
  });
  runner.log('[launcher] File watcher active. Auto-restarts on code changes.', 'info');
}

// Clean up Metro on launcher exit
process.on('SIGINT', () => {
  runner.log('[launcher] Shutting down, stopping Metro...', 'info');
  stopMetroInternal().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  runner.log('[launcher] Shutting down, stopping Metro...', 'info');
  stopMetroInternal().finally(() => process.exit(0));
});

function onListening() {
  const url = `http://localhost:${PORT}`;
  console.log(`Guru Dev Launcher running at ${url}`);
  console.log(`[launcher] ${LAUNCHER_BUILD_ID}`);
  runner.log(`[launcher] Server ready — ${LAUNCHER_BUILD_ID}.`, 'info');

  startFileWatcher();
  setTimeout(() => openBrowser(url), 1500);
}

function beginListen() {
  server.listen(PORT, onListening);
}

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE' && listenAttempts < MAX_LISTEN_ATTEMPTS) {
    listenAttempts += 1;
    console.warn(
      `[launcher] Port ${PORT} in use — reclaiming (attempt ${listenAttempts}/${MAX_LISTEN_ATTEMPTS})...`,
    );
    freeListeningPort(PORT);
    setTimeout(beginListen, 500);
    return;
  }

  if (error && error.code === 'EADDRINUSE') {
    console.error(
      `[launcher] Port ${PORT} still busy. Try GURU_LAUNCHER_PORT=3101 or close the other process.`,
    );
    process.exit(1);
    return;
  }

  console.error(error);
  process.exit(1);
});

const reclaim = freeListeningPort(PORT);
console.log(
  `[launcher] Port ${PORT} reclaim: ${
    reclaim.reclaimed ? 'cleared previous listener(s)' : reclaim.detail || 'ok'
  }`,
);
beginListen();
