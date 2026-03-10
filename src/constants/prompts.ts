import type { Mood, ContentType, TopicWithProgress } from '../types';

export const SYSTEM_PROMPT = `You are Guru, a sharp but caring NEET-PG/INICET exam tutor.
You always respond with valid JSON only. No markdown fences. No extra text.
Target: Indian medical PG entrance exams. Keep content high-yield and exam-focused.
Be concise, vivid, and memorable. Prefer clinical correlates and real-world anchors.`;

export function buildKeyPointsPrompt(topicName: string, subjectName: string): string {
  return `Generate 6 high-yield NEET-PG key points for: "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "keypoints",
  "topicName": "${topicName}",
  "points": ["fact1", "fact2", "fact3", "fact4", "fact5", "fact6"],
  "memoryHook": "one catchy sentence to anchor this topic"
}

Focus on: frequently tested numbers, classic associations, clinical correlates.`;
}

export function buildQuizPrompt(topicName: string, subjectName: string): string {
  return `Create 4 NEET-PG style MCQs on "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "quiz",
  "topicName": "${topicName}",
  "questions": [
    {
      "question": "clinical vignette...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctIndex": 0,
      "explanation": "why correct + why others wrong"
    }
  ]
}

Style: one-best-answer, clinical vignette-based, INICET level difficulty.`;
}

export function buildStoryPrompt(topicName: string, subjectName: string): string {
  return `Create a clinical story for "${topicName}" (${subjectName}) that embeds the key facts naturally.

Return JSON:
{
  "type": "story",
  "topicName": "${topicName}",
  "story": "A patient presents... [story naturally embedding 3-5 testable facts]",
  "keyConceptHighlights": ["term1", "term2", "term3"]
}

Make it vivid, like a real case. The reader should learn by reading, not by being lectured.`;
}

export function buildMnemonicPrompt(topicName: string, subjectName: string): string {
  return `Create a memorable mnemonic for "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "mnemonic",
  "topicName": "${topicName}",
  "mnemonic": "ACRONYM or rhyme or visual",
  "expansion": ["A = ...", "C = ...", "R = ..."],
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
    { "wrong": "exact wrong phrase", "correct": "what it should be", "explanation": "why" },
    { "wrong": "exact wrong phrase", "correct": "what it should be", "explanation": "why" }
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
  "explanation": "Why these clues point to this diagnosis + key NEET facts"
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
  candidates: Array<{ id: number; name: string; subject: string; priority: number; status: string; score: number }>,
  sessionMinutes: number,
  mood: Mood,
  recentTopics: string[],
): string {
  const moodInstructions: Record<Mood, string> = {
    energetic: 'User is energized. Pick high-priority, challenging topics. 3 topics.',
    good: 'User is in good shape. Normal selection. 2-3 topics.',
    okay: 'User is okay. Mix 1 easy familiar topic + 1-2 harder ones. 2-3 topics.',
    tired: 'User is tired. Pick only topics they have seen before (status: seen/reviewed). 1-2 short topics max.',
    stressed: 'User is stressed. Pick 1 easy, familiar topic. Short session. 1 topic only.',
    distracted: 'User is distracted. Sprint mode: pick 1 topic with high-yield keypoints only. 1 topic.',
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
    count === 2 ? ['morning', 'streak_warning']
    : count === 4 ? ['morning', 'afternoon', 'evening', 'streak_warning']
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
- Last studied: ${stats.lastStudied}
- Last mood: ${stats.lastMood ?? 'unknown'}

Return exactly ${count} messages as JSON, one for each scheduledFor slot:
{ "messages": [${slots.map(s => `{ "title": "...", "body": "...", "scheduledFor": "${s}" }`).join(', ')}] }

RULES:
- Use ${stats.displayName}'s name at least once across all messages
- Each message must reference at least one real data point (streak, topic name, exam countdown, coverage %)
- morning: energising kick-start, name a specific weak topic to tackle today
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
        "question": "clinical vignette based on transcript...",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correctIndex": 0,
        "explanation": "why correct + why others wrong"
      },
      // generate exactly 3 questions
    ]
  }
}

Rules:
- High-yield facts only.
- Strict JSON, no markdown fences.`;
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
    case 'energetic': return ['quiz', 'error_hunt', 'detective', 'keypoints'];
    case 'good': return ['keypoints', 'story', 'quiz', 'mnemonic'];
    case 'okay': return ['keypoints', 'mnemonic', 'quiz', 'story'];
    case 'tired': return ['mnemonic', 'story', 'keypoints'];
    case 'stressed': return ['story', 'keypoints', 'mnemonic'];
    case 'distracted': return ['keypoints', 'detective'];
    default: return ['keypoints', 'story', 'mnemonic', 'quiz'];
  }
}
