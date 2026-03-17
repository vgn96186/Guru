export const XP_REWARDS = {
  TOPIC_UNSEEN: 150,
  TOPIC_REVIEW: 80,
  QUIZ_CORRECT: 20,
  QUIZ_PERFECT: 50,
  DAILY_CHECKIN: 25,
  STREAK_7: 200,
  STREAK_30: 1000,
  SESSION_COMPLETE: 100,
  CONFIDENCE_5: 75,
  TEACH_BACK: 120,
  ERROR_HUNT_CORRECT: 60,
  DETECTIVE_SOLVED: 100,
};

export const LEVELS = [
  { level: 1, name: 'Intern', xpRequired: 0 },
  { level: 2, name: 'House Officer', xpRequired: 500 },
  { level: 3, name: 'Junior Resident', xpRequired: 1500 },
  { level: 4, name: 'Senior Resident', xpRequired: 3500 },
  { level: 5, name: 'Registrar', xpRequired: 7000 },
  { level: 6, name: 'Specialist', xpRequired: 12000 },
  { level: 7, name: 'Consultant', xpRequired: 20000 },
  { level: 8, name: 'Professor', xpRequired: 32000 },
  { level: 9, name: 'HOD', xpRequired: 50000 },
  { level: 10, name: 'AIIMS Director', xpRequired: 75000 },
];

export const STREAK_MIN_MINUTES = 20;

/** Confidence level labels (1–3) for UI. */
export const CONFIDENCE_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Introduced',
  2: 'Understood',
  3: 'Can explain',
};

export const CONFIDENCE_LABELS_WITH_EMOJI: Record<1 | 2 | 3, string> = {
  1: '🌱 Introduced',
  2: '🌿 Understood',
  3: '🌳 Can explain',
};

export const MOOD_LABELS: Record<string, { label: string; emoji: string; desc: string }> = {
  energetic: { label: 'Energetic', emoji: '🔥', desc: 'Ready to tackle hard topics' },
  good: { label: 'Good', emoji: '😊', desc: 'Normal session' },
  okay: { label: 'Okay', emoji: '😐', desc: 'Mix of easy and hard' },
  tired: { label: 'Tired', emoji: '😴', desc: 'Light review only' },
  stressed: { label: 'Stressed', emoji: '😰', desc: 'Gentle mode, no pressure' },
  distracted: { label: 'Distracted', emoji: '🦋', desc: '5-question sprint only' },
};
