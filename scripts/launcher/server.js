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
const { open } = require('child_process');
const { Runner } = require('./runner');

const PORT = 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

      const actions = {
        dev: async () => {
          // npm run android — full rebuild + Metro + open app
          await runner.run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'android']);
        },
        'hot-reload': async () => {
          // Just open the app (Metro should already be running)
          const isWin = process.platform === 'win32';
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android:open']);
        },
        'start-metro': async () => {
          // Start Metro in background
          const isWin = process.platform === 'win32';
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android:metro']);
        },
        'stop-metro': async () => {
          const isWin = process.platform === 'win32';
          await runner.run('node', [path.join(ROOT, 'scripts', 'stop-metro.js')]);
        },
        rebuild: async () => {
          // Full debug APK rebuild
          const isWin = process.platform === 'win32';
          await runner.run(isWin ? 'npm.cmd' : 'npm', ['run', 'android:apk:device']);
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

const ROOT = path.join(__dirname, '..', '..');

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
