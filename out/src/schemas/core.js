"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlashcardsContentSchema = exports.DailyLogSchema = exports.GuruFrequencySchema = exports.HarassmentToneSchema = exports.StudyResourceModeSchema = exports.SessionModeSchema = exports.TopicStatusSchema = exports.ContentTypeSchema = exports.MoodSchema = void 0;
/**
 * Core Zod schemas — single source of truth for data structures.
 * Derive TypeScript types via z.infer<typeof Schema>.
 */
var zod_1 = require("zod");
// ── Enums / Unions ─────────────────────────────────────────────────────────
exports.MoodSchema = zod_1.z.enum(['energetic', 'good', 'okay', 'tired', 'stressed', 'distracted']);
exports.ContentTypeSchema = zod_1.z.enum([
    'keypoints',
    'must_know',
    'quiz',
    'story',
    'mnemonic',
    'teach_back',
    'error_hunt',
    'detective',
    'manual',
    'socratic',
    'flashcards',
]);
exports.TopicStatusSchema = zod_1.z.enum(['unseen', 'seen', 'reviewed', 'mastered']);
exports.SessionModeSchema = zod_1.z.enum([
    'normal',
    'sprint',
    'gentle',
    'deep',
    'external',
    'warmup',
    'mcq_block',
]);
exports.StudyResourceModeSchema = zod_1.z.enum(['standard', 'btr', 'dbmci_live', 'hybrid']);
exports.HarassmentToneSchema = zod_1.z.enum(['shame', 'motivational', 'tough_love']);
exports.GuruFrequencySchema = zod_1.z.enum(['rare', 'normal', 'frequent', 'off']);
// ── Domain Objects ─────────────────────────────────────────────────────────
exports.DailyLogSchema = zod_1.z.object({
    date: zod_1.z.string(),
    checkedIn: zod_1.z.boolean(),
    mood: exports.MoodSchema.nullable(),
    totalMinutes: zod_1.z.number(),
    xpEarned: zod_1.z.number(),
    sessionCount: zod_1.z.number(),
});
exports.FlashcardsContentSchema = zod_1.z.object({
    type: zod_1.z.literal('flashcards'),
    topicName: zod_1.z.string(),
    cards: zod_1.z.array(zod_1.z.object({
        front: zod_1.z.string(),
        back: zod_1.z.string(),
        imageSearchQuery: zod_1.z.string().optional(),
        imageUrl: zod_1.z.string().optional(),
    })),
});
