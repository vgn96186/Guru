'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.LectureAnalysisSchema =
  exports.FlashcardsContentSchema =
  exports.KeyPointsContentSchema =
  exports.QuizContentSchema =
  exports.QuizQuestionSchema =
    void 0;
var zod_1 = require('zod');
exports.QuizQuestionSchema = zod_1.z.object({
  question: zod_1.z.string(),
  options: zod_1.z.tuple([zod_1.z.string(), zod_1.z.string(), zod_1.z.string(), zod_1.z.string()]),
  correctIndex: zod_1.z.number().min(0).max(3),
  explanation: zod_1.z.string(),
  imageSearchQuery: zod_1.z.string().optional(),
  imageUrl: zod_1.z.string().optional(),
});
exports.QuizContentSchema = zod_1.z.object({
  type: zod_1.z.literal('quiz'),
  topicName: zod_1.z.string(),
  questions: zod_1.z.array(exports.QuizQuestionSchema),
});
exports.KeyPointsContentSchema = zod_1.z.object({
  type: zod_1.z.literal('keypoints'),
  topicName: zod_1.z.string(),
  points: zod_1.z.array(zod_1.z.string()),
  memoryHook: zod_1.z.string(),
});
exports.FlashcardsContentSchema = zod_1.z.object({
  type: zod_1.z.literal('flashcards'),
  topicName: zod_1.z.string(),
  cards: zod_1.z.array(
    zod_1.z.object({
      front: zod_1.z.string(),
      back: zod_1.z.string(),
      imageSearchQuery: zod_1.z.string().optional(),
      imageUrl: zod_1.z.string().optional(),
    }),
  ),
});
exports.LectureAnalysisSchema = zod_1.z.object({
  subject: zod_1.z.string(),
  topics: zod_1.z.array(zod_1.z.string()),
  keyConcepts: zod_1.z.array(zod_1.z.string()),
  lectureSummary: zod_1.z.string(),
  estimatedConfidence: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(2), zod_1.z.literal(3)]),
  transcript: zod_1.z.string(),
  highYieldPoints: zod_1.z.array(zod_1.z.string()),
});
