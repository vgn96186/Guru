/* eslint-disable */
/**
 * One-shot codemod: migrates useNavigation<NativeStackNavigationProp<...>>()
 * and useRoute<RouteProp<...>>() patterns to the new typedHooks helpers.
 *
 * Safe-by-default: files using CompositeNavigationProp are skipped and must be
 * migrated by hand.
 *
 * Run from repo root: `node scripts/codemod-typed-nav.js`
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const PARAM_TO_NAV = {
  HomeStackParamList: 'HomeNav',
  SyllabusStackParamList: 'SyllabusNav',
  ChatStackParamList: 'ChatNav',
  MenuStackParamList: 'MenuNav',
  RootStackParamList: 'RootNav',
};

const SKIP_FILES = new Set([
  // Uses CompositeNavigationProp — manual migration.
  path.join(SRC, 'screens/SettingsScreen.tsx'),
  // Defines NativeStackNavigationProp generic infrastructure, not a consumer.
  path.join(SRC, 'hooks/useNavigationGuard.ts'),
  // The helper itself.
  path.join(SRC, 'navigation/typedHooks.ts'),
  // Navigator files construct the navigator, not consume hooks.
  path.join(SRC, 'navigation/TabNavigator.tsx'),
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function importPathFor(fromFile) {
  const rel = path.relative(path.dirname(fromFile), path.join(SRC, 'navigation/typedHooks'));
  const norm = rel.split(path.sep).join('/');
  return norm.startsWith('.') ? norm : `./${norm}`;
}

function migrateFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Skip composite nav usages.
  if (src.includes('CompositeNavigationProp')) return null;

  // --- Step 1: resolve local `type Nav = …` and `type Route = …` aliases. ---
  // We collect mapping {aliasName: {navHelper, screen?}} and remove the
  // alias declarations at the end once we've rewritten the references.
  /** @type {Record<string,{navHelper:string, screen?:string, kind:'nav'|'route'}>} */
  const aliases = {};

  const typeAliasRe =
    /^\s*type\s+(\w+)\s*=\s*NativeStackNavigationProp<\s*(\w+)(?:\s*,\s*'([^']+)')?\s*>\s*;\s*\n/gm;
  src = src.replace(typeAliasRe, (_m, aliasName, paramList, screen) => {
    const helper = PARAM_TO_NAV[paramList];
    if (!helper) return _m;
    aliases[aliasName] = { navHelper: helper, screen, kind: 'nav' };
    return '';
  });

  const routeAliasRe =
    /^\s*type\s+(\w+)\s*=\s*RouteProp<\s*(\w+)\s*,\s*'([^']+)'\s*>\s*;\s*\n/gm;
  src = src.replace(routeAliasRe, (_m, aliasName, paramList, screen) => {
    const helper = PARAM_TO_NAV[paramList];
    if (!helper) return _m;
    aliases[aliasName] = { navHelper: helper, screen, kind: 'route' };
    return '';
  });

  // --- Step 2: rewrite `useNavigation<Alias>()` / `useRoute<Alias>()`. ---
  for (const [aliasName, info] of Object.entries(aliases)) {
    if (info.kind === 'nav') {
      const re = new RegExp(`useNavigation<\\s*${aliasName}\\s*>\\(\\)`, 'g');
      src = src.replace(re, () =>
        info.screen ? `${info.navHelper}.useNav<'${info.screen}'>()` : `${info.navHelper}.useNav()`,
      );
    } else {
      const re = new RegExp(`useRoute<\\s*${aliasName}\\s*>\\(\\)`, 'g');
      src = src.replace(re, () => `${info.navHelper}.useRoute<'${info.screen}'>()`);
    }
  }

  // --- Step 3: rewrite inline `useNavigation<NativeStackNavigationProp<…>>()`. ---
  src = src.replace(
    /useNavigation<\s*NativeStackNavigationProp<\s*(\w+)(?:\s*,\s*'([^']+)')?\s*>\s*>\(\)/g,
    (m, paramList, screen) => {
      const helper = PARAM_TO_NAV[paramList];
      if (!helper) return m;
      return screen ? `${helper}.useNav<'${screen}'>()` : `${helper}.useNav()`;
    },
  );

  // --- Step 4: rewrite inline `useRoute<RouteProp<…>>()`. ---
  src = src.replace(
    /useRoute<\s*RouteProp<\s*(\w+)\s*,\s*'([^']+)'\s*>\s*>\(\)/g,
    (m, paramList, screen) => {
      const helper = PARAM_TO_NAV[paramList];
      if (!helper) return m;
      return `${helper}.useRoute<'${screen}'>()`;
    },
  );

  if (src === original) return null;

  // --- Step 5: figure out which helpers are now referenced, add import. ---
  const usedHelpers = Object.values(PARAM_TO_NAV).filter((h) =>
    new RegExp(`\\b${h}\\.(useNav|useRoute)\\b`).test(src),
  );
  if (usedHelpers.length > 0) {
    const importSpec = usedHelpers.sort().join(', ');
    const importLine = `import { ${importSpec} } from '${importPathFor(file).replace(/\.tsx?$/, '')}';\n`;
    // Insert after the last top-level `import` line.
    const importRe = /^(import[^;]*;\s*\n)+/m;
    const match = src.match(importRe);
    if (match) {
      const end = match.index + match[0].length;
      src = src.slice(0, end) + importLine + src.slice(end);
    } else {
      src = importLine + src;
    }
  }

  // --- Step 6: strip now-unused imports. ---
  // Only strip if the identifier no longer appears outside its import line.
  const maybeStrip = (ident) => {
    const bodyWithoutImports = src.replace(/^import[^;]*;\s*\n/gm, '');
    if (new RegExp(`\\b${ident}\\b`).test(bodyWithoutImports)) return;
    // Remove from named import clauses.
    src = src.replace(
      /import\s*(type\s+)?\{\s*([^}]+)\}\s*from\s*('[^']+'|"[^"]+")\s*;\s*\n/g,
      (line, typeKw, names, from) => {
        const kept = names
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((n) => n.replace(/^type\s+/, '') !== ident);
        if (kept.length === names.split(',').map((s) => s.trim()).filter(Boolean).length) {
          return line;
        }
        if (kept.length === 0) return '';
        return `import ${typeKw ?? ''}{ ${kept.join(', ')} } from ${from};\n`;
      },
    );
  };
  maybeStrip('NativeStackNavigationProp');
  maybeStrip('RouteProp');

  fs.writeFileSync(file, src);
  return file;
}

function main() {
  const files = walk(SRC).filter((f) => !SKIP_FILES.has(f));
  const changed = [];
  for (const f of files) {
    try {
      const res = migrateFile(f);
      if (res) changed.push(res);
    } catch (e) {
      console.error('[codemod] failed on', f, e);
    }
  }
  console.log(`[codemod] migrated ${changed.length} files`);
  for (const f of changed) console.log('  -', path.relative(ROOT, f));
}

main();
