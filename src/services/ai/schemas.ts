import { z } from 'zod';

const KeyPointsSchema = z.object({
  type: z.literal('keypoints').describe('Discriminator for keypoints card'),
  topicName: z.string().describe('Topic title aligned with the in-app syllabus'),
  points: z.array(z.string()).describe('3–8 short bullet facts; exam-relevant only'),
  memoryHook: z.string().describe('One memorable hook or analogy'),
});
const MustKnowSchema = z.object({
  type: z.literal('must_know').describe('Discriminator for must-know card'),
  topicName: z.string().describe('Topic title aligned with the in-app syllabus'),
  mustKnow: z.array(z.string()).describe('Short must-recall exam facts'),
  mostTested: z.array(z.string()).describe('Short repeatedly tested exam facts'),
  examTip: z.string().describe('One tactical exam-day tip for this topic'),
});
const QuizQuestionSchema = z.object({
  question: z.string().describe('Single best-answer stem'),
  options: z
    .tuple([z.string(), z.string(), z.string(), z.string()])
    .describe('Exactly four options'),
  correctIndex: z.number().describe('0–3 index into options'),
  explanation: z.string().describe('Why the correct option is right'),
  imageSearchQuery: z
    .string()
    .optional()
    .describe('Search query to fetch a relevant medical image for this question'),
  imageUrl: z
    .string()
    .optional()
    .describe('Direct https image URL when known; otherwise omit and use imageSearchQuery'),
});
const QuizSchema = z.object({
  type: z.literal('quiz').describe('Discriminator for quiz card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  questions: z.array(QuizQuestionSchema).describe('Typically 3–5 MCQs'),
});
const StorySchema = z.object({
  type: z.literal('story').describe('Discriminator for story card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  story: z.string().describe('Short clinical narrative embedding the concepts'),
  keyConceptHighlights: z.array(z.string()).describe('Bold-worthy takeaways from the story'),
});
const MnemonicSchema = z.object({
  type: z.literal('mnemonic').describe('Discriminator for mnemonic card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  mnemonic: z.string().describe('The mnemonic itself'),
  expansion: z.array(z.string()).describe('What each letter or chunk means'),
  tip: z.string().describe('How to recall it under exam pressure'),
});
const TeachBackSchema = z.object({
  type: z.literal('teach_back').describe('Discriminator for teach-back card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  prompt: z.string().describe('What the student should explain aloud'),
  keyPointsToMention: z.array(z.string()).describe('Facts their answer should touch'),
  guruReaction: z.string().describe('Brief encouraging feedback template'),
});
const ErrorHuntSchema = z.object({
  type: z.literal('error_hunt').describe('Discriminator for error hunt card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  paragraph: z.string().describe('Paragraph containing deliberate mistakes'),
  errors: z
    .array(z.object({ wrong: z.string(), correct: z.string(), explanation: z.string() }))
    .describe('Each embedded error and fix'),
});
const DetectiveSchema = z.object({
  type: z.literal('detective').describe('Discriminator for detective card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  clues: z.array(z.string()).describe('Ordered hints toward the diagnosis'),
  answer: z.string().describe('Final diagnosis or key entity'),
  explanation: z.string().describe('Short teaching wrap-up'),
});

const SocraticSchema = z.object({
  type: z.literal('socratic').describe('Discriminator for Socratic drill card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  questions: z.array(
    z.object({
      question: z.string().describe('One focused question'),
      answer: z.string().describe('Model answer'),
      whyItMatters: z.string().describe('Exam or clinical relevance'),
    }),
  ),
});

const FlashcardSchema = z.object({
  front: z.string().describe('Short question or prompt'),
  back: z.string().describe('Short high-yield answer'),
  imageSearchQuery: z
    .string()
    .optional()
    .describe('Optional search query for a relevant reference image on visual topics'),
  imageUrl: z
    .string()
    .optional()
    .describe('Direct https image URL when known; otherwise omit and use imageSearchQuery'),
});

/** Some models interleave stray strings in `cards[]`; keep only valid card objects. */
function normalizeAiFlashcardsCards(
  raw: unknown,
): Array<{ front: string; back: string; imageSearchQuery?: string; imageUrl?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    front: string;
    back: string;
    imageSearchQuery?: string;
    imageUrl?: string;
  }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    let front: unknown = o.front;
    let back: unknown = o.back;
    if (
      (front === undefined || front === null || (typeof front === 'string' && !front.trim())) &&
      typeof o.question === 'string'
    ) {
      front = o.question;
    }
    if (
      (back === undefined || back === null || (typeof back === 'string' && !back.trim())) &&
      typeof o.answer === 'string'
    ) {
      back = o.answer;
    }
    if (typeof front !== 'string' || typeof back !== 'string') continue;
    const ft = front.trim();
    const bt = back.trim();
    if (!ft || !bt) continue;
    const imageSearchQuery =
      typeof o.imageSearchQuery === 'string' && o.imageSearchQuery.trim()
        ? o.imageSearchQuery.trim()
        : undefined;
    const imageUrl =
      typeof o.imageUrl === 'string' && o.imageUrl.trim() ? o.imageUrl.trim() : undefined;
    out.push({ front: ft, back: bt, imageSearchQuery, imageUrl });
  }
  return out;
}

const FlashcardsSchema = z.object({
  type: z.literal('flashcards').describe('Discriminator for flashcards card'),
  topicName: z.string().describe('Topic title aligned with the syllabus'),
  cards: z
    .unknown()
    .transform((v) => normalizeAiFlashcardsCards(v))
    .pipe(z.array(FlashcardSchema).min(1).describe('Typically 6-10 cards')),
});

const ManualSchema = z.object({
  type: z.literal('manual').describe('Discriminator for manual card'),
  topicName: z.string().describe('Topic title'),
});

export const AIContentSchema = z.discriminatedUnion('type', [
  KeyPointsSchema,
  MustKnowSchema,
  QuizSchema,
  StorySchema,
  MnemonicSchema,
  TeachBackSchema,
  ErrorHuntSchema,
  DetectiveSchema,
  SocraticSchema,
  FlashcardsSchema,
  ManualSchema,
]);

export const AgendaSchema = z.object({
  selectedTopicIds: z.array(z.number()).describe('Leaf topic ids from the syllabus'),
  focusNote: z.string().describe('One-line focus for the session'),
  guruMessage: z.string().describe('Short coach message to the student'),
});

export const DailyAgendaSchema = z.object({
  blocks: z.array(
    z.object({
      id: z.string().describe('Stable id for UI keys'),
      title: z.string().describe('Block label shown in the plan'),
      topicIds: z
        .array(z.union([z.number(), z.string()]))
        .describe('Syllabus topic ids; strings may be coerced to numbers')
        .transform((val) =>
          val
            .map((v) => (typeof v === 'string' ? parseInt(v.replace(/[^0-9]/g, ''), 10) || 0 : v))
            .filter((v) => v > 0),
        ),
      durationMinutes: z.number().describe('Planned minutes for this block'),
      startTime: z.string().optional().describe('Optional HH:MM or similar'),
      type: z.enum(['study', 'review', 'test', 'break']),
      why: z.string().describe('Why this block is in the plan'),
    }),
  ),
  guruNote: z.string().describe('Overall tone or reminder for the day'),
  prioritySubjectId: z.number().optional().describe('When one subject should dominate'),
});

export const CatalystSchema = z.object({
  subject: z.string().describe('Primary medical subject for the lecture'),
  topics: z.array(z.string()).describe('Specific topic names mentioned'),
  summary: z.string().describe('Two-line high-yield summary'),
  keyConcepts: z.array(z.string()).describe('Short phrases, exam-oriented'),
  quiz: z.object({
    questions: z.array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).describe('Typically four options'),
        correctIndex: z.number().describe('0-based index into options'),
        explanation: z.string(),
      }),
    ),
  }),
});

export class RateLimitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RateLimitError';
  }
}
