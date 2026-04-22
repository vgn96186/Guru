#!/usr/bin/env node
/**
 * Capture device screen to a PNG on the PC (no Launcher log corruption of binary data).
 *
 * 1) adb exec-out screencap -p  → stdout PNG (large maxBuffer for tablets)
 * 2) Fallback: adb shell screencap -p /data/local/tmp/... then adb pull
 *
 * Output: argv[1] if set, else <repo>/device-screen.png
 * Device: GURU_ANDROID_SERIAL or first `adb devices` in `device` state.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveAdbCommand } = require('./android-tooling');

const ROOT = path.join(__dirname, '..');
const REQUESTED_DEVICE_SERIAL = process.env.GURU_ANDROID_SERIAL?.trim() || '';
const ADB_CMD = resolveAdbCommand();
const CAPTURE_TIMEOUT_MS = 60_000;
const MAX_PNG_BYTES = 48 * 1024 * 1024;
const REMOTE_FALLBACK = '/data/local/tmp/guru_launcher_screen.png';

let activeDeviceSerial = '';

function fail(message) {
  console.error(`[adb-screenshot] ${message}`);
  process.exit(1);
}

function parseAdbDeviceRows(output) {
  return String(output || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return { serial: parts[0] || '', state: parts[1] || '' };
    })
    .filter((row) => row.serial);
}

function ensureDeviceConnected() {
  const result = spawnSync(ADB_CMD, ['devices'], {
    encoding: 'utf8',
    timeout: 15_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    fail('Failed to query adb devices.');
  }
  const ready = parseAdbDeviceRows(result.stdout).filter((row) => row.state === 'device');
  if (!ready.length) {
    fail('No adb device in `device` state. Connect USB and authorize debugging.');
  }
  if (REQUESTED_DEVICE_SERIAL) {
    const found = ready.find((row) => row.serial === REQUESTED_DEVICE_SERIAL);
    if (!found) {
      fail(
        `Requested device "${REQUESTED_DEVICE_SERIAL}" not found. Available: ${ready
          .map((r) => r.serial)
          .join(', ')}`,
      );
    }
    activeDeviceSerial = found.serial;
  } else {
    activeDeviceSerial = ready[0].serial;
    if (ready.length > 1) {
      console.log(
        `[adb-screenshot] Multiple devices — using ${activeDeviceSerial}. Set GURU_ANDROID_SERIAL to override.`,
      );
    }
  }
}

function scoped(args) {
  return activeDeviceSerial ? ['-s', activeDeviceSerial, ...args] : args;
}

function isPngBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

function writeAtomic(targetPath, buf) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${targetPath}.${process.pid}.part`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, targetPath);
}

function tryExecOut() {
  return spawnSync(ADB_CMD, scoped(['exec-out', 'screencap', '-p']), {
    encoding: 'buffer',
    maxBuffer: MAX_PNG_BYTES,
    timeout: CAPTURE_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function tryShellAndPull(outPath) {
  const cap = spawnSync(ADB_CMD, scoped(['shell', 'screencap', '-p', REMOTE_FALLBACK]), {
    encoding: 'utf8',
    timeout: CAPTURE_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (cap.error) {
    fail(`screencap shell: ${cap.error.message}`);
  }
  if (cap.status !== 0) {
    const errText = `${cap.stderr || ''}${cap.stdout || ''}`.trim();
    fail(`screencap on device failed (exit ${cap.status})${errText ? `: ${errText}` : ''}`);
  }

  const pull = spawnSync(ADB_CMD, scoped(['pull', REMOTE_FALLBACK, outPath]), {
    encoding: 'utf8',
    timeout: CAPTURE_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (pull.error) {
    fail(`adb pull: ${pull.error.message}`);
  }
  if (pull.status !== 0) {
    const errText = `${pull.stderr || ''}${pull.stdout || ''}`.trim();
    fail(`adb pull failed (exit ${pull.status})${errText ? `: ${errText}` : ''}`);
  }

  if (!fs.existsSync(outPath)) {
    fail('adb pull reported success but local file is missing.');
  }
  const st = fs.statSync(outPath);
  if (st.size < 200) {
    fail(`Pulled PNG is too small (${st.size} bytes) — capture likely failed.`);
  }
}

function main() {
  const outArg = process.argv[2];
  const outPath = path.resolve(outArg || path.join(ROOT, 'device-screen.png'));

  ensureDeviceConnected();

  const execOut = tryExecOut();
  if (execOut.error) {
    if (execOut.error.code === 'ETIMEDOUT' || execOut.error.code === 'TIMEOUT') {
      console.warn('[adb-screenshot] exec-out timed out, trying on-device screencap + pull...');
    } else {
      console.warn(
        `[adb-screenshot] exec-out error (${execOut.error.message}), trying fallback...`,
      );
    }
    tryShellAndPull(outPath);
    console.log(`[adb-screenshot] ${fs.statSync(outPath).size} bytes → ${outPath}`);
    return;
  }

  if (execOut.status === 0 && isPngBuffer(execOut.stdout)) {
    writeAtomic(outPath, execOut.stdout);
    console.log(`[adb-screenshot] ${execOut.stdout.length} bytes → ${outPath}`);
    return;
  }

  const stderrHint =
    execOut.stderr && execOut.stderr.length ? execOut.stderr.toString('utf8').slice(0, 200) : '';
  if (stderrHint) {
    console.warn('[adb-screenshot] exec-out did not return PNG:', stderrHint);
  }
  console.warn('[adb-screenshot] Falling back to on-device screencap + pull...');
  tryShellAndPull(outPath);
  console.log(`[adb-screenshot] ${fs.statSync(outPath).size} bytes → ${outPath}`);
}

main();
