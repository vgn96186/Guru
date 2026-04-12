#!/usr/bin/env node
/**
 * create-desktop-shortcut.js — Creates a .bat desktop shortcut for Guru Dev Launcher.
 * No PowerShell dependency. Just writes a batch file to the Desktop.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const SHORTCUT_NAME = 'Guru Dev Launcher.bat';

function getDesktopPath() {
  if (process.platform === 'win32') {
    return process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, 'Desktop')
      : null;
  }
  return process.env.HOME
    ? path.join(process.env.HOME, 'Desktop')
    : null;
}

function cleanOldShortcuts(desktop) {
  const patterns = [
    'Guru Dev Launcher.lnk',
    'Guru Dev Launcher.bat',
    'Guru Launcher.lnk',
    'Guru Launcher.bat',
  ];
  for (const name of patterns) {
    const p = path.join(desktop, name);
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`  Removed old: ${name}`);
      }
    } catch {}
  }
}

function createWindows(desktop) {
  const batContent = [
    '@echo off',
    `cd /d "${PROJECT_ROOT}"`,
    'echo Starting Guru Dev Launcher...',
    'node "scripts\\launcher\\launch.js"',
    'if errorlevel 1 (',
    '  echo.',
    '  echo Something went wrong. See the error above.',
    '  pause',
    ')',
    '',
  ].join('\r\n');
  const shortcutPath = path.join(desktop, SHORTCUT_NAME);
  fs.writeFileSync(shortcutPath, batContent);
  console.log(`[ok] Desktop shortcut created: ${shortcutPath}`);
  return true;
}

function createUnix(desktop) {
  const content = `#!/bin/bash\ncd "${PROJECT_ROOT}"\nnode "scripts/launcher/launch.js"\n`;
  const shortcutPath = path.join(desktop, 'Guru Dev Launcher.command');
  fs.writeFileSync(shortcutPath, content);
  fs.chmodSync(shortcutPath, '755');
  console.log(`[ok] Desktop shortcut created: ${shortcutPath}`);
  return true;
}

function main() {
  const desktop = getDesktopPath();
  if (!desktop || !fs.existsSync(desktop)) {
    console.error('Could not find Desktop folder.');
    process.exit(1);
  }

  console.log('Creating desktop shortcut for Guru Dev Launcher...');
  cleanOldShortcuts(desktop);

  const success = process.platform === 'win32'
    ? createWindows(desktop)
    : createUnix(desktop);

  if (!success) process.exit(1);
}

main();
