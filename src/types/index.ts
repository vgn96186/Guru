/** Re-exported from schemas — single source of truth. */
import type {
  ContentType,
  TopicStatus,
  Mood,
  SessionMode,
  StudyResourceMode,
  HarassmentTone,
  GuruFrequency,
  DailyLog as CoreDailyLog,
} from '../schemas';
export type {
  ContentType,
  TopicStatus,
  Mood,
  SessionMode,
  StudyResourceMode,
  HarassmentTone,
  GuruFrequency,
};

export interface DailyLog extends CoreDailyLog {
  energyScore?: number | null;
}

export interface Subject {
  id: number;
  name: string;
  shortCode: string;
  colorHex: string;
  inicetWeight: number;
  neetWeight: number;
  displayOrder: number;
  topics?: TopicWithProgress[];
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

  fsrsDue: string | null;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsElapsedDays: number;
  fsrsScheduledDays: number;
  fsrsReps: number;
  fsrsLapses: number;
  fsrsState: number;
  fsrsLastReview: string | null;
  wrongCount: number;
  isNemesis: boolean;
  masteryLevel?: number;
  btrStage?: number;
  dbmciStage?: number;
  marrowAttemptedCount?: number;
  marrowCorrectCount?: number;
}

export interface TopicWithProgress extends Topic {
  progress: TopicProgress;
  subjectName: string;
  subjectCode: string;
  subjectColor: string;
  score?: number;
}

export interface TopicConnection {
  id: number;
  fromTopicId: number;
  toTopicId: number;
  relationType: string;
  label: string | null;
}

export interface TreeBadge {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'accent';
}

export interface TreeNode {
  topicId: number;
  subjectId: number;
  parentTopicId: number | null;
  name: string;
  depth: number;
  estimatedMinutes: number;
  inicetPriority: number;
  progress: TopicProgress;
  badges: {
    overlay: TreeBadge | null;
    source: TreeBadge | null;
  };
  children: TreeNode[];
}

export interface TreeSubjectBranch {
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  subjectColor: string;
  roots: TreeNode[];
}

export interface TreeConnectionView {
  id: number;
  fromTopicId: number;
  toTopicId: number;
  relationType: string;
  label: string | null;
}

export interface TreeViewModel {
  subjects: TreeSubjectBranch[];
  connections: TreeConnectionView[];
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
  skipBreaks?: boolean;
}

export interface UserProfile {
  displayName: string;
  totalXp: number;
  currentLevel: number;
  streakCurrent: number;
  streakBest: number;
  dailyGoalMinutes: number;
  examType: 'INICET' | 'NEET';
  inicetDate: string;
  neetDate: string;
  preferredSessionLength: number;
  lastActiveDate: string | null;
  focusAudioEnabled?: boolean;
  visualTimersEnabled?: boolean;
  faceTrackingEnabled?: boolean;
  syncCode: string | null;
  openrouterApiKey: string; // Legacy API key field (kept for backward compatibility)
  openrouterKey: string; // Actual OpenRouter key for free model fallbacks
  groqApiKey: string; // Groq API key for fast cloud inference fallback
  huggingFaceToken?: string;
  huggingFaceTranscriptionModel?: string;
  transcriptionProvider?: 'auto' | 'groq' | 'huggingface' | 'local';
  notificationsEnabled: boolean;
  strictModeEnabled: boolean;
  bodyDoublingEnabled: boolean;
  blockedContentTypes: ContentType[];
  idleTimeoutMinutes: number;
  breakDurationMinutes: number;
  notificationHour: number;
  guruFrequency?: GuruFrequency;
  focusSubjectIds: number[];
  quizCorrectCount?: number;
  lastBackupDate?: string | null;
  useLocalModel?: boolean;
  localModelPath?: string | null;
  useLocalWhisper?: boolean;
  localWhisperPath?: string | null;
  quickStartStreak?: number;
  studyResourceMode?: StudyResourceMode;
  customSubjectLoadMultipliers?: Record<string, number>;
  harassmentTone?: HarassmentTone;
  backupDirectoryUri?: string | null;
  pomodoroEnabled?: boolean;
  pomodoroIntervalMinutes?: number;
  homeChatEnabled?: boolean;
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

export interface ManualContent {
  type: 'manual';
  topicName: string;
}

export interface SocraticQuestion {
  question: string;
  answer: string;
  whyItMatters: string;
}

export interface SocraticContent {
  type: 'socratic';
  topicName: string;
  questions: SocraticQuestion[];
}

export type AIContent =
  | KeyPointsContent
  | QuizContent
  | StoryContent
  | MnemonicContent
  | TeachBackContent
  | ErrorHuntContent
  | DetectiveContent
  | ManualContent
  | SocraticContent;

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
