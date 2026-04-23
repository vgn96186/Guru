/* eslint-disable */
/**
 * Post-pass cleanup for the codemod: removes now-unused imports introduced by
 * the first pass (useNavigation, useRoute, and ParamList types that are no
 * longer referenced).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const SKIP = new Set([
  path.join(SRC, 'navigation/typedHooks.ts'),
  path.join(SRC, 'hooks/useNavigationGuard.ts'),
  path.join(SRC, 'screens/SettingsScreen.tsx'),
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx?|ts)$/.test(e.name)) out.push(full);
  }
  return out;
}

// Strip an identifier from all named-import clauses if it's not referenced
// anywhere outside imports. Handles mixed `type` prefixes.
function stripIfUnused(src, ident) {
  const bodyWithoutImports = src.replace(/^import[^;]*;\s*\n/gm, '');
  // Match standalone identifier; exclude property access like `HomeNav.useRoute`.
  if (new RegExp(`(?<![\\w.])${ident}\\b`).test(bodyWithoutImports)) return src;

  return src.replace(
    /import\s+(type\s+)?\{\s*([^}]+)\}\s*from\s*('[^']+'|"[^"]+")\s*;\s*\n/g,
    (full, typeKw, names, from) => {
      const parts = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const kept = parts.filter((p) => p.replace(/^type\s+/, '') !== ident);
      if (kept.length === parts.length) return full;
      if (kept.length === 0) return '';
      return `import ${typeKw ?? ''}{ ${kept.join(', ')} } from ${from};\n`;
    },
  );
}

// Also strip identifiers from plain (non-braced) default/namespace imports? Not needed here.

const TARGETS = [
  'useNavigation',
  'useRoute',
  'NativeStackNavigationProp',
  'RouteProp',
  'HomeStackParamList',
  'SyllabusStackParamList',
  'ChatStackParamList',
  'MenuStackParamList',
  'RootStackParamList',
];

let changed = 0;
for (const f of walk(SRC)) {
  if (SKIP.has(f)) continue;
  let src = fs.readFileSync(f, 'utf8');
  const original = src;
  for (const id of TARGETS) src = stripIfUnused(src, id);
  if (src !== original) {
    fs.writeFileSync(f, src);
    changed++;
    console.log('  -', path.relative(ROOT, f));
  }
}
console.log(`[cleanup] stripped unused imports in ${changed} files`);
