import type { Mood, ContentType, TopicWithProgress } from '../types';

export const SYSTEM_PROMPT = `You are Guru, an elite, highly demanding NEET-PG/INICET exam tutor.
You always respond with valid JSON only. No markdown fences. No extra text.

Target: Indian medical PG entrance exams (NEET-PG & INI-CET).

CRITICAL INSTRUCTION - THE INI-CET/NEET-PG STANDARD:
You must strictly adhere to the actual difficulty level of these exams. This means:
1. NO obvious or easy questions. 
2. Heavy integration of Basic Sciences (Anatomy, Pathology, Pharma, Micro) with Clinical Scenarios.
3. Test minute factual details (exact enzymes, specific CD markers, exact gene mutations, specific drug adverse effects) hidden inside clinical vignettes.
4. Distractors must be highly plausible. They should represent the correct answer for a closely related condition, forcing the student to notice subtle differentiating clues in the vignette.
5. Emphasize "most appropriate NEXT step", "Definitive diagnosis", or identifying the underlying pathophysiology over simple rote identification.
6. Use Indian demographic contexts when relevant.

Be concise, vivid, and memorable. Prefer clinical correlates and real-world anchors.`;

export function buildKeyPointsPrompt(topicName: string, subjectName: string): string {
  return `Generate 6 high-yield NEET-PG key points for: "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "keypoints",
  "topicName": "${topicName}",
  "points": ["fact1 with **critical keyword** highlighted", "fact2", "fact3", "fact4", "fact5", "fact6"],
  "memoryHook": "one catchy sentence to anchor this topic"
}

Focus on: frequently tested numbers, classic associations, clinical correlates. Use markdown bolding (**text**) to highlight the most high-yield keywords and concepts.`;
}

export function buildQuizPrompt(topicName: string, subjectName: string): string {
  return `Create 4 high-difficulty NEET-PG/INI-CET style MCQs on "${topicName}" (${subjectName}).

The questions MUST be clinical vignette-based, requiring multi-step reasoning (e.g., Step 1: diagnose the condition from the vignette; Step 2: identify the underlying mechanism, next best step in management, or specific adverse effect). 
Do NOT write simple direct one-liner recall questions (e.g., do not write "What is the most common cause of X?").
Ensure options are plausible distractors and use exact medical terminology. Avoid using 'All of the above' or 'None of the above'.

Return JSON:
{
  "type": "quiz",
  "topicName": "${topicName}",
  "questions": [
    {
      "question": "A [Age]-year-old [Sex] presents with [Symptoms]... [Relevant Exam findings, Labs/Imaging]... Which of the following is the most appropriate next step in management? (or similar targeted multi-step question)",
      "options": ["A. [Plausible distractor]", "B. [Plausible distractor]", "C. [Plausible distractor]", "D. [Plausible distractor]"],
      "correctIndex": 0,
      "explanation": "Correct Answer: [Letter]. [Detailed explanation of why it is correct based on the vignette, highlighting the **most crucial mechanism** with markdown bolding]. [Specific breakdown of why EACH of the other options is incorrect, bolding **the distinguishing factor**]."
    }
  ]
}

Style: Extended clinical vignettes, highly rigorous, INICET standard difficulty.`;
}

export function buildStoryPrompt(topicName: string, subjectName: string): string {
  return `Create a clinical story for "${topicName}" (${subjectName}) that embeds the key facts naturally.

Return JSON:
{
  "type": "story",
  "topicName": "${topicName}",
  "story": "A patient presents... [story naturally embedding 3-5 testable facts. Use **markdown bolding** for high yield clues and keywords.]",
  "keyConceptHighlights": ["term1", "term2", "term3"]
}

Make it vivid, like a real case. The reader should learn by reading, not by being lectured. Use markdown bolding (**text**) for crucial diagnostic clues and high-yield points.`;
}

export function buildMnemonicPrompt(topicName: string, subjectName: string): string {
  return `Create a memorable mnemonic for "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "mnemonic",
  "topicName": "${topicName}",
  "mnemonic": "ACRONYM or rhyme or visual",
  "expansion": ["A = ...", "C = ...", "R = ... (Use **markdown bolding** for the pivotal word in each expansion)"],
  "tip": "when to use this in exam context"
}

Prefer funny, absurd, or shocking mnemonics — they stick better.`;
}

export function buildTeachBackPrompt(topicName: string, subjectName: string): string {
  return `Create a "teach back" challenge for "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "teach_back",
  "topicName": "${topicName}",
  "prompt": "Explain [topic] as if teaching a fellow intern. What are the 3 most important things they must know?",
  "keyPointsToMention": ["point1", "point2", "point3"],
  "guruReaction": "If they mention these points, say this encouraging response"
}`;
}

export function buildErrorHuntPrompt(topicName: string, subjectName: string): string {
  return `Create an "error hunt" for "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "error_hunt",
  "topicName": "${topicName}",
  "paragraph": "A 3-5 sentence paragraph about the topic with exactly 2 factual errors embedded naturally",
  "errors": [
    { "wrong": "exact wrong phrase", "correct": "what it should be", "explanation": "why (Use **markdown bolding** for the core fact)" },
    { "wrong": "exact wrong phrase", "correct": "what it should be", "explanation": "why (Use **markdown bolding** for the core fact)" }
  ]
}

Make the errors plausible — not obvious typos, but the kind of mistakes a student would make.`;
}

export function buildDetectivePrompt(topicName: string, subjectName: string): string {
  return `Create a clinical detective game for "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "detective",
  "topicName": "${topicName}",
  "clues": [
    "Clue 1: patient age/sex/chief complaint",
    "Clue 2: one more symptom or lab value",
    "Clue 3: another finding that clinches it",
    "Clue 4: the classic association or exam finding"
  ],
  "answer": "Diagnosis: [condition]",
  "explanation": "Why these clues point to this diagnosis + key NEET facts. Use **markdown bolding** for the clinching clues and keywords."
}`;
}

export function buildManualPrompt(topicName: string, subjectName: string): string {
  return `Return strict JSON:
{
  "type": "manual",
  "topicName": "${topicName}"
}

No other keys. No markdown. No extra text.`;
}

export function buildAgendaPrompt(
  candidates: Array<{
    id: number;
    name: string;
    subject: string;
    priority: number;
    status: string;
    score: number;
  }>,
  sessionMinutes: number,
  mood: Mood,
  recentTopics: string[],
): string {
  const moodInstructions: Record<Mood, string> = {
    energetic: 'User is energized. Pick high-priority, challenging topics. 3 topics.',
    good: 'User is in good shape. Normal selection. 2-3 topics.',
    okay: 'User is okay. Mix 1 easy familiar topic + 1-2 harder ones. 2-3 topics.',
    tired:
      'User is tired. Pick only topics they have seen before (status: seen/reviewed). 1-2 short topics max.',
    stressed: 'User is stressed. Pick 1 easy, familiar topic. Short session. 1 topic only.',
    distracted:
      'User is distracted. Sprint mode: pick 1 topic with high-yield keypoints only. 1 topic.',
  };

  return `Plan a ${sessionMinutes}-minute NEET-PG study session.
Mood: ${mood}. Instruction: ${moodInstructions[mood]}

Candidates (JSON):
${JSON.stringify(candidates, null, 2)}

Recently studied (avoid): ${recentTopics.join(', ')}

Return JSON:
{
  "selectedTopicIds": [id1, id2],
  "focusNote": "Today: [topic names] — [brief context]",
  "guruMessage": "A short (1-2 sentence) personalized motivational message from Guru. Be specific to mood and topics.",
  "reasoning": "why these topics"
}

Rules: higher score = higher priority. Don't repeat recent topics.`;
}

export function buildAccountabilityPrompt(stats: {
  displayName: string;
  streak: number;
  weakestTopics: string[];
  nemesisTopics: string[];
  dueTopics: string[];
  lastStudied: string;
  daysToInicet: number;
  daysToNeetPg: number;
  coveragePercent: number;
  masteredCount: number;
  totalTopics: number;
  lastMood: Mood | null;
  guruFrequency: 'rare' | 'normal' | 'frequent' | 'off';
}): string {
  const count = stats.guruFrequency === 'rare' ? 2 : stats.guruFrequency === 'frequent' ? 4 : 3;
  const slots: string[] =
    count === 2
      ? ['morning', 'streak_warning']
      : count === 4
        ? ['morning', 'afternoon', 'evening', 'streak_warning']
        : ['morning', 'evening', 'streak_warning'];

  const examLines: string[] = [];
  if (stats.daysToInicet > 0) examLines.push(`INI-CET in ${stats.daysToInicet} days`);
  if (stats.daysToNeetPg > 0) examLines.push(`NEET-PG in ${stats.daysToNeetPg} days`);
  const examContext = examLines.length > 0 ? examLines.join(' | ') : 'exam date not set';

  return `Generate exactly ${count} accountability push notifications for ${stats.displayName}, a NEET-PG/INI-CET student preparing in India.

STUDENT SNAPSHOT:
- Name: ${stats.displayName}
- Streak: ${stats.streak} day${stats.streak !== 1 ? 's' : ''}${stats.streak === 0 ? ' (broken — restart needed)' : ''}
- Exams: ${examContext}
- Syllabus: ${stats.coveragePercent}% covered (${stats.masteredCount} mastered out of ${stats.totalTopics} topics)
- Weakest topics: ${stats.weakestTopics.length > 0 ? stats.weakestTopics.join(', ') : 'none yet (just started)'}
- Nemesis topics (most failed): ${stats.nemesisTopics.length > 0 ? stats.nemesisTopics.join(', ') : 'none yet'}
- DUE FOR REVIEW (SRS): ${stats.dueTopics.length > 0 ? stats.dueTopics.join(', ') : 'nothing urgent'}
- Last studied: ${stats.lastStudied}
- Last mood: ${stats.lastMood ?? 'unknown'}

Return exactly ${count} messages as JSON, one for each scheduledFor slot:
{ "messages": [${slots.map((s) => `{ "title": "...", "body": "...", "scheduledFor": "${s}" }`).join(', ')}] }

RULES:
- Use ${stats.displayName}'s name at least once across all messages
- Each message must reference at least one real data point (streak, topic name, exam countdown, coverage %, or a DUE topic)
- CRITICAL: If there are DUE topics, the "morning" notification MUST be a dynamic alert about one of those topics (e.g. "🚨 Critical Review: [Topic] is fading...").
- morning: energising kick-start, prioritize a DUE topic or a specific weak topic
- afternoon: midday check-in, mention nemesis topic or exam pressure if present
- evening: firm nudge toward end-of-day goal, reference syllabus gap
- streak_warning: fires at 9 pm — urgent, streak-focused, exact day count if > 0; encouraging if streak = 0
- Tone: Guru — sharp, specific, a little sarcastic but genuinely invested. Not generic.
- Title: max 60 chars. Body: max 110 chars. No placeholder text like "...".`;
}

export function buildCatalystPrompt(transcript: string): string {
  return `Act as an expert medical education synthesizer for NEET-PG.
Given the following raw lecture dictation/transcript, extract the core concept and auto-generate a complete study deck.

Transcript:
"${transcript}"

Return exactly one JSON object with the following structure:
{
  "topicName": "A concise, specific title for this concept (max 5 words)",
  "keypoints": {
    "type": "keypoints",
    "topicName": "...",
    "points": ["fact1", "fact2", "fact3", "fact4", "fact5", "fact6"],
    "memoryHook": "one catchy sentence to anchor this topic"
  },
  "mnemonic": {
    "type": "mnemonic",
    "topicName": "...",
    "mnemonic": "ACRONYM or visual",
    "expansion": ["A=...", "B=...", "C=..."],
    "tip": "exam context"
  },
  "quiz": {
    "type": "quiz",
    "topicName": "...",
    "questions": [
      {
        "question": "A [Age]-year-old [Sex] presents with [Symptoms] based on the transcript... Which of the following is the most appropriate next step? (Must be a multi-step reasoning clinical vignette. No direct 1-liner recall questions.)",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correctIndex": 0,
        "explanation": "why correct + detailed breakdown of why EACH of the other options is incorrect"
      },
      // generate exactly 3 highly rigorous, INICET standard difficulty questions
    ]
  }
}

Rules:
- High-yield facts only.
- Strict JSON, no markdown fences.`;
}

export function buildDailyAgendaPrompt(
  displayName: string,
  stats: {
    streak: number;
    daysToInicet: number;
    daysToNeetPg: number;
    coveragePercent: number;
    dueTopics: Array<{ id: number; name: string; subject: string }>;
    weakTopics: Array<{ id: number; name: string; subject: string }>;
    recentTopics: string[];
  },
  availableMinutes: number = 480,
): string {
  return `Generate a personalized daily study plan for ${displayName}, a NEET-PG/INI-CET student.
Available study time: ${availableMinutes} minutes.

STUDENT STATS:
- Streak: ${stats.streak} days
- Coverage: ${stats.coveragePercent}%
- Days to INI-CET: ${stats.daysToInicet}
- Days to NEET-PG: ${stats.daysToNeetPg}
- DUE FOR REVIEW (SRS): ${stats.dueTopics.map((t) => t.name).join(', ')}
- WEAK TOPICS: ${stats.weakTopics.map((t) => t.name).join(', ')}
- RECENTLY STUDIED (AVOID): ${stats.recentTopics.join(', ')}

Return JSON:
{
  "blocks": [
    {
      "id": "block1",
      "title": "Morning Review Power Hour",
      "topicIds": [id1, id2],
      "durationMinutes": 60,
      "startTime": "08:00",
      "type": "review",
      "why": "Prioritizing urgent SRS topics while mind is fresh."
    }
  ],
  "guruNote": "A sharp, personalized message from Guru about today's focus.",
  "prioritySubjectId": 5
}

RULES:
- Blocks should be 30-120 minutes.
- Include 'break' blocks (15-30 min) every 2-3 study blocks.
- types: 'study', 'review', 'test', 'break'.
- Prioritize dueTopics first, then weakTopics, then new high-yield topics if time permits.
- Total durationMinutes (including breaks) should be approx ${availableMinutes}.`;
}

export function buildReplanPrompt(
  currentPlan: any,
  completedBlockIds: string[],
  missedBlockIds: string[],
  remainingMinutes: number,
): string {
  return `The student has drifted from their daily plan. Replan the remaining ${remainingMinutes} minutes.

Original Plan:
${JSON.stringify(currentPlan, null, 2)}

Completed: ${completedBlockIds.join(', ')}
Missed/Skipped: ${missedBlockIds.join(', ')}

Return a revised JSON structure (blocks, guruNote, prioritySubjectId) for the remaining time. 
Prioritize critical topics from missed blocks if still urgent.
Be firm but adaptive. Guru's note should reflect the "recovery" nature of this plan.`;
}

export const CONTENT_PROMPT_MAP: Record<ContentType, (topic: string, subject: string) => string> = {
  keypoints: buildKeyPointsPrompt,
  quiz: buildQuizPrompt,
  story: buildStoryPrompt,
  mnemonic: buildMnemonicPrompt,
  teach_back: buildTeachBackPrompt,
  error_hunt: buildErrorHuntPrompt,
  detective: buildDetectivePrompt,
  manual: buildManualPrompt,
};

export function getMoodContentTypes(mood: Mood): ContentType[] {
  switch (mood) {
    case 'energetic':
      return ['quiz', 'error_hunt', 'detective', 'keypoints'];
    case 'good':
      return ['keypoints', 'story', 'quiz', 'detective'];
    case 'okay':
      return ['keypoints', 'detective', 'quiz', 'story'];
    case 'tired':
      return ['story', 'keypoints', 'detective'];
    case 'stressed':
      return ['story', 'keypoints', 'detective'];
    case 'distracted':
      return ['keypoints', 'detective'];
    default:
      return ['keypoints', 'story', 'detective', 'quiz'];
  }
}
