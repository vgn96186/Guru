'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TOPICS_SEED = exports.SUBJECTS_SEED = void 0;
/**
 * Canonical syllabus-seed barrel. Consumers should do:
 *   import { SUBJECTS_SEED, TOPICS_SEED } from '../constants/syllabus';
 * which resolves here once the legacy `syllabus.ts` file is removed.
 */
var subjects_1 = require('./subjects');
Object.defineProperty(exports, 'SUBJECTS_SEED', {
  enumerable: true,
  get: function () {
    return subjects_1.SUBJECTS_SEED;
  },
});
var topics_1 = require('./topics');
Object.defineProperty(exports, 'TOPICS_SEED', {
  enumerable: true,
  get: function () {
    return topics_1.TOPICS_SEED;
  },
});
