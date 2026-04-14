#!/usr/bin/env node
/**
 * verify-patches.js — Confirms that critical patches in node_modules/ are applied.
 *
 * Called by: verify:ci, verify:strict, and the Guru Launcher health checks.
 * Exits non-zero if any patch marker is missing, so CI / builds fail loud.
 *
 * Usage:  node scripts/verify-patches.js
 *   --json   Output machine-readable JSON (for launcher integration)
 *   --quiet  Only print failures
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');

// ── Patch markers ────────────────────────────────────────────────────────────
// Each entry: [relative path inside node_modules, substring that MUST exist]
const PATCH_MARKERS = [];

// ── Patch files that should exist ────────────────────────────────────────────
const PATCH_DIR = path.join(ROOT, 'patches');
const EXPECTED_PATCHES = [];

// ── Run checks ───────────────────────────────────────────────────────────────
const flags = new Set(process.argv.slice(2));
const jsonMode = flags.has('--json');
const quietMode = flags.has('--quiet');

const results = [];
let hasFailure = false;

// 1. Check patch files exist
for (const patchFile of EXPECTED_PATCHES) {
  const patchPath = path.join(PATCH_DIR, patchFile);
  const exists = fs.existsSync(patchPath);
  if (!exists) {
    hasFailure = true;
    results.push({ type: 'patch-file', file: patchFile, ok: false, reason: 'Patch file missing' });
  } else {
    results.push({ type: 'patch-file', file: patchFile, ok: true });
  }
}

// 2. Check markers in patched source files
for (const [relPath, marker] of PATCH_MARKERS) {
  const fullPath = path.join(NM, relPath);
  if (!fs.existsSync(fullPath)) {
    hasFailure = true;
    results.push({
      type: 'marker',
      file: relPath,
      marker,
      ok: false,
      reason: 'File not found — is the dependency installed?',
    });
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.includes(marker)) {
    hasFailure = true;
    results.push({
      type: 'marker',
      file: relPath,
      marker,
      ok: false,
      reason: `Marker "${marker}" not found — patch not applied. Run: npx patch-package`,
    });
  } else {
    results.push({ type: 'marker', file: relPath, marker, ok: true });
  }
}

// ── Output ───────────────────────────────────────────────────────────────────
if (jsonMode) {
  process.stdout.write(JSON.stringify({ ok: !hasFailure, results }, null, 2) + '\n');
} else {
  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (!quietMode && passed.length > 0) {
    console.log(`✔ ${passed.length} patch check(s) passed`);
  }

  for (const f of failed) {
    console.error(`✖ ${f.file}: ${f.reason}`);
  }

  if (!hasFailure) {
    if (!quietMode) console.log('All patches verified.');
  } else {
    console.error(
      `\n${failed.length} patch check(s) FAILED. Run "npx patch-package" to re-apply patches.`,
    );
  }
}

process.exit(hasFailure ? 1 : 0);
