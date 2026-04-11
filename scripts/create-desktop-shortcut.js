#!/usr/bin/env node
/**
 * create-desktop-shortcut.js — Creates a desktop shortcut to Guru Dev Launcher.
 * Works on Windows (creates .lnk) and Mac (creates .command file + symlink).
 */

const fs = require('fs');
const path = require('path');

function isWindows() {
  return process.platform === 'win32';
}

function getDesktopPath() {
  if (isWindows()) {
    if (process.env.USERPROFILE) {
      return path.join(process.env.USERPROFILE, 'Desktop');
    }
    return null;
  }
  // Mac/Linux
  if (process.env.HOME) {
    return path.join(process.env.HOME, 'Desktop');
  }
  return null;
}

function createWindowsShortcut() {
  const desktop = getDesktopPath();
  if (!desktop) {
    console.error('Could not find Desktop folder');
    return false;
  }

  const nodePath = process.execPath;
  const scriptPath = path.join(__dirname, 'launcher', 'server.js');
  const shortcutName = 'Guru Dev Launcher.lnk';
  const shortcutPath = path.join(desktop, shortcutName);

  // Create a .bat file that launches the server
  const batPath = path.join(__dirname, 'launcher', 'launcher.bat');
  const batContent = `@echo off
cd /d "${path.join(__dirname, '..', '..')}"
"${nodePath}" "${scriptPath}"
`;
  fs.writeFileSync(batPath, batContent);

  // Use PowerShell to create a .lnk shortcut
  const psScript = `$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}'); $Shortcut.TargetPath = '${batPath.replace(/\\/g, '\\\\')}'; $Shortcut.WorkingDirectory = '${path.join(__dirname, '..', '..').replace(/\\/g, '\\\\')}'; $Shortcut.Save()`;

  const { spawnSync } = require('child_process');
  const result = spawnSync('powershell', ['-Command', psScript], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (result.status === 0) {
    console.log(`✅ Desktop shortcut created: ${shortcutPath}`);
    return true;
  } else {
    console.error('Failed to create shortcut:', result.stderr);
    return false;
  }
}

function createMacShortcut() {
  const desktop = getDesktopPath();
  if (!desktop) {
    console.error('Could not find Desktop folder');
    return false;
  }

  const projectRoot = path.join(__dirname, '..', '..');
  const scriptPath = path.join(__dirname, 'launcher', 'server.js');
  const shortcutName = 'Guru Dev Launcher.command';
  const shortcutPath = path.join(desktop, shortcutName);

  const content = `#!/bin/bash
cd "${projectRoot}"
node "${scriptPath}"
`;

  try {
    fs.writeFileSync(shortcutPath, content);
    fs.chmodSync(shortcutPath, '755');
    console.log(`✅ Desktop shortcut created: ${shortcutPath}`);
    return true;
  } catch (err) {
    console.error('Failed to create shortcut:', err.message);
    return false;
  }
}

async function main() {
  console.log('Creating desktop shortcut for Guru Dev Launcher...');

  const success = isWindows() ? createWindowsShortcut() : createMacShortcut();

  if (!success) {
    process.exit(1);
  }
}

main();
