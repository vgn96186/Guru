/**
 * Schemas — Zod-based single source of truth for data structures.
 * Export schemas for validation; derive types via z.infer.
 */
export {
  MoodSchema,
  ContentTypeSchema,
  TopicStatusSchema,
  SessionModeSchema,
  StudyResourceModeSchema,
  HarassmentToneSchema,
  GuruFrequencySchema,
  DailyLogSchema,
  type Mood,
  type ContentType,
  type TopicStatus,
  type SessionMode,
  type StudyResourceMode,
  type HarassmentTone,
  type GuruFrequency,
  type DailyLog,
} from './core';

export {
  QuizQuestionSchema,
  QuizContentSchema,
  KeyPointsContentSchema,
  FlashcardsContentSchema,
  LectureAnalysisSchema,
  type LectureAnalysis,
  type QuizContent,
  type KeyPointsContent,
  type FlashcardsContent,
} from './ai';
