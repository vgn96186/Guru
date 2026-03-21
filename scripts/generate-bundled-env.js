const fs = require('fs');
const path = require('path');

function parseEnvFile(envText) {
  const out = {};
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    // Strip simple surrounding quotes: KEY="value" / KEY='value'
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function escapeForSingleQuotes(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const envPath = path.join(repoRoot, '.env');
  const outPath = path.join(repoRoot, 'src', 'config', 'bundledEnv.ts');

  let env = {};
  try {
    const envText = fs.readFileSync(envPath, 'utf8');
    env = parseEnvFile(envText);
  } catch {
    // .env may be missing on CI; we still write a valid module with empty strings.
  }

  const bundledGroq = (env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '').trim();
  const bundledHf = (env.EXPO_PUBLIC_BUNDLED_HF_TOKEN ?? '').trim();
  const bundledOpenrouter = (env.EXPO_PUBLIC_BUNDLED_OPENROUTER_KEY ?? '').trim();
  const bundledGemini = (env.EXPO_PUBLIC_BUNDLED_GEMINI_KEY ?? '').trim();
  const bundledCloudflareAccountId = (env.EXPO_PUBLIC_BUNDLED_CF_ACCOUNT_ID ?? '').trim();
  const bundledCloudflareApiToken = (env.EXPO_PUBLIC_BUNDLED_CF_API_TOKEN ?? '').trim();

  const content = `/**
 * Auto-generated from .env by scripts/generate-bundled-env.js
 * This module allows "bundled defaults" to work in non-Expo (bare RN) builds.
 */
export const BUNDLED_GROQ_KEY = '${escapeForSingleQuotes(bundledGroq)}';
export const BUNDLED_HF_TOKEN = '${escapeForSingleQuotes(bundledHf)}';
export const BUNDLED_OPENROUTER_KEY = '${escapeForSingleQuotes(bundledOpenrouter)}';
export const BUNDLED_GEMINI_KEY = '${escapeForSingleQuotes(bundledGemini)}';
export const BUNDLED_CF_ACCOUNT_ID = '${escapeForSingleQuotes(bundledCloudflareAccountId)}';
export const BUNDLED_CF_API_TOKEN = '${escapeForSingleQuotes(bundledCloudflareApiToken)}';
`;

  fs.writeFileSync(outPath, content, 'utf8');
  // Helpful for local debugging; safe in CI logs.
  if (!bundledGroq && !bundledHf) {
    console.warn('[generate-bundled-env] Wrote empty bundled keys (missing .env values).');
  }
}

main();
