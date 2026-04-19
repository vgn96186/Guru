/**
 * Characterization test for the syllabus seed data.
 *
 * Purpose: lock down the exact shape and contents of SUBJECTS_SEED and
 * TOPICS_SEED so that the forthcoming refactor (splitting the monolith
 * into per-subject JSON assets) cannot silently lose or reorder data.
 *
 * First-run workflow:
 *   UPDATE_SYLLABUS_SNAPSHOT=1 npx jest --config jest.unit.config.js \
 *     src/constants/syllabus.unit.test.ts
 * That populates `syllabus.snapshot.json`. Commit it. Subsequent runs
 * MUST match byte-for-byte until the syllabus is intentionally edited.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { SUBJECTS_SEED, TOPICS_SEED } from './syllabus';

const FIXTURE_PATH = join(__dirname, 'syllabus.snapshot.json');

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function computeFingerprint() {
  const perSubjectCounts: Record<string, number> = {};
  let topicsWithParent = 0;
  for (const tuple of TOPICS_SEED) {
    const subjectId = String(tuple[0]);
    perSubjectCounts[subjectId] = (perSubjectCounts[subjectId] ?? 0) + 1;
    if (tuple[4] !== undefined) topicsWithParent += 1;
  }
  return {
    subjectsCount: SUBJECTS_SEED.length,
    subjectsHash: sha256(SUBJECTS_SEED),
    topicsCount: TOPICS_SEED.length,
    topicsHash: sha256(TOPICS_SEED),
    topicsWithParent,
    perSubjectCounts,
    firstTuple: TOPICS_SEED[0],
    lastTuple: TOPICS_SEED[TOPICS_SEED.length - 1],
  };
}

describe('syllabus seed characterization', () => {
  const fingerprint = computeFingerprint();

  it('matches the committed snapshot', () => {
    if (process.env.UPDATE_SYLLABUS_SNAPSHOT === '1') {
      writeFileSync(FIXTURE_PATH, JSON.stringify(fingerprint, null, 2) + '\n');
      console.warn(`[syllabus.snapshot] wrote ${FIXTURE_PATH}`);
      return;
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    const expected = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    expect(fingerprint).toEqual(expected);
  });

  it('has 19 subjects with unique ids and shortCodes', () => {
    const ids = new Set(SUBJECTS_SEED.map((s) => s.id));
    const codes = new Set(SUBJECTS_SEED.map((s) => s.shortCode));
    expect(SUBJECTS_SEED).toHaveLength(19);
    expect(ids.size).toBe(19);
    expect(codes.size).toBe(19);
  });

  it('every topic references a known subject id', () => {
    const subjectIds = new Set(SUBJECTS_SEED.map((s) => s.id));
    const orphans = TOPICS_SEED.filter((t) => !subjectIds.has(t[0]));
    expect(orphans).toEqual([]);
  });

  it('every parent_name, when present, exists as a topic in the same subject', () => {
    const nameBySubject = new Map<number, Set<string>>();
    for (const [sid, name] of TOPICS_SEED) {
      if (!nameBySubject.has(sid)) nameBySubject.set(sid, new Set());
      nameBySubject.get(sid)!.add(name);
    }
    const dangling: Array<[number, string, string]> = [];
    for (const tuple of TOPICS_SEED) {
      const parent = tuple[4];
      if (!parent) continue;
      if (!nameBySubject.get(tuple[0])?.has(parent)) {
        dangling.push([tuple[0], tuple[1], parent]);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('tuple shapes are well-formed: [number, string, number, number, string?]', () => {
    for (const t of TOPICS_SEED) {
      expect(typeof t[0]).toBe('number');
      expect(typeof t[1]).toBe('string');
      expect(typeof t[2]).toBe('number');
      expect(typeof t[3]).toBe('number');
      expect(t[4] === undefined || typeof t[4] === 'string').toBe(true);
      expect(t.length === 4 || t.length === 5).toBe(true);
    }
  });
});
