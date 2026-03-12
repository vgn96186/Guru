import { z } from 'zod';

const KeyPointsSchema = z.object({
  type: z.literal('keypoints'),
  topicName: z.string(),
  points: z.array(z.string()),
  memoryHook: z.string()
});
const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.number(),
  explanation: z.string()
});
const QuizSchema = z.object({
  type: z.literal('quiz'),
  topicName: z.string(),
  questions: z.array(QuizQuestionSchema)
});
const StorySchema = z.object({
  type: z.literal('story'),
  topicName: z.string(),
  story: z.string(),
  keyConceptHighlights: z.array(z.string())
});
const MnemonicSchema = z.object({
  type: z.literal('mnemonic'),
  topicName: z.string(),
  mnemonic: z.string(),
  expansion: z.array(z.string()),
  tip: z.string()
});
const TeachBackSchema = z.object({
  type: z.literal('teach_back'),
  topicName: z.string(),
  prompt: z.string(),
  keyPointsToMention: z.array(z.string()),
  guruReaction: z.string()
});
const ErrorHuntSchema = z.object({
  type: z.literal('error_hunt'),
  topicName: z.string(),
  paragraph: z.string(),
  errors: z.array(z.object({ wrong: z.string(), correct: z.string(), explanation: z.string() }))
});
const DetectiveSchema = z.object({
  type: z.literal('detective'),
  topicName: z.string(),
  clues: z.array(z.string()),
  answer: z.string(),
  explanation: z.string()
});

export const AIContentSchema = z.union([
  KeyPointsSchema, QuizSchema, StorySchema, MnemonicSchema, TeachBackSchema, ErrorHuntSchema, DetectiveSchema
]);

export const AgendaSchema = z.object({
  selectedTopicIds: z.array(z.number()),
  focusNote: z.string(),
  guruMessage: z.string()
});

export const CatalystSchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  summary: z.string(),
  keyConcepts: z.array(z.string()),
  quiz: z.object({
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number(),
      explanation: z.string()
    }))
  })
});

export class RateLimitError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RateLimitError'; }
}
