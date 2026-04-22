const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const METRO_PORT = 8081;
const METRO_STATUS_URL = `http://127.0.0.1:${METRO_PORT}/status`;
const METRO_LOG_PATH = path.join(ROOT, 'metro-dev.log');
const METRO_ERR_LOG_PATH = path.join(ROOT, 'metro-dev.err.log');

function readLogTail(filePath, maxLines = 30) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

function readWholeFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function getBundleMarkerSnapshot() {
  const logText = readWholeFile(METRO_LOG_PATH);
  const errText = readWholeFile(METRO_ERR_LOG_PATH);
  const combined = `${logText}\n${errText}`;
  const allLines = combined.split(/\r?\n/);

  // Only scan lines after the last start banner so stale errors don't
  // trigger false failures.
  const startBannerRe = /^=====\s.*metro start\s*=====$/i;
  let lastBannerIndex = -1;
  allLines.forEach((line, i) => {
    if (startBannerRe.test(line.trim())) {
      lastBannerIndex = i;
    }
  });
  const lines = lastBannerIndex >= 0 ? allLines.slice(lastBannerIndex + 1) : allLines;

  let completionCount = 0;
  let latestCompletionLine = '';
  let latestCompletionIndex = -1;
  let hasFailure = false;
  let latestFailureLine = '';

  const completionPatterns = [
    /bundled\s+\d+ms/i,
    /bundle\s+complete/i,
    /finished\s+building/i,
    /done\s+writing\s+bundle/i,
  ];
  const failurePatterns = [/error/i, /failed/i, /unable to resolve module/i, /syntaxerror/i];

  lines.forEach((line, index) => {
    if (completionPatterns.some((pattern) => pattern.test(line))) {
      completionCount += 1;
      latestCompletionLine = line.trim();
      latestCompletionIndex = index;
    }

    if (failurePatterns.some((pattern) => pattern.test(line))) {
      hasFailure = true;
      latestFailureLine = line.trim();
    }
  });

  return {
    completionCount,
    latestCompletionLine,
    latestCompletionIndex,
    hasFailure,
    latestFailureLine,
  };
}

function isMetroRunning() {
  return new Promise((resolve) => {
    const req = http.get(METRO_STATUS_URL, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body.includes('packager-status:running')));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForMetroReady(options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollMs = options.pollMs ?? 1_000;
  const onLog = typeof options.onLog === 'function' ? options.onLog : null;
  const requireBundleCompletion = options.requireBundleCompletion !== false;
  const initialSnapshot = getBundleMarkerSnapshot();

  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  let lastLog = -1;

  while (Date.now() < deadline) {
    const metroRunning = await isMetroRunning();
    const snapshot = getBundleMarkerSnapshot();

    if (snapshot.hasFailure && snapshot.latestFailureLine) {
      return {
        ok: false,
        message: `Metro reported a bundle/build failure.\nLast failure:\n${snapshot.latestFailureLine}`,
      };
    }

    if (metroRunning) {
      if (!requireBundleCompletion) {
        if (onLog) onLog('Metro is ready.');
        return { ok: true };
      }

      const sawNewCompletion = snapshot.completionCount > initialSnapshot.completionCount;
      if (sawNewCompletion) {
        if (onLog) {
          onLog(
            `Metro is ready and bundle completed${
              snapshot.latestCompletionLine ? `: ${snapshot.latestCompletionLine}` : '.'
            }`,
          );
        }
        return { ok: true };
      }
    }

    const sec = Math.floor((Date.now() - startTime) / 1000);
    if (onLog && sec > 0 && sec % 5 === 0 && sec !== lastLog) {
      lastLog = sec;
      onLog(
        requireBundleCompletion
          ? `Waiting for Metro bundle to finish... (${sec}s)`
          : `Waiting for Metro... (${sec}s)`,
      );
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  const logTail = readLogTail(METRO_LOG_PATH);
  const errTail = readLogTail(METRO_ERR_LOG_PATH);
  let message = requireBundleCompletion
    ? `Metro did not finish bundling after ${Math.round(timeoutMs / 1000)}s.`
    : `Metro did not become ready after ${Math.round(timeoutMs / 1000)}s.`;
  if (logTail) message += `\nLast logs:\n${logTail}`;
  if (errTail) message += `\nLast errors:\n${errTail}`;
  return { ok: false, message };
}

async function getMetroHealthSnapshot() {
  const running = await isMetroRunning();
  const snapshot = getBundleMarkerSnapshot();
  return {
    running,
    bundleCompletionCount: snapshot.completionCount,
    latestBundleCompletionLine: snapshot.latestCompletionLine,
    hasFailure: snapshot.hasFailure,
    latestFailureLine: snapshot.latestFailureLine,
  };
}

module.exports = {
  getMetroHealthSnapshot,
  isMetroRunning,
  waitForMetroReady,
};
