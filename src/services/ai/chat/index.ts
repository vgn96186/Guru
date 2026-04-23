import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../../constants/prompts';
import type { MedicalGroundingSource, Message, GroundedGuruResponse } from '../types';
import { profileRepository } from '../../../db/repositories/profileRepository';
import { createGuruFallbackModel } from '../v2/providers/guruFallback';
import { generateObject } from '../v2/generateObject';
import { generateText } from '../v2/generateText';
import type { ModelMessage } from '../v2/spec';
import {
  searchMedicalImages,
  generateImageSearchQuery,
  generateVisualSearchQueries,
  dedupeGroundingSources,
  buildMedicalSearchQuery,
} from '../medicalSearch';
import { clampMessagesToCharBudget } from '../providers/utils';
import { streamGroundedTurn } from '../grounding';

import { buildHistoryMessages, extractRecentGuruQuestions } from './history';
import { detectStudentIntent } from './intent';
import {
  buildIntentInstruction,
  buildGuruSystemPrompt,
  GURU_ADHD_FORMATTING_RULES,
} from './prompts';
import { finalizeGuruReply, looksTruncatedReply } from './postprocess';
import {
  hasUsefulContinuation,
  buildContinuationMessages,
  appendContinuation,
} from './continuation';
import { buildImageSearchSeed, isRenderableReferenceImageUrl } from './imageSeed';

const MAX_CONTINUATION_ATTEMPTS = 4;

function toModelMessages(msgs: Message[]): ModelMessage[] {
  return msgs.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }));
}

async function buildChatModel(
  textMode = true,
): Promise<ReturnType<typeof createGuruFallbackModel>> {
  const profile = await profileRepository.getProfile();
  return createGuruFallbackModel({ profile, textMode });
}

export async function chatWithGuru(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
  studyContext?: string,
): Promise<{ reply: string }> {
  const recentGuruQuestions = extractRecentGuruQuestions(history);
  const studentIntent = detectStudentIntent(question);
  const contextPrompt = `Topic: ${topicName}${
    studyContext ? `\n\nStudy context:\n${studyContext}` : ''
  }\n\n${buildIntentInstruction(
    studentIntent,
  )}\nInstruction: Prioritize exam-relevant high-yield concepts, but first repair foundational gaps. If prerequisite concepts are missing, explain those first in plain language.`;
  const systemPrompt = buildGuruSystemPrompt({ includeStudyContext: true });
  const finalizeOpts = {
    recentQuestions: recentGuruQuestions,
    studentIntent,
    studentQuestion: question,
  };
  const msgs: Message[] = clampMessagesToCharBudget(
    [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: contextPrompt },
      ...buildHistoryMessages(history, 4),
      { role: 'user', content: question },
    ],
    24000,
    'chatWithGuru',
  );
  const model = await buildChatModel();
  const { text } = await generateText({ model, messages: toModelMessages(msgs) });
  let finalReply = finalizeGuruReply(text, finalizeOpts);
  for (let attempt = 1; attempt <= MAX_CONTINUATION_ATTEMPTS; attempt += 1) {
    if (!looksTruncatedReply(finalReply)) break;
    if (__DEV__) {
      console.warn('[GuruStudyChat] Reply appears truncated, requesting continuation.', {
        attempt,
        maxAttempts: MAX_CONTINUATION_ATTEMPTS,
        chars: finalReply.length,
      });
    }
    const continuation = await generateText({
      model,
      messages: toModelMessages(buildContinuationMessages(msgs, finalReply)),
    });
    const continuationText = finalizeGuruReply(continuation.text, finalizeOpts);
    if (!hasUsefulContinuation(finalReply, continuationText)) break;
    const appended = appendContinuation(finalReply, continuationText);
    if (appended.length <= finalReply.length) break;
    finalReply = appended;
  }
  return {
    reply: finalizeGuruReply(finalReply, finalizeOpts),
  };
}

export async function chatWithGuruGrounded(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
): Promise<GroundedGuruResponse> {
  const trimmedQuestion = question.replace(/\s+/g, ' ').trim();
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, topicName);
  const recentGuruQuestions = extractRecentGuruQuestions(history);

  // Use the modular grounding system with tools
  // The LLM decides when to search via the search_medical tool
  const result = await streamGroundedTurn({
    caller: 'chatWithGuruGrounded',
    question: trimmedQuestion,
    topicName,
    history,
    chosenModel,
    allowImages: false, // Non-streaming version doesn't support images
    finalizeReply: (text) => finalizeGuruReply(text, recentGuruQuestions),
  });

  return {
    reply: result.text,
    sources: result.sources,
    modelUsed: result.modelUsed,
    searchQuery,
  };
}

export type GuruChatMemoryContext = {
  /** Rolling summary of earlier turns in this thread (SQLite). */
  sessionSummary?: string;
  /** Structured tutoring state carried across turns (SQLite). */
  stateJson?: string;
  /** Optional facts the student saved in Settings (exam goals, weak subjects, etc.). */
  profileNotes?: string;
  /** Bounded FSRS/review + exam countdown line from DB (see `buildBoundedGuruChatStudyContext`). */
  studyContext?: string;
  /** Syllabus `topics.id` when navigation provided it (disambiguation / grounding). */
  syllabusTopicId?: number;
  /** Optional local context from the user's own saved notes/transcripts. */
  groundingContext?: string;
  groundingTitle?: string;
};

/** Grounded Guru chat with SSE-style token deltas for cloud routes (local emits once at end).
 * Uses modular grounding system with tools - LLM decides when to search.
 */
export async function chatWithGuruGroundedStreaming(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel: string | undefined,
  onReplyDelta: (delta: string) => void,
  memoryContext?: GuruChatMemoryContext,
): Promise<GroundedGuruResponse> {
  const trimmedQuestion = question.replace(/\s+/g, ' ').trim();
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, topicName);
  const imageSeed = buildImageSearchSeed(trimmedQuestion, topicName, history);
  const recentGuruQuestions = extractRecentGuruQuestions(history);
  const studentIntent = detectStudentIntent(trimmedQuestion);

  // Image search for reference images (kept outside tool system for now)
  let referenceImages: MedicalGroundingSource[] = [];
  if (imageSeed) {
    const imageQuery = await generateImageSearchQuery(imageSeed.topic, imageSeed.context);
    if (imageQuery) {
      const imageResult = await Promise.allSettled([searchMedicalImages(imageQuery, 3)]);
      const initialImages = imageResult[0]?.status === 'fulfilled' ? imageResult[0].value : [];
      if (initialImages.length === 0) {
        const visualQueries = await generateVisualSearchQueries(imageSeed.topic);
        const smartResults = await Promise.allSettled(
          visualQueries.map((vq) => searchMedicalImages(vq, 2)),
        );
        const smartImages = dedupeGroundingSources(
          smartResults
            .filter(
              (r): r is PromiseFulfilledResult<MedicalGroundingSource[]> =>
                r.status === 'fulfilled',
            )
            .flatMap((r) => r.value),
        );
        referenceImages = smartImages
          .filter((image) => isRenderableReferenceImageUrl(image.imageUrl))
          .slice(0, 3);
      } else {
        referenceImages = initialImages
          .filter((image) => isRenderableReferenceImageUrl(image.imageUrl))
          .slice(0, 3);
      }
    }
  }

  // Use modular grounding system - LLM decides when to search via tools
  const finalizeOpts = {
    recentQuestions: recentGuruQuestions,
    studentIntent,
    blockedConcepts: [] as string[],
    studentQuestion: trimmedQuestion,
  };

  const result = await streamGroundedTurn({
    caller: 'chatWithGuruGroundedStreaming',
    question: trimmedQuestion,
    topicName,
    subjectName: memoryContext?.groundingTitle,
    syllabusTopicId: memoryContext?.syllabusTopicId,
    history,
    chosenModel,
    allowImages: true,
    memoryContext,
    onReplyDelta,
    finalizeReply: (text) => finalizeGuruReply(text, finalizeOpts),
  });

  return {
    reply: result.text,
    sources: result.sources,
    referenceImages,
    modelUsed: result.modelUsed,
    searchQuery,
  };
}

export async function askGuru(question: string, context: string): Promise<string> {
  const schema = z.object({ feedback: z.string(), score: z.number(), missed: z.array(z.string()) });
  const messages: Message[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}
Respond as Guru evaluating a student's answer.
Output JSON only: { "feedback": "...", "score": 0-5, "missed": ["key point missed"] }

Formatting rules:
- Write "feedback" as concise markdown-friendly teaching text.
- Use markdown bolding (**term**) only for the 3 or 4 most important medical terms, mechanisms, or mistakes.
- Keep normal text plain.
- "missed" items may also include brief markdown bolding for the core term.`,
    },
    { role: 'user', content: `Context: ${context}\n\nStudent answer: ${question}` },
  ];
  const model = await buildChatModel();
  const { object } = await generateObject({ model, messages: toModelMessages(messages), schema });
  return JSON.stringify(object);
}

export async function explainMostTestedRationale(
  point: string,
  topicName: string,
): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a warm NEET-PG/INICET medical tutor.
Explain why a point is "most tested/high-yield" for exams.
Follow these output constraints exactly:
${GURU_ADHD_FORMATTING_RULES}
Never output JSON.`,
    },
    {
      role: 'user',
      content: `Topic: ${topicName}
Point: ${point}

Write 2-3 concise sentences that explain WHY this is high-yield.
You MUST include all three:
1) Clinical prevalence/common exam frequency
2) Management shift or treatment implication (e.g., surgery vs radiotherapy/chemoradiation when relevant)
3) Prognostic significance versus earlier/less severe disease

If one dimension is not applicable, state that briefly but still cover the other two.
Do not just restate the definition.`,
    },
  ];
  const model = await buildChatModel();
  const { text } = await generateText({ model, messages: toModelMessages(messages) });
  return text.trim();
}

/**
 * Generate a structured deeper explanation for a quiz question.
 * Returns plain markdown text (not JSON) suitable for direct rendering.
 */
export async function explainTopicDeeper(
  topicName: string,
  question: string,
  correctAnswer: string,
  originalExplanation: string,
): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a warm medical tutor for NEET-PG/INICET students. Explain concepts clearly using markdown formatting. Follow these output constraints exactly:
${GURU_ADHD_FORMATTING_RULES}
Never use raw escape characters like \\n in your output.`,
    },
    {
      role: 'user',
      content: `The student doesn’t understand a quiz question about “${topicName}”. Your TOP priority is to teach the broader underlying concept the question is testing (not just justify the correct option).

**Question:** ${question}
**Correct answer:** ${correctAnswer}
**Original explanation:** ${originalExplanation}

Write the answer using this structure (use real facts, no placeholders). Spend MOST of your words on (1) and (2):

1) **Broader topic in plain language** (2-4 short bullets)
- Define the concept + the clinical frame (what it is, where it applies).
- Include the 2-3 highest-yield facts that let someone solve *new* variants of the question.

2) **Mental model / how to reason** (2-4 short bullets)
- “If you see X → think Y → choose Z” style rules.
- Mention the single most common exam trap.

3) **If this is about a classification/staging system** (FIGO/TNM/staging/grades):
- You MUST explicitly list the relevant stages/grades in compact bullets (no tables).
- Example format (adapt to the exact system being asked):
  - **Stage I**: ...
  - **Stage II**: ...
  - **Stage III**: ...
  - **Stage IV**: ...

4) **Why the correct answer is correct** (2-4 short bullets)

5) **Common traps / how exams twist it** (2-4 short bullets)

6) **Treatment / management implication** (1-3 short bullets, only what’s exam-relevant)

7) **Key Takeaways** (exactly 3 bullet points)
- The single most important fact an examiner wants you to know.
- The most common wrong answer and why students choose it.
- One sentence connecting pathophysiology → presentation → management.

8) **Check your understanding** (one line — a simple question the student should be able to answer now)
Format exactly as: “Quick check: [question]? ||[answer]||”
The answer goes between || markers so it can be revealed on tap.

Constraints:
- No tables.
- Keep it under ~400 words.
- Bold only the most important 4-6 terms total.`,
    },
  ];
  const model = await buildChatModel();
  const { text } = await generateText({ model, messages: toModelMessages(messages) });
  return text.trim();
}

/**
 * Explain a specific medical concept, sign, or lab value mentioned in a quiz question.
 * Returns 2-3 short markdown bullet points — ideal for inline tap-to-expand explanations.
 */
export async function explainQuizConcept(concept: string, topicContext: string): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a concise NEET-PG medical tutor. Give sharp, exam-focused facts only.
Use markdown bolding for key values and terms. No tables. No intro/outro phrases.`,
    },
    {
      role: 'user',
      content: `Explain "${concept}" in the context of "${topicContext}" for a NEET-PG student in exactly 2-3 short bullet points.
Cover:
- What it is / normal range or definition
- Clinical significance / when it is abnormal
- Exam-relevant implication or most-tested fact

Keep it under 60 words total. Bold only the 1-2 most testable values or terms.`,
    },
  ];
  const model = await buildChatModel();
  const { text } = await generateText({ model, messages: toModelMessages(messages) });
  return text.trim();
}

/**
 * Fetch a single relevant medical image for a Guru chat response.
 * Uses Brave Search (via searchMedicalImages) for fresh results — not DB-cached.
 * Returns the first valid image URL, or null if none found.
 */
export async function fetchChatRelevantImage(
  topicName: string,
  responseText: string,
): Promise<string | null> {
  // Extract the first bolded medical term from Guru's reply as a query refinement
  const boldMatch = responseText.match(/\*\*([^*]{3,50})\*\*/);
  const refinement = boldMatch?.[1]?.trim();
  const query = refinement ? `${refinement} ${topicName}` : topicName;
  try {
    const results = await searchMedicalImages(query, 2);
    for (const r of results) {
      const url = (r.imageUrl ?? r.url)?.trim();
      if (url && /^https?:\/\//i.test(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}
