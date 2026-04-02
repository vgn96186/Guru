#!/usr/bin/env node
/**
 * Bulk migration script: old theme → linearTheme
 * Replaces imports and all theme.* references.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Files to migrate (all that still import old theme)
const files = [];
function collectFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes("from '../constants/theme'") || content.includes("from '../../constants/theme'")) {
        files.push(full);
      }
    }
  }
}
collectFiles(path.join(ROOT, 'src/screens'));
collectFiles(path.join(ROOT, 'src/components'));

console.log(`Found ${files.length} files to migrate\n`);

// === COLOR MAPPINGS ===
// theme.colors.X → n.colors.Y
const colorMap = {
  // Direct renames
  'primary': 'accent',
  'primaryLight': 'accent',
  'primaryDark': 'accent',
  'accentAlt': 'warning',
  'accent': 'error',          // old theme.colors.accent (#FF6B9D) → error-ish
  'info': 'accent',
  'divider': 'border',
  'surfaceAlt': 'surface',
  'panel': 'surface',
  'panelAlt': 'surface',
  'inputBg': 'surface',
  'primaryTint': 'primaryTintSoft',
  'primaryTintMedium': 'borderHighlight',
  // Direct keep (same name)
  'background': 'background',
  'surface': 'surface',
  'card': 'card',
  'cardHover': 'cardHover',
  'surfaceHover': 'surfaceHover',
  'textPrimary': 'textPrimary',
  'textSecondary': 'textSecondary',
  'textMuted': 'textMuted',
  'textInverse': 'textInverse',
  'success': 'success',
  'warning': 'warning',
  'error': 'error',
  'border': 'border',
  'borderLight': 'borderLight',
  'successSurface': 'successSurface',
  'errorSurface': 'errorSurface',
  'primaryTintSoft': 'primaryTintSoft',
};

// Hardcoded replacements for colors not in linearTheme
const hardcodedColorReplace = {
  "theme.colors.overlay": "'rgba(2,2,4,0.72)'",
  "theme.colors.backdropStrong": "'rgba(0,0,0,0.82)'",
  "theme.colors.warningTintSoft": "'rgba(217,119,6,0.08)'",
  "theme.colors.errorTintSoft": "'rgba(241,76,76,0.08)'",
  "theme.colors.successTintSoft": "'rgba(63,185,80,0.08)'",
  "theme.colors.warningSurface": "'rgba(217,119,6,0.1)'",
  "theme.colors.unseen": "'#606080'",
  "theme.colors.seen": "'#2196F3'",
  "theme.colors.reviewed": "'#FF9800'",
  "theme.colors.mastered": "'#4CAF50'",
};

// === SPACING MAPPINGS ===
// theme.spacing.X → n.spacing.Y
const spacingMap = {
  'xs': 'xs',
  'sm': 'sm',
  'md': 'md',     // note: old md=12, new md=16
  'lg': 'lg',     // old lg=16, new lg=24
  'xl': 'xl',     // old xl=24, new xl=32
  'xxl': 'xl',    // old xxl=32, new xl=32
  'xxxl': 'xl',   // old xxxl=48, approximate to xl=32
};

// === BORDER RADIUS MAPPINGS ===
// theme.borderRadius.X → n.radius.Y
const radiusMap = {
  'sm': 'sm',
  'md': 'md',
  'lg': 'lg',
  'xl': 'lg',     // old xl=20 → new lg=16
  'xxl': 'lg',    // old xxl=28 → new lg=16
  'full': 'full',
};

// === ALPHA MAPPINGS ===
const alphaMap = {
  'pressed': 'pressed',
  'subtlePressed': 'pressed',
};

// === TYPOGRAPHY MAPPINGS ===
// theme.typography.X → approximate n.typography spread
// We'll keep these as-is with a "n." prefix since typography keys mostly overlap
const typographyMap = {
  'h0': 'display',
  'h1': 'display',
  'h2': 'title',
  'h3': 'sectionTitle',
  'h4': 'sectionTitle',
  'body': 'body',
  'bodySmall': 'bodySmall',
  'caption': 'caption',
  'captionSmall': 'caption',
  'label': 'label',
  'button': 'button',
};

let totalChanges = 0;

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  const origContent = content;
  const relPath = path.relative(ROOT, filePath);
  let changes = 0;

  // Determine correct import path for linearTheme
  const dir = path.dirname(filePath);
  const relFromSrc = path.relative(path.join(ROOT, 'src'), dir);
  const depth = relFromSrc.split(path.sep).length;
  // screens/ → ../theme, components/ → ../theme, components/home/ → ../../theme
  const prefix = depth >= 2 ? '../'.repeat(depth - 1) : '../'.repeat(depth);
  // Actually, let's compute it properly
  const themeDir = path.join(ROOT, 'src/theme');
  let relImportPath = path.relative(dir, themeDir).replace(/\\/g, '/');
  if (!relImportPath.startsWith('.')) relImportPath = './' + relImportPath;

  // 1. Replace import line
  const oldImport1 = "import { theme } from '../constants/theme';";
  const oldImport2 = "import { theme } from '../../constants/theme';";
  const newImport = `import { linearTheme as n } from '${relImportPath}/linearTheme';`;

  if (content.includes(oldImport1)) {
    content = content.replace(oldImport1, newImport);
    changes++;
  } else if (content.includes(oldImport2)) {
    content = content.replace(oldImport2, newImport);
    changes++;
  }

  // 2. Replace hardcoded color strings first (they have exact key names that might conflict)
  for (const [oldRef, newVal] of Object.entries(hardcodedColorReplace)) {
    const regex = new RegExp(oldRef.replace(/\./g, '\\.'), 'g');
    const m = content.match(regex);
    if (m) {
      content = content.replace(regex, newVal);
      changes += m.length;
    }
  }

  // 3. Replace theme.colors.X → n.colors.Y
  for (const [oldKey, newKey] of Object.entries(colorMap)) {
    const regex = new RegExp(`theme\\.colors\\.${oldKey}\\b`, 'g');
    const m = content.match(regex);
    if (m) {
      content = content.replace(regex, `n.colors.${newKey}`);
      changes += m.length;
    }
  }

  // 4. Replace theme.spacing.X → n.spacing.Y
  for (const [oldKey, newKey] of Object.entries(spacingMap)) {
    const regex = new RegExp(`theme\\.spacing\\.${oldKey}\\b`, 'g');
    const m = content.match(regex);
    if (m) {
      content = content.replace(regex, `n.spacing.${newKey}`);
      changes += m.length;
    }
  }

  // 5. Replace theme.borderRadius.X → n.radius.Y
  for (const [oldKey, newKey] of Object.entries(radiusMap)) {
    const regex = new RegExp(`theme\\.borderRadius\\.${oldKey}\\b`, 'g');
    const m = content.match(regex);
    if (m) {
      content = content.replace(regex, `n.radius.${newKey}`);
      changes += m.length;
    }
  }

  // 6. Replace theme.alpha.X → n.alpha.Y
  for (const [oldKey, newKey] of Object.entries(alphaMap)) {
    const regex = new RegExp(`theme\\.alpha\\.${oldKey}\\b`, 'g');
    const m = content.match(regex);
    if (m) {
      content = content.replace(regex, `n.alpha.${newKey}`);
      changes += m.length;
    }
  }

  // 7. Replace theme.typography.X → n.typography.Y
  for (const [oldKey, newKey] of Object.entries(typographyMap)) {
    // Match both spread (...theme.typography.X) and direct (theme.typography.X.fontSize)
    const regex = new RegExp(`theme\\.typography\\.${oldKey}\\b`, 'g');
    const m = content.match(regex);
    if (m) {
      content = content.replace(regex, `n.typography.${newKey}`);
      changes += m.length;
    }
  }

  // 8. Replace theme.shadows.sm/md → inline shadow
  content = content.replace(/theme\.shadows\.sm\b/g, (match) => {
    changes++;
    return "{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 }";
  });
  content = content.replace(/theme\.shadows\.md\b/g, (match) => {
    changes++;
    return "{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 }";
  });
  // theme.shadows.glow(color) → inline 
  content = content.replace(/theme\.shadows\.glow\(/g, (match) => {
    changes++;
    return "((c: string) => ({ shadowColor: c, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 }))(";
  });

  if (content !== origContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ ${relPath} — ${changes} replacements`);
    totalChanges += changes;
  } else {
    console.log(`  ${relPath} — no changes needed`);
  }
}

console.log(`\n=== Done: ${totalChanges} total replacements across ${files.length} files ===`);

// Check for any remaining old theme references
console.log('\n--- Checking for remaining theme.* references ---');
let remaining = 0;
for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(ROOT, filePath);
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for theme. references (excluding comments and the new 'n' alias)
    if (/\btheme\./i.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
      console.log(`  REMAINING: ${relPath}:${i + 1}: ${line.trim()}`);
      remaining++;
    }
  }
}
if (remaining === 0) {
  console.log('  None! All references migrated.');
} else {
  console.log(`\n  ${remaining} references still need manual attention.`);
}
