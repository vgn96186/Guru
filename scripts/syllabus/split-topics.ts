/* eslint-disable no-console */
/**
 * One-shot codegen: read the current `TOPICS_SEED` array and emit one
 * compact JSON file per subject under `assets/syllabus/topics/<shortCode>.json`.
 *
 * Invariants this script preserves (checked by syllabus.unit.test.ts):
 *   1. The concatenation of all per-subject JSON arrays, in SUBJECTS_SEED
 *      displayOrder, equals TOPICS_SEED exactly (tuple-for-tuple).
 *   2. Tuples of length 4 stay length 4 (trailing `undefined` parent stripped).
 *   3. JSON uses compact per-row formatting so humans can read/diff it.
 *
 * Run:
 *   npx ts-node --transpile-only scripts/syllabus/split-topics.ts
 *
 * Output:
 *   assets/syllabus/topics/<shortCode>.json   (one per subject)
 *   assets/syllabus/manifest.json             (counts + totals)
 */
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { SUBJECTS_SEED } from '../../src/constants/syllabus/subjects';
import { TOPICS_SEED } from '../../src/constants/syllabus';
import type { TopicSeed } from '../../src/constants/syllabus/types';

const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'assets', 'syllabus', 'topics');
const MANIFEST_PATH = join(REPO_ROOT, 'assets', 'syllabus', 'manifest.json');

mkdirSync(OUT_DIR, { recursive: true });

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Strip a trailing `undefined` parent so 4-tuples stay 4-tuples in JSON. */
function normalize(tuple: TopicSeed): TopicSeed {
  if (tuple.length === 5 && tuple[4] === undefined) {
    return [tuple[0], tuple[1], tuple[2], tuple[3]] as TopicSeed;
  }
  return tuple;
}

/** Compact multi-line JSON: one tuple per line for diff-friendly output. */
function formatJsonArray(tuples: TopicSeed[]): string {
  if (tuples.length === 0) return '[]\n';
  const lines = tuples.map((t) => '  ' + JSON.stringify(t));
  return '[\n' + lines.join(',\n') + '\n]\n';
}

// Group, preserving original order within each subject AND recording the
// order in which each subject first appears in TOPICS_SEED. The source
// happens to be strictly subject-grouped but NOT by displayOrder
// (e.g. subject 8 precedes subject 7 in the file).
const bySubject = new Map<number, TopicSeed[]>();
const subjectEmissionOrder: number[] = [];
for (const tuple of TOPICS_SEED) {
  const normalized = normalize(tuple);
  if (!bySubject.has(normalized[0])) {
    bySubject.set(normalized[0], []);
    subjectEmissionOrder.push(normalized[0]);
  }
  bySubject.get(normalized[0])!.push(normalized);
}

const subjectById = new Map(SUBJECTS_SEED.map((s) => [s.id, s]));
const orderedSubjects = subjectEmissionOrder.map((id) => {
  const s = subjectById.get(id);
  if (!s) throw new Error(`TOPICS_SEED references unknown subject id ${id}`);
  return s;
});

// Write per-subject files + compute a reconstruction hash.
const reconstructed: TopicSeed[] = [];
const counts: Record<string, number> = {};

for (const subj of orderedSubjects) {
  const tuples = bySubject.get(subj.id) ?? [];
  const filename = subj.shortCode.toLowerCase() + '.json';
  const target = join(OUT_DIR, filename);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, formatJsonArray(tuples));
  counts[subj.shortCode] = tuples.length;
  reconstructed.push(...tuples);
  console.log(`  wrote ${filename.padEnd(10)} ${tuples.length} topics`);
}

// Sanity: reconstruction MUST match the original TOPICS_SEED byte-for-byte
// (after normalizing away trailing undefined).
const normalizedOriginal = TOPICS_SEED.map(normalize);
const originalHash = sha256(normalizedOriginal);
const reconstructedHash = sha256(reconstructed);
if (originalHash !== reconstructedHash) {
  console.error('FATAL: reconstruction hash mismatch');
  console.error(`  original:      ${originalHash}`);
  console.error(`  reconstructed: ${reconstructedHash}`);
  process.exit(1);
}

// Manifest.
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  tupleShape: '[subject_id, name, inicet_priority, estimated_minutes, parent_name?]',
  subjectOrder: orderedSubjects.map((s) => s.shortCode),
  counts,
  totalCount: reconstructed.length,
  reconstructedHash,
};
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(`\n  total: ${reconstructed.length} topics, hash ${reconstructedHash.slice(0, 12)}…`);
console.log(`  manifest: ${MANIFEST_PATH}`);
