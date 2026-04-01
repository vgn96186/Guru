import { z } from 'zod';

export const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.number().min(0).max(3),
  explanation: z.string(),
  imageSearchQuery: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const QuizContentSchema = z.object({
  type: z.literal('quiz'),
  topicName: z.string(),
  questions: z.array(QuizQuestionSchema),
});

export const KeyPointsContentSchema = z.object({
  type: z.literal('keypoints'),
  topicName: z.string(),
  points: z.array(z.string()),
  memoryHook: z.string(),
});

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

export const LectureAnalysisSchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  keyConcepts: z.array(z.string()),
  lectureSummary: z.string(),
  estimatedConfidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  transcript: z.string(),
  highYieldPoints: z.array(z.string()),
});

export type LectureAnalysis = z.infer<typeof LectureAnalysisSchema>;
export type QuizContent = z.infer<typeof QuizContentSchema>;
export type KeyPointsContent = z.infer<typeof KeyPointsContentSchema>;
export type FlashcardsContent = z.infer<typeof FlashcardsContentSchema>;
