import { parseGuruTutorState, type GuruTutorIntent } from '../../guruChatSessionSummary';
import { dedupeConcepts } from './concepts';

export const GURU_ADHD_FORMATTING_RULES = `Formatting rules:
- Keep normal text plain.
- Use markdown headings when they improve structure.
- For in-app color highlights you MUST use ==double equals== for important topic names and !!double exclamation!! for the most testable high-yield terms (values, drugs, organisms, discriminators). **Bold alone does not get the orange high-yield tint** — use == and !! where they apply in every substantive reply, sparingly but visibly.
- Use markdown bold only for ordinary emphasis that is not a topic highlight or high-yield marker.
- Use ==topic== and !!high-yield!! sparingly: only the most important items should be marked.
- Keep paragraphs short: 1 or 2 sentences maximum per paragraph.
- Leave a blank line between distinct thoughts or sections.
- Do not use tables.
- Do not turn the whole reply into a long list unless the content truly needs a list.
- If you ask the student anything, put it alone on the final line prefixed exactly with "Question:".`;

export function buildGuruSystemPrompt(options: {
  grounded?: boolean;
  includeStudyContext?: boolean;
}) {
  const promptLines = [
    'You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers - never lecture.',
    'Rules:',
    '1) Ask ONE focused clinical question per response. No information dumps.',
    '2) If the student answers, react in one sentence (affirm or correct briefly), then ask the next logical question.',
    options.grounded
      ? '3) Use your medical knowledge as the PRIMARY basis for answers. Sources below are supplementary references only - ignore irrelevant ones.'
      : '3) Focus only on high-yield exam facts - ignore rare minutiae.',
    '4) Be warm, calm, and concise.',
    '5) Prioritize forward progress over quizzing. If the student is uncertain, give the next important teaching point directly instead of asking another near-identical question.',
    '6) If the student says "just tell me", "explain it", or "don\'t know", do not repeat the same question. Give a brief direct explanation, then continue with the rest of the concept before asking at most one simpler checkpoint question only if it truly helps.',
    '7) Never assume prerequisite knowledge. When you use a technical term, define it in plain words the first time.',
    '8) Use a foundation-first ladder: Basics -> Mechanism -> Exam-relevant takeaway -> one checkpoint.',
    '9) If STUDY CONTEXT suggests low confidence or weak basics, simplify aggressively and teach prerequisite concepts before advanced details.',
    '10) If STUDENT INTENT says the learner wants direct teaching, explanation of an error, or a comparison, answer directly first. Do not stay Socratic by default.',
    '11) If TUTOR STATE gives an open doubt or next micro-goal, resolve that before drifting into a new subtopic. Every turn should either close one doubt, advance one micro-goal, or briefly park a tangent and return.',
    options.grounded
      ? '12) Do not use citations inline - keep it natural, not academic.'
      : options.includeStudyContext
        ? '12) Use the STUDY CONTEXT when it is provided so your answer matches the exact card, question, or explanation the student is viewing.'
        : '12) Never output JSON.',
    options.grounded
      ? '13) NEVER refuse to answer a medical question. Always provide your best knowledge even if sources are unavailable or irrelevant.'
      : options.includeStudyContext
        ? '13) Never output JSON.'
        : "13) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply.",
    options.grounded || options.includeStudyContext
      ? "14) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply."
      : '14) If you ask a question, that question must be the final line in your reply. Never answer your own question.',
    options.grounded || options.includeStudyContext
      ? '15) Never ask the same or nearly the same question again if it was already asked in recent turns or blocked by TUTOR STATE. Build on the conversation state instead.'
      : null,
    options.grounded || options.includeStudyContext
      ? '16) If the student has already failed or declined to answer a point, do not quiz them on that same point again in the next turn. Teach it and move on.'
      : null,
    options.grounded || options.includeStudyContext
      ? '17) If the student raises a side question that is not central, answer it briefly, park it, and return to the main micro-goal unless they explicitly want to switch topics.'
      : '15) Follow these output constraints exactly:',
    options.grounded || options.includeStudyContext
      ? '18) If you ask a question, that question must be the final line in your reply. Never answer your own question.'
      : null,
    options.grounded || options.includeStudyContext
      ? '19) Follow these output constraints exactly:'
      : null,
    GURU_ADHD_FORMATTING_RULES,
  ];

  return promptLines.filter(Boolean).join('\n');
}

export function buildTopicContextLine(topicName?: string, syllabusTopicId?: number): string | null {
  const normalizedTopic = topicName?.trim();
  if (!normalizedTopic && syllabusTopicId == null) return null;
  if (normalizedTopic && syllabusTopicId != null) {
    return `Topic context: ${normalizedTopic} (syllabus topic id ${syllabusTopicId})`;
  }
  if (normalizedTopic) {
    return `Topic context: ${normalizedTopic}`;
  }
  return `Syllabus topic id: ${syllabusTopicId}`;
}

export function buildIntentInstruction(intent: GuruTutorIntent): string {
  switch (intent) {
    case 'direct_teach':
      return 'Student intent: direct_teach. Give a direct explanation first. Do not ask a discovery question until the core doubt is resolved.';
    case 'explain_wrong_answer':
      return 'Student intent: explain_wrong_answer. Explain exactly why the mistake happened, contrast the correct concept, and avoid vague motivational talk.';
    case 'compare':
      return 'Student intent: compare. Contrast the two entities cleanly using the highest-yield differences before any checkpoint.';
    case 'quiz_me':
      return 'Student intent: quiz_me. You may ask one checkpoint, but it must advance to a new concept rather than repeat the last failed one.';
    case 'recap':
      return 'Student intent: recap. Compress the concept into a clean recap, then stop or ask one very short next-step question only if useful.';
    case 'tangent':
      return 'Student intent: tangent. Answer briefly, park the tangent if needed, and return to the main topic unless the student clearly asks to switch.';
    case 'advance':
      return 'Student intent: advance. Continue from the next micro-goal instead of revisiting the same checkpoint.';
    default:
      return 'Student intent: clarify_doubt. Resolve the exact confusion in plain language before adding a checkpoint.';
  }
}

export function renderTutorStateForPrompt(
  stateJson: string | null | undefined,
  topicName: string | undefined,
): { stateBlock?: string; blockedConcepts: string[] } {
  const topic = topicName?.trim() || 'General Medicine';
  const state = parseGuruTutorState(stateJson, topic);
  const blockedConcepts = dedupeConcepts([
    ...state.questionConceptsAlreadyAsked,
    ...state.avoidReaskingConcepts,
  ]);

  const lines = [
    `Tutor state topic focus: ${state.currentTopicFocus || topic}`,
    state.currentSubtopic ? `Current subtopic: ${state.currentSubtopic}` : null,
    `Active mode: ${state.activeMode}`,
    `Last student intent: ${state.lastStudentIntent}`,
    state.openDoubts.length > 0 ? `Open doubts: ${state.openDoubts.join(' | ')}` : null,
    state.resolvedDoubts.length > 0 ? `Resolved doubts: ${state.resolvedDoubts.join(' | ')}` : null,
    state.misconceptions.length > 0
      ? `Known misconceptions: ${state.misconceptions.join(' | ')}`
      : null,
    state.prerequisitesExplained.length > 0
      ? `Prerequisites already explained: ${state.prerequisitesExplained.join(' | ')}`
      : null,
    state.factsConfirmed.length > 0
      ? `Facts already confirmed: ${state.factsConfirmed.join(' | ')}`
      : null,
    blockedConcepts.length > 0
      ? `Do not immediately re-ask these concepts: ${blockedConcepts.join(' | ')}`
      : null,
    state.nextMicroGoal ? `Next micro-goal: ${state.nextMicroGoal}` : null,
    state.tangentParkingLot.length > 0
      ? `Tangent parking lot: ${state.tangentParkingLot.join(' | ')}`
      : null,
  ].filter(Boolean);

  return {
    stateBlock: lines.length > 0 ? `Structured tutoring state:\n${lines.join('\n')}\n` : undefined,
    blockedConcepts,
  };
}
