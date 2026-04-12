/**
 * ESM loader hook that converts raw Windows paths (C:\...) to file:// URLs.
 * Fixes Metro's config loader on Windows + Node.js 20.
 *
 * Registered via: NODE_OPTIONS="--loader ./scripts/fix-esm-windows.mjs"
 */

import { pathToFileURL } from 'node:url';

export function resolve(specifier, context, nextResolve) {
  if (/^[A-Za-z]:[\\/]/.test(specifier)) {
    specifier = pathToFileURL(specifier).href;
  }
  return nextResolve(specifier, context);
}
