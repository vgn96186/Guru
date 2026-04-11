#!/usr/bin/env node
/**
 * fix-husky.js — Cross-platform husky shell path fixer
 * Replaces incorrect shell paths in husky hooks (for Termux compatibility)
 *
 * Replaces: find .husky -type f | xargs sed -i 's|/data/data/com.termux/files/usr/glibc/bin/sh|/data/data/com.termux/files/usr/bin/sh|g'
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HUSKY_DIR = path.join(ROOT, '.husky');

const OLD_PATH = '/data/data/com.termux/files/usr/glibc/bin/sh';
const NEW_PATH = '/data/data/com.termux/files/usr/bin/sh';

function fixHuskyFiles() {
  if (!fs.existsSync(HUSKY_DIR)) {
    console.log('.husky directory not found, skipping');
    return;
  }

  // Recursively find all files in .husky
  function findFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  const huskyFiles = findFiles(HUSKY_DIR);

  for (const file of huskyFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(OLD_PATH)) {
        const fixed = content.replace(new RegExp(OLD_PATH, 'g'), NEW_PATH);
        fs.writeFileSync(file, fixed, 'utf8');
        console.log(`Fixed shell path in: ${file}`);
      }
    } catch (error) {
      // Skip files we can't read
    }
  }
}

fixHuskyFiles();
