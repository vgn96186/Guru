/**
 * TOPICS_SEED — reconstructed from 19 per-subject JSON files under
 * `assets/syllabus/topics/`. Concatenation order matches the original
 * `src/constants/syllabus.ts` emission order (which is subject-grouped
 * but NOT sorted by displayOrder — subject 8 precedes 7, etc.).
 *
 * The SHA256 of `JSON.stringify(TOPICS_SEED)` MUST equal the value
 * committed in `src/constants/syllabus.snapshot.json`. Enforced by
 * `src/constants/syllabus.unit.test.ts`. Regenerate via:
 *   npx ts-node --transpile-only --compiler-options \
 *     '{"module":"commonjs","rootDir":"."}' scripts/syllabus/split-topics.ts
 */
import type { TopicSeed } from './types';

import anat from '../../../assets/syllabus/topics/anat.json';
import phys from '../../../assets/syllabus/topics/phys.json';
import bioc from '../../../assets/syllabus/topics/bioc.json';
import path from '../../../assets/syllabus/topics/path.json';
import micr from '../../../assets/syllabus/topics/micr.json';
import phar from '../../../assets/syllabus/topics/phar.json';
import med from '../../../assets/syllabus/topics/med.json';
import fmt from '../../../assets/syllabus/topics/fmt.json';
import surg from '../../../assets/syllabus/topics/surg.json';
import obg from '../../../assets/syllabus/topics/obg.json';
import peds from '../../../assets/syllabus/topics/peds.json';
import orth from '../../../assets/syllabus/topics/orth.json';
import opth from '../../../assets/syllabus/topics/opth.json';
import ent from '../../../assets/syllabus/topics/ent.json';
import psy from '../../../assets/syllabus/topics/psy.json';
import derm from '../../../assets/syllabus/topics/derm.json';
import radi from '../../../assets/syllabus/topics/radi.json';
import anes from '../../../assets/syllabus/topics/anes.json';
import psm from '../../../assets/syllabus/topics/psm.json';

// Order matches `assets/syllabus/manifest.json#subjectOrder` and the
// original in-file emission order of the legacy `syllabus.ts` monolith.
export const TOPICS_SEED: TopicSeed[] = ([] as TopicSeed[]).concat(
  anat as TopicSeed[],
  phys as TopicSeed[],
  bioc as TopicSeed[],
  path as TopicSeed[],
  micr as TopicSeed[],
  phar as TopicSeed[],
  med as TopicSeed[],
  fmt as TopicSeed[],
  surg as TopicSeed[],
  obg as TopicSeed[],
  peds as TopicSeed[],
  orth as TopicSeed[],
  opth as TopicSeed[],
  ent as TopicSeed[],
  psy as TopicSeed[],
  derm as TopicSeed[],
  radi as TopicSeed[],
  anes as TopicSeed[],
  psm as TopicSeed[],
);
