/**
 * Core Zod schemas — single source of truth for data structures.
 * Derive TypeScript types via z.infer<typeof Schema>.
 */
import { z } from 'zod';

// ── Enums / Unions ─────────────────────────────────────────────────────────

export const MoodSchema = z.enum(['energetic', 'good', 'okay', 'tired', 'stressed', 'distracted']);
export type Mood = z.infer<typeof MoodSchema>;

export const ContentTypeSchema = z.enum([
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
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const TopicStatusSchema = z.enum(['unseen', 'seen', 'reviewed', 'mastered']);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

export const SessionModeSchema = z.enum([
  'normal',
  'sprint',
  'gentle',
  'deep',
  'external',
  'warmup',
  'mcq_block',
]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

export const StudyResourceModeSchema = z.enum(['standard', 'btr', 'dbmci_live', 'hybrid']);
export type StudyResourceMode = z.infer<typeof StudyResourceModeSchema>;

export const HarassmentToneSchema = z.enum(['shame', 'motivational', 'tough_love']);
export type HarassmentTone = z.infer<typeof HarassmentToneSchema>;

export const GuruFrequencySchema = z.enum(['rare', 'normal', 'frequent', 'off']);
export type GuruFrequency = z.infer<typeof GuruFrequencySchema>;

// ── Domain Objects ─────────────────────────────────────────────────────────

export const DailyLogSchema = z.object({
  date: z.string(),
  checkedIn: z.boolean(),
  mood: MoodSchema.nullable(),
  totalMinutes: z.number(),
  xpEarned: z.number(),
  sessionCount: z.number(),
});
export type DailyLog = z.infer<typeof DailyLogSchema>;

export const FlashcardsContentSchema = z.object({
  type: z.literal('flashcards'),
  topicName: z.string(),
  cards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      imageSearchQuery: z.string().optional(),
      imageUrl: z.string().optional(),
    }),
  ),
});
export type FlashcardsContent = z.infer<typeof FlashcardsContentSchema>;
