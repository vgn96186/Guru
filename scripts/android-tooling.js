#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function getAdbFilename() {
  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}

function getAdbCandidates() {
  const adbFile = getAdbFilename();
  const candidates = [];

  if (process.env.ANDROID_SDK_ROOT) {
    candidates.push(path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', adbFile));
  }

  if (process.env.ANDROID_HOME) {
    candidates.push(path.join(process.env.ANDROID_HOME, 'platform-tools', adbFile));
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', adbFile),
    );
  }

  if (process.platform === 'darwin' && process.env.HOME) {
    candidates.push(
      path.join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', adbFile),
    );
  }

  if (process.platform !== 'win32' && process.env.HOME) {
    candidates.push(path.join(process.env.HOME, 'Android', 'Sdk', 'platform-tools', adbFile));
  }

  return [...new Set(candidates)];
}

function resolveAdbCommand() {
  return getAdbCandidates().find((candidate) => fs.existsSync(candidate)) || getAdbFilename();
}

module.exports = {
  resolveAdbCommand,
};
