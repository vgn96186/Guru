export type ContentType = 'keypoints' | 'quiz' | 'story' | 'mnemonic' | 'teach_back' | 'error_hunt' | 'detective';

export type TopicStatus = 'unseen' | 'seen' | 'reviewed' | 'mastered';

export type Mood = 'energetic' | 'good' | 'okay' | 'tired' | 'stressed' | 'distracted';

export type SessionMode = 'normal' | 'sprint' | 'gentle' | 'deep' | 'external';

export interface Subject {
  id: number;
  name: string;
  shortCode: string;
  colorHex: string;
  inicetWeight: number;
  neetWeight: number;
  displayOrder: number;
}

export interface Topic {
  id: number;
  subjectId: number;
  parentTopicId?: number | null;
  name: string;
  subtopics: string[]; // This was already here, but let's keep it for compatibility or repurpose
  children?: TopicWithProgress[];
  estimatedMinutes: number;
  inicetPriority: number;
}

export interface TopicProgress {
  topicId: number;
  status: TopicStatus;
  confidence: number;
  lastStudiedAt: number | null;
  timesStudied: number;
  xpEarned: number;
  nextReviewDate: string | null;
  userNotes: string;
}

export interface TopicWithProgress extends Topic {
  progress: TopicProgress;
  subjectName: string;
  subjectCode: string;
  subjectColor: string;
  score?: number;
}

export interface StudySession {
  id: number;
  startedAt: number;
  endedAt: number | null;
  plannedTopics: number[];
  completedTopics: number[];
  totalXpEarned: number;
  durationMinutes: number | null;
  mood: Mood | null;
  mode: SessionMode;
}

export interface AgendaItem {
  topic: TopicWithProgress;
  contentTypes: ContentType[];
  estimatedMinutes: number;
}

export interface Agenda {
  items: AgendaItem[];
  totalMinutes: number;
  focusNote: string;
  mode: SessionMode;
  guruMessage: string;
}

export interface DailyLog {
  date: string;
  checkedIn: boolean;
  mood: Mood | null;
  totalMinutes: number;
  xpEarned: number;
  sessionCount: number;
}

export interface UserProfile {
  displayName: string;
  totalXp: number;
  currentLevel: number;
  streakCurrent: number;
  streakBest: number;
  dailyGoalMinutes: number;
  inicetDate: string;
  neetDate: string;
  preferredSessionLength: number;
  lastActiveDate: string | null;
  openrouterApiKey: string;
  notificationsEnabled: boolean;
  strictModeEnabled: boolean;
}

// AI Content shapes
export interface KeyPointsContent {
  type: 'keypoints';
  topicName: string;
  points: string[];
  memoryHook: string;
}

export interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

export interface QuizContent {
  type: 'quiz';
  topicName: string;
  questions: QuizQuestion[];
}

export interface StoryContent {
  type: 'story';
  topicName: string;
  story: string;
  keyConceptHighlights: string[];
}

export interface MnemonicContent {
  type: 'mnemonic';
  topicName: string;
  mnemonic: string;
  expansion: string[];
  tip: string;
}

export interface TeachBackContent {
  type: 'teach_back';
  topicName: string;
  prompt: string;
  keyPointsToMention: string[];
  guruReaction: string;
}

export interface ErrorHuntContent {
  type: 'error_hunt';
  topicName: string;
  paragraph: string;
  errors: Array<{ wrong: string; correct: string; explanation: string }>;
}

export interface DetectiveContent {
  type: 'detective';
  topicName: string;
  clues: string[];
  answer: string;
  explanation: string;
}

export type AIContent =
  | KeyPointsContent
  | QuizContent
  | StoryContent
  | MnemonicContent
  | TeachBackContent
  | ErrorHuntContent
  | DetectiveContent;

export interface AccountabilityMessage {
  title: string;
  body: string;
  scheduledFor: 'morning' | 'evening' | 'streak_warning';
}

export type SessionState =
  | 'planning'
  | 'agenda_reveal'
  | 'studying'
  | 'quiz'
  | 'topic_done'
  | 'session_done';

export interface LevelInfo {
  level: number;
  name: string;
  xpRequired: number;
  xpForNext: number;
  progress: number;
}
