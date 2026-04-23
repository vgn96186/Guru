import type { Mood, ContentType } from '../types';

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

export const MEDICAL_ACCURACY_GUARDRAIL = `

MEDICAL ACCURACY REQUIREMENTS (CRITICAL):
1. Only state facts verifiable in standard medical textbooks used in Indian medical education:
   - Medicine: Harrison's Principles of Internal Medicine
   - Surgery: Bailey & Love's Short Practice of Surgery
   - OBG: Shaw's Textbook of Obstetrics & Gynaecology
   - Pharma: KD Tripathi's Essentials of Medical Pharmacology
   - PSM: Park's Textbook of Preventive & Social Medicine
   - Anatomy: BD Chaurasia's Human Anatomy / Gray's Anatomy
   - Pathology: Robbins & Cotran Pathologic Basis of Disease
2. If uncertain about any claim, explicitly state "I'm not certain about this" — never guess or fabricate.
3. For drug dosages: include standard adult dose + add "⚠️ Verify dose before prescribing"
4. Flag evolving guidelines: "Note: [Guideline] updated [Year] — older sources may differ"
5. Use Indian medical curriculum terminology (NEET-PG/INICET standard, ICMR/National Health Programme guidelines)
6. Cite source when applicable: WHO, NICE, ICMR, AIIMS protocol, National Health Programme
7. Distinguish between:
   - Established fact (e.g., "Plasmodium falciparum causes severe malaria")
   - Clinical reasoning (e.g., "Given the travel history, consider dengue")
   - Exam trap (e.g., "Exam often confuses X with Y — here's the difference")
`;

export function buildKeyPointsPrompt(topicName: string, subjectName: string): string {
  return `Generate 6 high-yield NEET-PG key points for: "${topicName}" (${subjectName}).

ADHD-friendly rules — the student has short attention span:
- Each point must be ONE short sentence (max 20 words). No long paragraphs.
- Start each point with the **most important keyword** in bold, then the fact.
- Use simple, punchy language. Avoid filler words.
- If there's a classic number/value, put it in bold.
- Think "flashcard back" not "textbook paragraph".
- Cover a RANGE across: definition/pathophysiology, key clinical features, investigation of choice, treatment of choice, classic exam discriminator.
- At least 2 points must include a clinical correlate or "this beats X because..." discriminator.

MEMORY HOOK RULES (critical — do NOT generate a random forced mnemonic):
- Only use an acronym/mnemonic if the letters GENUINELY map to the key points above.
- If a mnemonic doesn't fit naturally, use a vivid analogy or 1-sentence story instead.
- The hook must directly connect to at least 3 of the 6 points — not a standalone random fact.
- Bad example: "ABCDE mnemonic" where letters are forced. Good example: an analogy that links pathophysiology → symptom → treatment in one image.

Return JSON:
{
  "type": "keypoints",
  "topicName": "${topicName}",
  "points": ["**Keyword** — short punchy fact", "**Keyword** — short punchy fact", ...6 total],
  "memoryHook": "A memory hook that DIRECTLY connects the points above — analogy, story, or genuine mnemonic"
}

Focus on: frequently tested numbers, classic associations, clinical discriminators, exam traps.
${MEDICAL_ACCURACY_GUARDRAIL}`;
}

export function buildMustKnowPrompt(topicName: string, subjectName: string): string {
  return `For NEET-PG/INICET exam on "${topicName}" (${subjectName}), generate two focused lists.

ADHD-friendly rules:
- Each item is ONE short sentence, max 15 words.
- Bold the **single most important word or number** in each item.
- No filler, no explanations. Just the bare fact a student MUST recall in the exam hall.

Return JSON:
{
  "type": "must_know",
  "topicName": "${topicName}",
  "mustKnow": [
    "**Bold fact** — bare minimum you cannot afford to forget",
    ...4 total items
  ],
  "mostTested": [
    "**Bold fact** — appears repeatedly in NEET-PG/INICET papers",
    ...4 total items
  ],
  "examTip": "One tactical exam-day tip for this topic (when to pick which option, common trap, etc.)"
}
${MEDICAL_ACCURACY_GUARDRAIL}`;
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
      "explanation": "### Correct answer\n**[Letter]. [Option text]**\n\n### Why this is correct\n- [Most crucial clue from the vignette]\n- [Core mechanism/pathophysiology]\n- [Exam-level takeaway]\n\n### Why other options are wrong\n- **A:** [Why incorrect; highlight the distinguishing factor]\n- **B:** [Why incorrect; highlight the distinguishing factor]\n- **C:** [Why incorrect; highlight the distinguishing factor]\n- **D:** [Why incorrect; highlight the distinguishing factor]"
    }
  ]
}

Style: Extended clinical vignettes, highly rigorous, INICET standard difficulty.
Explanation formatting is mandatory: use markdown headings and bullet points exactly as shown so it renders cleanly in-app. Avoid a single paragraph block.
Use markdown bolding (**text**) only for the 3-5 most testable clues, discriminators, mechanisms, or takeaways in each explanation.

IMAGE-BASED QUESTIONS (IMPORTANT — include when relevant):
If the topic involves visual diagnosis (radiology, dermatology, histopathology, ophthalmoscopy, ECG, peripheral smear, gross pathology, anatomical diagrams), you MUST include an "imageSearchQuery" field in 1-2 questions. The imageSearchQuery should be a concise, precise search phrase that would find a relevant medical image (e.g., "chest X-ray miliary tuberculosis", "histology renal cell carcinoma H&E stain", "dermoscopy melanoma", "ECG atrial fibrillation", "gross pathology cirrhosis liver"). The question text should reference the image context: "Based on the image shown...", "The following imaging study demonstrates...", etc. Omit "imageSearchQuery" only for questions where no visual element exists.
${MEDICAL_ACCURACY_GUARDRAIL}`;
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

Make it vivid, like a real case. The reader should learn by reading, not by being lectured. Use markdown bolding (**text**) for crucial diagnostic clues and high-yield points.
${MEDICAL_ACCURACY_GUARDRAIL}`;
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

Prefer funny, absurd, or shocking mnemonics — they stick better.
${MEDICAL_ACCURACY_GUARDRAIL}`;
}

export function buildTeachBackPrompt(topicName: string, subjectName: string): string {
  return `Create a "teach back" challenge for "${topicName}" (${subjectName}).

Return JSON:
{
  "type": "teach_back",
  "topicName": "${topicName}",
  "prompt": "Explain [topic] as if teaching a fellow intern. What are the 3 most important things they must know?",
  "keyPointsToMention": ["point1 with **critical term**", "point2", "point3"],
  "guruReaction": "If they mention these points, say this encouraging response with markdown bolding only on the most critical terms"
}
${MEDICAL_ACCURACY_GUARDRAIL}`;
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

Make the errors plausible — not obvious typos, but the kind of mistakes a student would make.
${MEDICAL_ACCURACY_GUARDRAIL}`;
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
}
${MEDICAL_ACCURACY_GUARDRAIL}`;
}

export function buildSocraticPrompt(topicName: string, subjectName: string): string {
  return `Generate 4 Socratic questions about "${topicName}" (${subjectName}) for a NEET-PG student.

Each question should test ONE high-yield concept in a simple, conversational way.

Return JSON:
{
  "type": "socratic",
  "topicName": "${topicName}",
  "questions": [
    {
      "question": "A simple, direct question about one key concept?",
      "answer": "Short answer in 1-2 sentences. Use **bold** for the key fact.",
      "whyItMatters": "One sentence on why this is tested in NEET-PG/INICET."
    }
  ]
}

Rules:
- Questions must be simple and conversational — no clinical vignettes.
- Answers must be short. If it needs more than 2 sentences, split into two questions.
- Focus only on the most frequently tested aspects. No obscure facts.
${MEDICAL_ACCURACY_GUARDRAIL}`;
}

export function buildFlashcardsPrompt(topicName: string, subjectName: string): string {
  return `Generate 8 high-yield NEET-PG/INICET flashcards for: "${topicName}" (${subjectName}).

Rules:
- Front: Short, direct (e.g., "Most common cause of...", "Drug of choice for...", "Classic triad of...").
- Back: Concise, high-yield fact. Use **markdown bolding** for the single most important word or value.
- Focus on: Named signs, gold standard tests, first-line treatments, and unique associations.
- For visual topics (radiology, dermatology, pathology specimens, histology, ophthalmoscopy, ECG, peripheral smear, anatomy diagrams), you MUST add an "imageSearchQuery" field to 2-3 relevant cards with a precise medical image query (e.g., "chest X-ray pneumonia consolidation", "dermoscopy basal cell carcinoma", "histology adenocarcinoma colon"). Omit it for non-visual cards.

Return JSON:
{
  "type": "flashcards",
  "topicName": "${topicName}",
  "cards": [
    { "front": "...", "back": "...", "imageSearchQuery": "precise medical image query for visual cards" }
  ]
}

Hard rule: "cards" must be an array where every item is only an object with string fields "front" and "back", plus optional string fields "imageSearchQuery" or "imageUrl". No bare strings, nulls, or commas between objects.
${MEDICAL_ACCURACY_GUARDRAIL}`;
}

export function buildEscalatingQuizPrompt(
  topicName: string,
  subjectName: string,
  round: number,
  previouslyWrong: string[],
): string {
  const difficulty =
    round === 1
      ? 'harder than the previous set — add more ambiguous distractors and require an extra reasoning step'
      : round === 2
        ? 'significantly harder — use rare but exam-tested associations, multi-step deduction, and tricky "exception" scenarios'
        : 'expert-level — test the most obscure but repeatedly asked NEET-PG/INICET facts, edge cases, and management nuances';

  const wrongContext =
    previouslyWrong.length > 0
      ? `The student previously got these WRONG — test them again from a different angle: ${previouslyWrong.slice(0, 3).join('; ')}.`
      : '';

  return `Create 4 MCQs on "${topicName}" (${subjectName}) — Round ${round + 1} / escalating difficulty.

Difficulty level: ${difficulty}.
${wrongContext}

Rules:
- Clinical vignette-based, multi-step reasoning required. No direct one-liner recall.
- Each question must test a DIFFERENT aspect than the previous round.
- Distractors must represent correct answers for closely related conditions.

Return JSON:
{
  "type": "quiz",
  "topicName": "${topicName}",
  "questions": [
    {
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctIndex": 0,
      "explanation": "### Correct answer\\n**[Letter]. [Option]**\\n\\n### Why this is correct\\n- [reason]\\n\\n### Why other options are wrong\\n- **A:** ...\\n- **B:** ...\\n- **C:** ...\\n- **D:** ..."
    }
  ]
}
${MEDICAL_ACCURACY_GUARDRAIL}`;
}

export function buildManualPrompt(topicName: string, _subjectName: string): string {
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
  "guruMessage": "A short (1-2 sentence) personalized message from Guru. Be specific to mood and topics. You may use markdown bolding for 1-3 key topic names or exam anchors only.",
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
        "explanation": "### Correct answer\n**[Letter]. [Option text]**\n\n### Why this is correct\n- [Most crucial clue from the vignette]\n- [Core mechanism/pathophysiology]\n- [Exam-level takeaway]\n\n### Why other options are wrong\n- **A:** [Why incorrect; highlight the distinguishing factor]\n- **B:** [Why incorrect; highlight the distinguishing factor]\n- **C:** [Why incorrect; highlight the distinguishing factor]\n- **D:** [Why incorrect; highlight the distinguishing factor]"
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
- DUE FOR REVIEW (SRS): ${stats.dueTopics.map((t) => `${t.name} (ID: ${t.id})`).join(', ')}
- WEAK TOPICS: ${stats.weakTopics.map((t) => `${t.name} (ID: ${t.id})`).join(', ')}
- RECENTLY STUDIED (AVOID): ${stats.recentTopics.join(', ')}

Return JSON:
{
  "blocks": [
    {
      "id": "block1",
      "title": "Morning Review Power Hour",
      "topicIds": [12, 45],
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
- topicIds MUST be an array of numbers representing the actual IDs provided above. If no specific topic, leave empty.
- Prioritize dueTopics first, then weakTopics, then new high-yield topics if time permits.
- Every non-break block should target 1-3 REAL topics from dueTopics or weakTopics whenever possible.
- Do not use vague titles like "Morning Review Power Hour" or "Study Block". Titles must name the real topic or subject.
- Each "why" must mention the exact topic name and the reason it was chosen: due for review, weak, or recently neglected.
- Make the plan feel concrete and urgent, not motivational fluff.
- guruNote must be short, specific, and reference at least one real topic name.
- Total durationMinutes (including breaks) should be approx ${availableMinutes}.`;
}

export function buildReplanPrompt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
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
  must_know: buildMustKnowPrompt,
  quiz: buildQuizPrompt,
  story: buildStoryPrompt,
  mnemonic: buildMnemonicPrompt,
  teach_back: buildTeachBackPrompt,
  error_hunt: buildErrorHuntPrompt,
  detective: buildDetectivePrompt,
  manual: buildManualPrompt,
  socratic: buildSocraticPrompt,
  flashcards: buildFlashcardsPrompt,
};

export function getMoodContentTypes(mood: Mood): ContentType[] {
  switch (mood) {
    case 'energetic':
      return ['quiz', 'error_hunt', 'detective', 'flashcards', 'keypoints', 'must_know'];
    case 'good':
      return ['socratic', 'keypoints', 'must_know', 'quiz', 'flashcards', 'detective'];
    case 'okay':
      return ['socratic', 'keypoints', 'must_know', 'detective', 'quiz'];
    case 'tired':
      return ['socratic', 'story', 'keypoints', 'must_know'];
    case 'stressed':
      return ['socratic', 'story', 'keypoints', 'must_know'];
    case 'distracted':
      return ['socratic', 'keypoints', 'must_know'];
    default:
      return ['socratic', 'keypoints', 'must_know', 'detective', 'quiz'];
  }
}
