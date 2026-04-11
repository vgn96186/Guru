#!/usr/bin/env node
/**
 * runner.js — Wraps Guru dev commands and streams output via events.
 * Used by server.js to power the Dev Launcher UI.
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..', '..');

class Runner extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.logs = [];
    this.maxLogs = 500;
  }

  log(message, level = 'info') {
    const entry = { time: new Date().toLocaleTimeString(), message, level };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit('log', entry);
  }

  async run(command, args, options = {}) {
    if (this.running) {
      this.log('A task is already running. Please wait.', 'error');
      return false;
    }

    this.running = true;
    this.logs = [];
    this.log(`Starting: ${command} ${args.join(' ')}`, 'info');

    const isWin = process.platform === 'win32';
    const shell = options.shell !== undefined ? options.shell : isWin;

    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd || ROOT,
        shell,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) this.log(text, 'stdout');
      });

      child.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) this.log(text, 'stderr');
      });

      child.on('error', (err) => {
        this.log(`Error: ${err.message}`, 'error');
        this.running = false;
        this.emit('done', { success: false, error: err.message });
        resolve(false);
      });

      child.on('close', (code) => {
        const success = code === 0;
        this.log(
          success ? '✅ Done!' : `❌ Failed with code ${code}`,
          success ? 'success' : 'error',
        );
        this.running = false;
        this.emit('done', { success, code });
        resolve(success);
      });
    });
  }

  getStatus() {
    return { running: this.running, logs: this.logs };
  }
}

module.exports = { Runner };
