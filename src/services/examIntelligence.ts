import type { Subject, UserProfile } from '../types';

export type ExamName = 'INICET' | 'NEET-PG';
export type ExamPhase =
  | 'foundation'
  | 'coverage'
  | 'integration'
  | 'crunch'
  | 'final_week'
  | 'exam_day';

// ─── Real exam facts (sourced from official/verified data) ───────────────────
export const EXAM_FACTS = {
  INICET: {
    fullName: 'INI CET (Institute of National Importance Combined Entrance Test)',
    conductedBy: 'All India Institute of Medical Sciences (AIIMS), New Delhi',
    admitsTo: [
      'AIIMS campuses (New Delhi, Bhopal, Bhubaneswar, Jodhpur, etc.)',
      'PGIMER Chandigarh',
      'JIPMER Puducherry',
      'NIMHANS Bangalore',
      'SCTIMST Thiruvananthapuram',
    ],
    totalSeats: 1631,
    totalQuestions: 200,
    duration: 180, // minutes
    markingScheme: { correct: 1, wrong: -1 / 3, unattempted: 0 },
    totalMarks: 200,
    frequency: 'Twice yearly (January and July sessions)',
    competitionNote:
      'Top clinical branches (MD Gen Med, MS Gen Surgery) close at rank 50–200 (general category). Highly competitive.',
    subjects: {
      preClinical: ['Anatomy', 'Physiology', 'Biochemistry'],
      paraClinical: [
        'Pathology',
        'Microbiology',
        'Forensic Medicine',
        'Pharmacology',
        'Community Medicine',
      ],
      clinical: [
        'General Medicine',
        'Gynaecology',
        'Obstetrics',
        'Paediatrics',
        'Surgery',
        'Orthopaedics',
        'Anaesthesia',
        'Radiodiagnosis',
        'ENT',
        'Ophthalmology',
        'Dermatology',
        'Psychiatry',
      ],
    },
    trapPatterns: [
      'Higher basic science integration — expects mechanisms tied to clinical presentations.',
      'Image-based questions (histology, radiology, clinical photos) are common.',
      'AIIMS-style lateral thinking: "which is NOT true?" and "except" questions.',
      'Negative marking is mild (-1/3), but over-guessing on unfamiliar topics can still hurt rank.',
      'Pattern favors conceptual depth over rote recall — standard coaching-cram alone is insufficient.',
    ],
    strategyTips: [
      '54 s per question on average — no time pressure if well-prepared.',
      'Do not guess blindly: -1/3 penalty means 3 wrong guesses cancel 1 correct answer.',
      'Strongest rank improvements come from mastering Para-Clinical and Pre-Clinical at a deeper level than NEET-PG demands.',
      'AIIMS previous year questions (PYQs) are the best predictor of question style.',
    ],
  },
  'NEET-PG': {
    fullName: 'NEET PG (National Eligibility cum Entrance Test — Postgraduate)',
    conductedBy: 'National Board of Examinations (NBE)',
    admitsTo: ['Government and private MD/MS/PG Diploma colleges across India'],
    totalQuestions: 200,
    duration: 210, // minutes (3.5 hours)
    markingScheme: { correct: 4, wrong: -1, unattempted: 0 },
    totalMarks: 800,
    frequency: 'Annual (typically August)',
    competitionNote:
      'Sub-2000 rank targets top government MD seats. ~1.5–2 lakh candidates appear annually.',
    sections: [
      {
        name: 'Part A — Pre-Clinical',
        subjects: ['Anatomy (17)', 'Physiology (17)', 'Biochemistry (16)'],
        approximateQs: 50,
      },
      {
        name: 'Part B — Para-Clinical',
        subjects: [
          'Pathology (25)',
          'Pharmacology (20)',
          'Microbiology (20)',
          'Forensic Medicine (10)',
          'SPM/Community Medicine (25)',
        ],
        approximateQs: 100,
      },
      {
        name: 'Part C — Clinical',
        subjects: [
          'Medicine+Derm+Psych (45)',
          'Surgery+Ortho+Anaes+Radio (45)',
          'OBG (30)',
          'Paediatrics (10)',
          'ENT (10)',
          'Ophthalmology (10)',
        ],
        approximateQs: 200,
      },
    ],
    trapPatterns: [
      '"Next best step" management questions are the dominant clinical pattern.',
      'Negative marking is heavy (+4/-1): a wrong answer costs 1.25× a correct answer in net terms.',
      'Distractor traps: options that are medically true but not the "best" answer in the given scenario.',
      'Sectional timing — once a section time ends, system auto-advances. Cannot go back.',
      'High weightage on clinical subjects (~50% of marks) — Para-Clinical is make-or-break for rank.',
    ],
    strategyTips: [
      '63 s per question average (210 min / 200 Qs) — fine margin. Speed matters in clinical section.',
      'Never guess unless you can confidently eliminate at least 2 options. At +4/-1, blind guessing has negative expected value.',
      'Para-Clinical (Part B) is the rank differentiator — most students underinvest here.',
      'High-yield: SPM (25Q), Pathology (25Q), OBG (30Q) — these 3 subjects together = 80Q.',
      "Mark-for-review strategy: flag 'likely right but unsure' items to revisit. Don't leave time for just the last 10 seconds.",
    ],
  },
} as const;

export interface ExamTargetIntelligence {
  targetExam: ExamName;
  targetDate: string;
  daysToTarget: number;
  daysToInicet: number;
  daysToNeetPg: number;
  secondaryExam?: ExamName;
  secondaryExamDays?: number;
  phase: ExamPhase;
  phaseLabel: string;
  plannerFocus: string;
  chatTutorHint: string;
  reviewBias: number;
  deepDiveBias: number;
  newTopicBias: number;
}

function normalizeExamName(examType: UserProfile['examType']): ExamName {
  return examType === 'NEET' ? 'NEET-PG' : 'INICET';
}

function pickUpcomingTarget(args: {
  preferredExam: ExamName;
  daysToInicet: number;
  daysToNeetPg: number;
  inicetDate: string;
  neetDate: string;
}): { exam: ExamName; date: string; days: number; secondary?: { exam: ExamName; days: number } } {
  const { preferredExam, daysToInicet, daysToNeetPg, inicetDate, neetDate } = args;

  const all: Array<{ exam: ExamName; date: string; days: number }> = [
    { exam: 'INICET', date: inicetDate, days: daysToInicet },
    { exam: 'NEET-PG', date: neetDate, days: daysToNeetPg },
  ];

  // Only consider exams that are still upcoming (days > 0). getDaysToExam clamps to 0 for past dates.
  const options = all.filter((o) => o.days > 0);
  // If both exams have passed, fall back to the preferred exam so we don't crash.
  const pool = options.length > 0 ? options : all;

  const nearest = [...pool].sort((a, b) => a.days - b.days)[0] ?? pool[0];
  const preferred = pool.find((option) => option.exam === preferredExam) ?? pool[0];

  // If both exams are upcoming and very close, honor user preference.
  // If one exam is materially nearer, prioritize the nearer target.
  const upcoming0Days = options.length > 0 ? options[0].days : 0;
  const upcoming1Days = options.length > 1 ? options[1].days : 0;
  const shouldPreferNearest = options.length === 1 || Math.abs(upcoming0Days - upcoming1Days) > 14;
  const chosen = shouldPreferNearest ? nearest : preferred;

  const secondary = pool.find((option) => option.exam !== chosen.exam);
  return {
    exam: chosen.exam,
    date: chosen.date,
    days: chosen.days,
    ...(secondary ? { secondary: { exam: secondary.exam, days: secondary.days } } : {}),
  };
}

export function getExamPhase(daysToTarget: number): ExamPhase {
  if (daysToTarget <= 0) return 'exam_day';
  if (daysToTarget <= 7) return 'final_week';
  if (daysToTarget <= 21) return 'crunch';
  if (daysToTarget <= 60) return 'integration';
  if (daysToTarget <= 120) return 'coverage';
  return 'foundation';
}

function phaseLabels(
  phase: ExamPhase,
  targetExam: ExamName,
): {
  label: string;
  plannerFocus: string;
  chatTutorHint: string;
  reviewBias: number;
  deepDiveBias: number;
  newTopicBias: number;
} {
  const isInicet = targetExam === 'INICET';
  switch (phase) {
    case 'exam_day':
      return {
        label: 'Exam Day',
        plannerFocus: 'No new learning. Rapid decision-rule recall only. Trust your preparation.',
        chatTutorHint: isInicet
          ? 'Exam day — INICET: 200 Qs in 180 min (54s/Q), -1/3 penalty. Only answer if ≥50% confident. Focus on AIIMS-style mechanism and image recall. Keep responses reassuring and extremely brief.'
          : 'Exam day — NEET-PG: 200 Qs in 210 min (63s/Q), +4/-1 marking. Never guess blind. 3 wrong = 1 correct cancelled. Keep responses to decision-rule bullets only.',
        reviewBias: 1.5,
        deepDiveBias: 0.4,
        newTopicBias: 0,
      };
    case 'final_week':
      return {
        label: 'Final Week',
        plannerFocus: isInicet
          ? 'INICET final week: error-log loops, image/histology recall, AIIMS PYQ repeats. Mild -1/3 penalty — attempt when ≥60% sure.'
          : 'NEET-PG final week: Para-Clinical targets (Pathology 25Q, SPM 25Q), clinical "next-best-step" drills. Heavy -1 penalty — do NOT guess unless 2+ options eliminated.',
        chatTutorHint: isInicet
          ? 'Train elimination on AIIMS-style "except/NOT" traps. Reinforce histology + radiology image cues. Speed: 54 s/Q — quick recognition over deliberation.'
          : 'Drill +4/-1 exam strategy: mark-for-review pattern, eliminating 2 distractors before committing. Focus on OBG (30Q) and Medicine (45Q) high-yield clusters.',
        reviewBias: 1.45,
        deepDiveBias: 0.65,
        newTopicBias: 0.2,
      };
    case 'crunch':
      return {
        label: 'Exam Crunch (21d)',
        plannerFocus: isInicet
          ? 'INICET crunch: prioritize conceptual weak spots + Para-Clinical repair (Pathology, Micro, Pharma). AIIMS expects mechanism-level answers, not rote lists.'
          : 'NEET-PG crunch: Part B (Para-Clinical = 100Q) is the rank differentiator. Hammer Pathology, SPM, OBG. No new Pre-Clinical unless gaps are severe.',
        chatTutorHint: isInicet
          ? 'Use AIIMS-style lateral questions: mechanism → clinical sign → next investigation. Avoid rote recall — test understanding, not memorisation.'
          : 'Use "next best step" stems. For each clinical scenario, always tie answer to management protocol. Flag distractor traps in +4/-1 context.',
        reviewBias: 1.35,
        deepDiveBias: 0.9,
        newTopicBias: 0.45,
      };
    case 'integration':
      return {
        label: 'Integration Ramp (60d)',
        plannerFocus: isInicet
          ? 'INICET integration: blend Pre-Clinical mechanisms with clinical correlates. AIIMS tests "why", not just "what". Audit image-based question exposure.'
          : 'NEET-PG integration: connect Pre-Clinical and Para-Clinical to clinical Part C. SPM (25Q) and OBG (30Q) should be near-complete revisions now.',
        chatTutorHint: isInicet
          ? 'Connect basic science mechanism → clinical presentation → AIIMS-style question output. Push lateral integration, not isolated facts.'
          : 'Connect mechanism, diagnosis, and "next best step" in every answer. Surface +4/-1 traps: true-but-not-best-answer distractors.',
        reviewBias: 1.2,
        deepDiveBias: 1.1,
        newTopicBias: 0.85,
      };
    case 'coverage':
      return {
        label: 'Coverage Build (120d)',
        plannerFocus: isInicet
          ? 'INICET coverage: complete all 19 subjects with conceptual depth. AIIMS PYQs alongside each topic. Keep review backlog < 3 days of capacity.'
          : 'NEET-PG coverage: finish all subjects. Prioritise high-weightage clusters: Medicine (45Q), Surgery (45Q), OBG (30Q), Pathology (25Q), SPM (25Q).',
        chatTutorHint: isInicet
          ? 'Teach fundamentals + AIIMS-grade distinctions. Highlight concepts that appear repeatedly in AIIMS PYQs. Moderate depth — no tangents to rare diseases.'
          : 'Teach fundamentals then NBE-grade exam distinctions. Emphasise high-yield Part B (Para-Clinical = 100Q). Ground each concept in its exam-question template.',
        reviewBias: 1,
        deepDiveBias: 1,
        newTopicBias: 1,
      };
    case 'foundation':
    default:
      return {
        label: 'Foundation Build',
        plannerFocus: isInicet
          ? 'INICET foundation: build strong conceptual scaffolding in Pre-Clinical. AIIMS questions test mechanisms — rote memorisation will fail at integration stage.'
          : 'NEET-PG foundation: build core understanding across all subjects. Identify and close prerequisite gaps early. Confidence < 1 on high-weightage subjects must be fixed now.',
        chatTutorHint: isInicet
          ? 'Use simple scaffolded language: basics → mechanism → exam-relevance. AIIMS later tests "why" — lay that reasoning foundation now.'
          : 'Use simple language, scaffold from basics. Every concept will later map to a +4/-1 MCQ — teach the exam relevance even during foundation phase.',
        reviewBias: 0.95,
        deepDiveBias: 1.1,
        newTopicBias: 1.15,
      };
  }
}

export function getExamTargetIntelligence(
  profile: Pick<UserProfile, 'examType' | 'inicetDate' | 'neetDate'>,
  getDaysToExam: (date: string) => number,
): ExamTargetIntelligence {
  const preferredExam = normalizeExamName(profile.examType);
  const daysToInicet = getDaysToExam(profile.inicetDate);
  const daysToNeetPg = getDaysToExam(profile.neetDate);

  const target = pickUpcomingTarget({
    preferredExam,
    daysToInicet,
    daysToNeetPg,
    inicetDate: profile.inicetDate,
    neetDate: profile.neetDate,
  });

  const phase = getExamPhase(target.days);
  const phaseConfig = phaseLabels(phase, target.exam);

  return {
    targetExam: target.exam,
    targetDate: target.date,
    daysToTarget: target.days,
    daysToInicet,
    daysToNeetPg,
    ...(target.secondary
      ? { secondaryExam: target.secondary.exam, secondaryExamDays: target.secondary.days }
      : {}),
    phase,
    phaseLabel: phaseConfig.label,
    plannerFocus: phaseConfig.plannerFocus,
    chatTutorHint: phaseConfig.chatTutorHint,
    reviewBias: phaseConfig.reviewBias,
    deepDiveBias: phaseConfig.deepDiveBias,
    newTopicBias: phaseConfig.newTopicBias,
  };
}

export function getExamAwareSubjectWeight(
  subject: Pick<Subject, 'inicetWeight' | 'neetWeight'>,
  targetExam: ExamName,
): number {
  if (targetExam === 'NEET-PG') return subject.neetWeight;
  return subject.inicetWeight;
}

export function buildExamIntelligenceBrief(intel: ExamTargetIntelligence): string {
  const facts = EXAM_FACTS[intel.targetExam];
  const marking =
    intel.targetExam === 'INICET' ? '+1/-0.33 marking, 54 s/Q' : '+4/-1 marking, 63 s/Q';
  const dualTrack =
    intel.secondaryExam && typeof intel.secondaryExamDays === 'number'
      ? ` Secondary: ${intel.secondaryExam} in ${intel.secondaryExamDays} day(s).`
      : '';

  return `Exam intelligence: ${intel.targetExam} (${facts.totalQuestions}Q, ${facts.duration}min, ${marking}) in ${intel.daysToTarget} day(s) (${intel.phaseLabel}). Focus: ${intel.plannerFocus}${dualTrack}`;
}
