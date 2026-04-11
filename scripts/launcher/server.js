#!/usr/bin/env node
/**
 * server.js — Guru Dev Launcher server.
 * Serves the launcher UI and runs dev commands via SSE.
 *
 * Usage: node scripts/launcher/server.js
 * Opens http://localhost:3100 in your browser.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Runner } = require('./runner');

const PORT = 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOT = path.join(__dirname, '..', '..');

const runner = new Runner();

/**
 * MIME types for static files.
 */
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Serve static files from public/.
 */
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

/**
 * Handle SSE connection for log streaming.
 */
function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial status
  const status = runner.getStatus();
  res.write(`data: ${JSON.stringify({ type: 'status', ...status })}\n\n`);

  const onLog = (entry) => {
    res.write(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`);
  };

  const onDone = (result) => {
    res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
  };

  runner.on('log', onLog);
  runner.on('done', onDone);

  req.on('close', () => {
    runner.removeListener('log', onLog);
    runner.removeListener('done', onDone);
  });
}

/**
 * Handle API requests.
 */
async function handleAPI(req, res) {
  const body = [];
  req.on('data', (chunk) => body.push(chunk));
  req.on('end', async () => {
    const data = body.length ? JSON.parse(Buffer.concat(body).toString()) : {};

    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(runner.getStatus()));
      return;
    }

    if (req.url === '/api/run') {
      const { action } = data;
      const isWin = process.platform === 'win32';

      const actions = {
        dev: async () => {
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android']);
        },
        'hot-reload': async () => {
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android:open']);
        },
        'start-metro': async () => {
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android:metro']);
        },
        'stop-metro': async () => {
          await runner.run('node', [path.join(ROOT, 'scripts', 'stop-metro.js')]);
        },
        'build-debug': async () => {
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android:apk:device']);
        },
        'build-release': async () => {
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android:apk:release:device']);
        },
        'adb-devices': async () => {
          await runner.runAdb(['devices', '-l']);
        },
        'adb-restart-app': async () => {
          const APP_PACKAGE = 'com.anonymous.gurustudy.dev';
          await runner.runAdb(['shell', 'am', 'force-stop', APP_PACKAGE]);
          await runner.runAdb([
            'shell',
            'monkey',
            '-p',
            APP_PACKAGE,
            '-c',
            'android.intent.category.LAUNCHER',
            '1',
          ]);
        },
        'adb-screenshot': async () => {
          const screenshotPath = path.join(ROOT, 'device-screen.png');
          await runner.runAdb(['shell', 'screencap', '-p', '/sdcard/screen.png']);
          await runner.runAdb(['pull', '/sdcard/screen.png', screenshotPath]);
          runner.log(`Screenshot saved to device-screen.png`, 'success');
        },
        'adb-logcat': async () => {
          await runner.runAdb([
            'logcat',
            '-d',
            '-t',
            '200',
            '*:S',
            'ReactNative:V',
            'ReactNativeJS:V',
            'AndroidRuntime:E',
          ]);
        },
        'create-shortcut': async () => {
          await runner.run('node', [path.join(ROOT, 'scripts', 'create-desktop-shortcut.js')]);
        },
      };

      if (!actions[action]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started: true, action }));

      await actions[action]();
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}

/**
 * Main HTTP server.
 */
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // SSE endpoint
  if (req.url === '/events' && req.headers.accept?.includes('text/event-stream')) {
    handleSSE(req, res);
    return;
  }

  // API endpoints
  if (req.url.startsWith('/api/')) {
    handleAPI(req, res);
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Guru Dev Launcher running at ${url}`);

  // Auto-open in browser
  if (process.platform === 'win32') {
    require('child_process').exec(`start ${url}`);
  } else if (process.platform === 'darwin') {
    require('child_process').exec(`open ${url}`);
  } else {
    require('child_process').exec(`xdg-open ${url}`);
  }
});
