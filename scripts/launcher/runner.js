#!/usr/bin/env node
/**
 * runner.js - Wraps Guru dev commands and streams output via events.
 * Used by server.js to power the Dev Launcher UI.
 */

const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const { resolveAdbCommand } = require('../android-tooling');

const ROOT = path.join(__dirname, '..', '..');
const ADB_TIMEOUT_MS = 30_000;
const ADB_DISCOVERY_TIMEOUT_MS = 10_000;
const ADB_NON_SCOPED_COMMANDS = new Set([
  'version',
  'start-server',
  'kill-server',
  'devices',
  'help',
]);

function splitLines(raw) {
  return String(raw)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

const TASK_TIMEOUT_MS = 1_800_000;

class Runner extends EventEmitter {
  constructor() {
    super();
    this.foregroundTask = null;
    this.foregroundTaskTimer = null;
    this.backgroundTasks = new Map();
    this.logs = [];
    this.maxLogs = 800;
    this.lastResult = null;
    this.nextLogId = 1;
  }

  emitStatus() {
    this.emit('status', this.getStatus());
  }

  log(message, level = 'info', meta = {}) {
    const lines = splitLines(message);
    if (!lines.length) {
      return;
    }

    for (const line of lines) {
      const entry = {
        id: this.nextLogId++,
        time: new Date().toLocaleTimeString(),
        message: line,
        level,
        ...meta,
      };
      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }
      this.emit('log', entry);
    }
  }

  isBusy() {
    return Boolean(this.foregroundTask);
  }

  hasBackgroundTask(taskKey) {
    return this.backgroundTasks.has(taskKey);
  }

  buildSpawnOptions(options = {}) {
    const isWin = process.platform === 'win32';
    return {
      cwd: options.cwd || ROOT,
      shell: options.shell !== undefined ? options.shell : isWin,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: Boolean(options.detached),
    };
  }

  attachOutput(child, streamLevelMap = { stdout: 'stdout', stderr: 'stderr' }) {
    for (const [streamName, level] of Object.entries(streamLevelMap)) {
      const stream = child[streamName];
      if (!stream) {
        continue;
      }

      stream.on('data', (chunk) => {
        this.log(chunk.toString(), level);
      });
    }
  }

  startForegroundTask(taskName, child) {
    if (this.foregroundTaskTimer) {
      clearTimeout(this.foregroundTaskTimer);
    }

    this.foregroundTask = {
      name: taskName,
      pid: child.pid ?? null,
      startedAt: Date.now(),
    };
    this.lastResult = null;
    this.emitStatus();

    this.foregroundTaskTimer = setTimeout(() => {
      if (this.foregroundTask && this.foregroundTask.name === taskName) {
        this.log(
          `[timeout] ${taskName} exceeded ${Math.round(TASK_TIMEOUT_MS / 60_000)} min and was force-unlocked. You can run actions again.`,
          'warning',
        );
        this.finishForegroundTask(taskName, {
          success: false,
          error: 'Task timed out and was force-unlocked.',
        });
      }
    }, TASK_TIMEOUT_MS);
  }

  finishForegroundTask(taskName, result) {
    if (this.foregroundTaskTimer) {
      clearTimeout(this.foregroundTaskTimer);
      this.foregroundTaskTimer = null;
    }
    this.foregroundTask = null;
    this.lastResult = {
      taskName,
      finishedAt: Date.now(),
      ...result,
    };
    this.emitStatus();
    this.emit('done', { taskName, ...result });
  }

  registerBackgroundTask(taskKey, taskName, child) {
    this.backgroundTasks.set(taskKey, {
      key: taskKey,
      name: taskName,
      pid: child.pid ?? null,
      startedAt: Date.now(),
      child,
    });
    this.lastResult = null;
    this.emitStatus();
  }

  unregisterBackgroundTask(taskKey) {
    const removed = this.backgroundTasks.delete(taskKey);
    if (removed) {
      this.emitStatus();
    }
    return removed;
  }

  async run(taskName, command, args, options = {}) {
    if (this.isBusy()) {
      this.log('Another launcher task is already running. Please wait for it to finish.', 'error');
      return false;
    }

    this.log(`[start] ${taskName}: ${command} ${args.join(' ')}`, 'info');

    return new Promise((resolve) => {
      const child = spawn(command, args, this.buildSpawnOptions(options));

      this.startForegroundTask(taskName, child);
      this.attachOutput(child);

      child.on('error', (err) => {
        this.log(`[error] ${taskName}: ${err.message}`, 'error');
        this.finishForegroundTask(taskName, {
          success: false,
          error: err.message,
        });
        resolve(false);
      });

      child.on('close', (code, signal) => {
        const success = code === 0;
        this.log(
          success
            ? `[ok] ${taskName} completed successfully.`
            : `[fail] ${taskName} exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`,
          success ? 'success' : 'error',
        );
        this.finishForegroundTask(taskName, {
          success,
          code,
          signal: signal || null,
        });
        resolve(success);
      });
    });
  }

  startBackgroundTask(taskKey, taskName, command, args, options = {}) {
    if (this.isBusy()) {
      this.log(
        'Wait for the current launcher task to finish before starting another one.',
        'error',
      );
      return false;
    }

    if (this.hasBackgroundTask(taskKey)) {
      this.log(`${taskName} is already running in the background.`, 'warning');
      return false;
    }

    this.log(`[start] ${taskName}: ${command} ${args.join(' ')}`, 'info');

    const child = spawn(command, args, this.buildSpawnOptions(options));
    this.registerBackgroundTask(taskKey, taskName, child);
    this.attachOutput(child);

    child.on('error', (err) => {
      this.log(`[error] ${taskName}: ${err.message}`, 'error');
      this.unregisterBackgroundTask(taskKey);
      this.lastResult = {
        taskName,
        background: true,
        finishedAt: Date.now(),
        success: false,
        error: err.message,
      };
      this.emitStatus();
      this.emit('done', {
        taskName,
        background: true,
        success: false,
        error: err.message,
      });
    });

    child.on('close', (code, signal) => {
      const wasManaged = this.unregisterBackgroundTask(taskKey);
      const normalStop = code === 0 || signal === 'SIGTERM' || signal === 'SIGINT';

      this.log(
        normalStop
          ? `[ok] ${taskName} stopped.`
          : `[fail] ${taskName} exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`,
        normalStop ? 'success' : 'error',
      );

      if (wasManaged) {
        this.lastResult = {
          taskName,
          background: true,
          finishedAt: Date.now(),
          success: normalStop,
          code,
          signal: signal || null,
        };
        this.emitStatus();
        this.emit('done', {
          taskName,
          background: true,
          success: normalStop,
          code,
          signal: signal || null,
        });
      }
    });

    return true;
  }

  stopBackgroundTask(taskKey) {
    const task = this.backgroundTasks.get(taskKey);
    if (!task || !task.child || !task.pid) {
      this.log(`No managed background task found for "${taskKey}".`, 'warning');
      return false;
    }

    this.log(`[stop] ${task.name}`, 'info');

    if (process.platform === 'win32') {
      const result = spawnSync('taskkill', ['/PID', String(task.pid), '/T', '/F'], {
        stdio: 'pipe',
        encoding: 'utf8',
        shell: true,
        timeout: 10_000,
      });

      if (result.error?.code === 'ETIMEDOUT') {
        this.log(
          `[error] taskkill timed out for ${task.name}. Process may still be running.`,
          'error',
        );
        return false;
      }

      if (result.status !== 0) {
        const message = result.stderr?.trim() || 'taskkill failed.';
        this.log(`[error] Failed to stop ${task.name}: ${message}`, 'error');
        return false;
      }

      return true;
    }

    try {
      task.child.kill('SIGTERM');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`[error] Failed to stop ${task.name}: ${message}`, 'error');
      return false;
    }
  }

  runAdb(taskName, adbArgs) {
    if (this.isBusy()) {
      this.log('Another launcher task is already running. Please wait for it to finish.', 'error');
      return false;
    }

    const adbCommand = resolveAdbCommand();
    const shouldScope = this.shouldScopeAdbArgs(adbArgs);
    const deviceSerial = shouldScope ? this.resolveDeviceSerial(adbCommand) : '';
    const scopedArgs = shouldScope && deviceSerial ? ['-s', deviceSerial, ...adbArgs] : adbArgs;
    this.log(`[start] ${taskName}: ${adbCommand} ${scopedArgs.join(' ')}`, 'info');

    return new Promise((resolve) => {
      const child = spawn(adbCommand, scopedArgs, {
        cwd: ROOT,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        this.log(
          `[warning] ${taskName} timed out after ${Math.round(ADB_TIMEOUT_MS / 1000)}s. Clearing stale adb.exe processes...`,
          'warning',
        );

        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 8_000,
          });
          spawnSync('taskkill', ['/IM', 'adb.exe', '/F'], {
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 8_000,
          });
        } else {
          child.kill('SIGTERM');
          spawnSync('pkill', ['-f', 'adb'], {
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 8_000,
          });
        }
      }, ADB_TIMEOUT_MS);

      this.startForegroundTask(taskName, child);
      this.attachOutput(child);

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        this.log(`[error] ${taskName}: ${err.message}`, 'error');
        this.finishForegroundTask(taskName, {
          success: false,
          error: err.message,
        });
        resolve(false);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          this.log(
            `[fail] ${taskName} timed out. Try the action again now that stale adb processes were cleared.`,
            'error',
          );
          this.finishForegroundTask(taskName, {
            success: false,
            code: code ?? null,
            signal: signal || null,
            error: 'ADB command timed out.',
          });
          resolve(false);
          return;
        }

        const success = code === 0;
        this.log(
          success
            ? `[ok] ${taskName} completed successfully.`
            : `[fail] ${taskName} exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`,
          success ? 'success' : 'error',
        );
        this.finishForegroundTask(taskName, {
          success,
          code,
          signal: signal || null,
        });
        resolve(success);
      });
    });
  }

  shouldScopeAdbArgs(adbArgs) {
    if (!Array.isArray(adbArgs) || !adbArgs.length) {
      return false;
    }

    const command = String(adbArgs[0]).trim().toLowerCase();
    if (!command) {
      return false;
    }

    return !ADB_NON_SCOPED_COMMANDS.has(command);
  }

  resolveDeviceSerial(adbCommand) {
    const requestedSerial = process.env.GURU_ANDROID_SERIAL?.trim();
    const result = spawnSync(adbCommand, ['devices', '-l'], {
      cwd: ROOT,
      shell: false,
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: ADB_DISCOVERY_TIMEOUT_MS,
    });

    if (result.error || result.status !== 0) {
      return '';
    }

    const readyDevices = String(result.stdout || '')
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          serial: parts[0] || '',
          state: parts[1] || '',
        };
      })
      .filter((row) => row.serial && row.state === 'device');

    if (!readyDevices.length) {
      return '';
    }

    if (requestedSerial) {
      const requestedDevice = readyDevices.find((row) => row.serial === requestedSerial);
      if (!requestedDevice) {
        this.log(
          `[warning] Requested device ${requestedSerial} not found. Using ${readyDevices[0].serial} instead.`,
          'warning',
        );
        return readyDevices[0].serial;
      }
      return requestedDevice.serial;
    }

    if (readyDevices.length > 1) {
      this.log(
        `[warning] Multiple devices detected. Using ${readyDevices[0].serial}. Set GURU_ANDROID_SERIAL to override.`,
        'warning',
      );
    }

    return readyDevices[0].serial;
  }

  getStatus() {
    return {
      busy: this.isBusy(),
      foregroundTask: this.foregroundTask,
      backgroundTasks: Object.fromEntries(
        Array.from(this.backgroundTasks.entries()).map(([key, task]) => [
          key,
          {
            key,
            name: task.name,
            pid: task.pid,
            startedAt: task.startedAt,
          },
        ]),
      ),
      lastResult: this.lastResult,
      logs: this.logs,
    };
  }
}

module.exports = { Runner };
