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
const { exec } = require('child_process');
const { Runner } = require('./runner');
const { freeListeningPort } = require('./freePortKill');
const {
  resolveAdbCommand,
  isAndroidPackageInstalled,
  GURU_DEBUG_PACKAGE,
  resolvePrimaryAdbDevice,
} = require('../android-tooling');

const DEFAULT_PORT = 3100;
const parsedPort = Number.parseInt(process.env.GURU_LAUNCHER_PORT || '', 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOT = path.join(__dirname, '..', '..');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const START_METRO_SCRIPT = path.join(ROOT, 'scripts', 'start-metro-background.js');
const OPEN_DEV_CLIENT_SCRIPT = path.join(ROOT, 'scripts', 'open-android-dev-client.js');
/** Same Node binary as the launcher — avoids npm.cmd + shell on Windows hiding real exit codes. */
const NODE_BIN = process.execPath;

/** Shown in the browser and terminal so you can confirm this Node process matches your latest pull. */
const LAUNCHER_BUILD_ID =
  '2026-04-12 doctor-v8 (version URL + path normalize; /guru-launcher-version.json alias)';

/** Wall-clock when this Node process loaded `server.js` — compare with the browser banner. */
const LAUNCHER_STARTED_AT_MS = Date.now();

const runner = new Runner();

function getLauncherInstanceInfo() {
  return {
    launcherBuildId: LAUNCHER_BUILD_ID,
    launcherPid: process.pid,
    launcherPort: PORT,
    launcherStartedAtMs: LAUNCHER_STARTED_AT_MS,
    nodeExecPath: process.execPath,
  };
}

function getPublicStatus() {
  return { ...runner.getStatus(), ...getLauncherInstanceInfo() };
}

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

  pushStatus(runner.getStatus());

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
    doctor: {
      label: 'Auto Fix / Doctor',
      start: async () => {
        runner.log(
          '[doctor] Automated setup: adb → install dev APK if missing → Metro → reverse → open dev client.',
          'info',
        );

        const adbHealthy = await runner.runAdb('Doctor: Check ADB', ['version']);
        if (!adbHealthy) {
          runner.log('[doctor] ADB not healthy — trying to continue anyway.', 'warning');
        }

        const installDev = await runner.run('Doctor: Install dev APK (adb only)', NODE_BIN, [
          path.join(ROOT, 'scripts', 'adb-install-dev-apk.js'),
          '--if-missing',
        ], { shell: false });
        if (!installDev) {
          runner.log(
            '[doctor] Install step failed (no app-debug.apk on disk, or adb install error). Use Launcher → Build Debug APK once, then run Doctor again. Skipping Open Dev Client.',
            'error',
          );
        }

        const stopMetro = await runner.run('Doctor: Stop Metro', NODE_BIN, [
          path.join(ROOT, 'scripts', 'stop-metro.js'),
        ], { shell: false });
        if (!stopMetro) {
          runner.log('[doctor] Stop Metro had issues — continuing.', 'warning');
        }

        const startMetro = await runner.run('Doctor: Start Metro', NODE_BIN, [START_METRO_SCRIPT], {
          shell: false,
        });
        if (!startMetro) {
          runner.log('[doctor] Start Metro had issues — continuing.', 'warning');
        }

        const reverseOk = await runner.run('Doctor: Restore ADB Reverse', NODE_BIN, [
          path.join(ROOT, 'scripts', 'adb-reverse.js'),
        ], { shell: false });
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
          isAndroidPackageInstalled(adbCmd, picked.serial, GURU_DEBUG_PACKAGE);

        if (
          installDev &&
          picked &&
          !('error' in picked && picked.error) &&
          !canOpen
        ) {
          runner.log(
            '[doctor] Dev client not on the adb target device (e.g. another device had it, or install was skipped) — running adb install -r once.',
            'warning',
          );
          const forced = await runner.run('Doctor: Install dev APK (forced)', NODE_BIN, [
            path.join(ROOT, 'scripts', 'adb-install-dev-apk.js'),
          ], { shell: false });
          canOpen =
            Boolean(forced) &&
            isAndroidPackageInstalled(adbCmd, picked.serial, GURU_DEBUG_PACKAGE);
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
          const opened = await runner.run('Doctor: Open Dev Client', NODE_BIN, [
            OPEN_DEV_CLIENT_SCRIPT,
          ], { shell: false });
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
        runner.run('Install dev APK', NODE_BIN, [path.join(ROOT, 'scripts', 'adb-install-dev-apk.js')], {
          shell: false,
        }),
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
        return runner.run('Take Screenshot', NODE_BIN, [
          path.join(ROOT, 'scripts', 'adb-screenshot.js'),
          screenshotPath,
        ], { shell: false }).then((ok) => {
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
    sendJson(res, 200, getPublicStatus());
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
        status: getPublicStatus(),
      });
      return;
    }

    const preflightError = definition.preflight?.();
    if (preflightError) {
      sendJson(res, 409, { error: preflightError, status: getPublicStatus() });
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
        status: getPublicStatus(),
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: message, status: getPublicStatus() });
      return;
    }
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

function onListening() {
  const url = `http://localhost:${PORT}`;
  console.log(`Guru Dev Launcher running at ${url}`);
  console.log(`[launcher] ${LAUNCHER_BUILD_ID}`);
  runner.log(
    `[launcher] Server ready — ${LAUNCHER_BUILD_ID}. Stale listeners on port ${PORT} are cleared each start unless GURU_LAUNCHER_NO_KILL_PORT=1.`,
    'info',
  );
  openBrowser(url);
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
  `[launcher] Port ${PORT} reclaim: ${reclaim.reclaimed ? 'cleared previous listener(s)' : reclaim.detail || 'ok'}`,
);
beginListen();
