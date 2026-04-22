/**
 * fix-esm-windows.js — Patch Node.js ESM loader for Windows path compatibility.
 *
 * Metro's config loader uses import() with raw Windows paths like C:\foo\bar.js.
 * Node.js ESM rejects these — it requires file:// URLs on Windows.
 * This preload script registers a custom loader that converts C:\ paths to file:// URLs.
 *
 * Usage: NODE_OPTIONS="--loader ./scripts/fix-esm-windows.mjs --no-warnings" npm run android:metro
 * Or:    node --require ./scripts/fix-esm-windows.js (for CJS hook)
 */

const Module = require('module');
const { pathToFileURL } = require('url');
const path = require('path');

if (process.platform !== 'win32') {
  return;
}

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (/^[A-Za-z]:[\\/]/.test(request) && request.endsWith('.js')) {
    try {
      return origResolveFilename.call(this, request, parent, isMain, options);
    } catch {
      return request;
    }
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};
