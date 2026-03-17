#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Generates REPO_MAP.md from the current repo layout.
 * Run: npm run repo-map
 * Keeps the file listing in sync with the tree; static guidance for AIs is embedded below.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  '.expo',
  'dist',
  '.gradle',
  '.kotlin',
  'bin',
]);
const INCLUDE_PATTERNS = /\.(ts|tsx|kt|json|js|mjs)$/;
const SKIP_PATTERNS = /(build|\.d\.ts$)/;

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  const dirs = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name === 'archive' && base === 'scripts') continue; // skip scripts/archive
      dirs.push({ name: e.name, rel });
    } else if (e.isFile() && INCLUDE_PATTERNS.test(e.name) && !SKIP_PATTERNS.test(e.name)) {
      files.push(rel);
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort();
  const out = [];
  for (const f of files) out.push(f);
  for (const d of dirs) {
    const full = path.join(dir, d.name);
    out.push(...walk(full, d.rel));
  }
  return out;
}

function collectPaths() {
  const paths = [];
  const roots = ['src', 'modules', 'e2e', 'scripts'];
  const rootFiles = [
    'App.tsx',
    'index.ts',
    'app.json',
    'app.config.js',
    'package.json',
    'tsconfig.json',
    'metro.config.js',
    'babel.config.js',
    'jest.setup.js',
    'jest.unit.config.js',
    'eslint.config.js',
    'eas.json',
    'react-native.config.js',
  ];
  for (const f of rootFiles) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) paths.push(f);
  }
  for (const root of roots) {
    const full = path.join(ROOT, root);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) continue;
    if (root === 'scripts') {
      const entries = fs.readdirSync(full, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && INCLUDE_PATTERNS.test(e.name)) paths.push(`${root}/${e.name}`);
        if (e.isDirectory() && e.name !== 'archive')
          paths.push(...walk(path.join(full, e.name), `${root}/${e.name}`));
      }
      continue;
    }
    paths.push(...walk(full, root));
  }
  return paths.sort();
}

function groupByDir(paths) {
  const groups = {};
  for (const p of paths) {
    const dir = path.dirname(p);
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(path.basename(p));
  }
  return groups;
}

function buildTree(paths) {
  const groups = groupByDir(paths);
  const dirs = Object.keys(groups).sort();
  const lines = [];
  for (const dir of dirs) {
    const files = groups[dir].sort();
    const prefix = dir === '.' ? '' : dir + '/';
    for (const f of files) lines.push(prefix + f);
  }
  return lines;
}

const generated = new Date().toISOString().slice(0, 10);
const paths = collectPaths();
const fileList = buildTree(paths);

const staticGuidance = `---
Generated: ${generated}. To refresh file listing, run: \`npm run repo-map\`
---

# Repo map (Guru / neet_study)

**For AIs:** This file is the canonical map of the repository. Prefer \`CLAUDE.md\` for architecture, DB, AI routing, and lecture flows; use this file for *where things live*. Re-run \`npm run repo-map\` after adding/removing source files so the listing stays accurate.

**Stack:** React Native (Expo), TypeScript, expo-sqlite, Zustand. NEET-PG/INICET study app.

---

## Root

| File | Role |
|------|------|
| \`App.tsx\` | Root component; runs \`runAppBootstrap()\` |
| \`index.ts\` | Entry |
| \`app.json\` / \`app.config.js\` | Expo config |
| \`package.json\` | Scripts, deps |
| \`tsconfig.json\`, \`metro.config.js\`, \`babel.config.js\` | Build |
| \`jest.setup.js\`, \`jest.unit.config.js\` | Unit tests |
| \`CLAUDE.md\` | **Canonical AI context** (architecture, DB, AI, lecture flows) |

---

## Source tree (generated)

Paths below are relative to repo root. Only \`src/\`, \`modules/\`, \`e2e/\`, \`scripts/\` and root config are included; \`node_modules\`, \`.git\`, \`build\`, \`docs/archive\` are excluded.

\`\`\`
${fileList.join('\n')}
\`\`\`

---

## Key entry points (static)

- **App:** \`App.tsx\` → \`runAppBootstrap()\` (\`src/services/appBootstrap.ts\`); post-mount \`useAppBootstrap\` (\`src/hooks/useAppBootstrap.ts\`).
- **DB:** \`getDb()\` in \`src/db/database.ts\`; migrations in \`src/db/migrations.ts\`; repositories in \`src/db/repositories/\`.
- **AI:** \`src/services/aiService.ts\` re-exports \`src/services/ai/\` (Groq → OpenRouter → local).
- **Lecture (external):** \`ExternalToolsRow\` → \`appLauncher\` → native \`RecordingService\` / \`OverlayService\` → return → \`transcriptionService\` + \`markTopicsFromLecture\`.
- **Lecture (in-app):** \`LectureModeScreen\` + \`transcription/\` and \`offlineTranscription/\`.
- **Navigation:** \`src/navigation/RootNavigator.tsx\` (modal stack), \`TabNavigator.tsx\` (5 tabs), \`types.ts\` (param lists).

---

## Conventions for AIs

1. **Canonical context:** \`CLAUDE.md\` — use it for rules, schema, API keys, lecture flows; do not rely on \`docs/archive/\` for current behavior.
2. **Where to look:** Use this map to locate screens (\`src/screens/\`), components (\`src/components/\`), services (\`src/services/\`, \`src/services/ai/\`), DB (\`src/db/\`), and native module (\`modules/app-launcher/\`).
3. **Refresh:** After structural changes, run \`npm run repo-map\` to regenerate the source tree section above.
`;

const outputPath = path.join(ROOT, 'REPO_MAP.md');
fs.writeFileSync(outputPath, staticGuidance, 'utf8');
console.log('Wrote', outputPath);
console.log('Files listed:', fileList.length);
