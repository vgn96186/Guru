/** Re-exported from schemas — single source of truth. */
import type {
  ContentType,
  TopicStatus,
  Mood,
  SessionMode,
  StudyResourceMode,
  HarassmentTone,
  GuruFrequency,
  DailyLog,
} from '../schemas';
export type {
  ContentType,
  TopicStatus,
  Mood,
  SessionMode,
  StudyResourceMode,
  HarassmentTone,
  GuruFrequency,
  DailyLog,
};

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
  geminiKey?: string;
  huggingFaceToken?: string;
  huggingFaceTranscriptionModel?: string;
  transcriptionProvider?: 'auto' | 'groq' | 'huggingface' | 'cloudflare' | 'deepgram' | 'local';
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
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  falApiKey?: string;
  braveSearchApiKey?: string;
  /** Guru Chat default model id: `auto`, `local`, `groq/...`, OpenRouter model id, `gemini/...`, `cf/...`. */
  guruChatDefaultModel?: string;
  /**
   * Study image generation: `auto`, a ChatGPT/OpenAI image model id, a Gemini image model id,
   * an OpenRouter image model id, or a `@cf/...` Workers AI image model id.
   */
  imageGenerationModel?: string;
  /** Optional facts Guru should remember across chats (exam goals, weak areas, etc.). */
  guruMemoryNotes?: string;
  /**
   * When true (default) and a Gemini API key is available, structured JSON tasks use Gemini
   * native JSON + schema before falling back to text parsing.
   */
  preferGeminiStructuredJson?: boolean;
  deepseekKey?: string;
  /** GitHub Models API — fine-grained PAT with `models: read` (or classic PAT with models scope). */
  githubModelsPat?: string;
  /** Kilo gateway API key (OpenAI-compatible endpoint at api.kilo.ai). */
  kiloApiKey?: string;
  /** AgentRouter API key (OpenAI-compatible endpoint at agentrouter.org/v1). */
  agentRouterKey?: string;
  /** User-defined cloud LLM provider priority order. Empty = default order. */
  providerOrder?: ProviderId[];
  /** Deepgram API key for batch + live WebSocket transcription. */
  deepgramApiKey?: string;
  /** Persisted provider validation metadata used by Settings key status indicators. */
  apiValidation?: Partial<Record<ProviderId | 'deepgram' | 'fal' | 'brave', { verified: boolean; verifiedAt: number; fingerprint: string }>>;
  /** True when ChatGPT OAuth tokens are stored in secure store. */
  chatgptConnected?: boolean;
}

export type ProviderId =
  | 'groq'
  | 'github'
  | 'kilo'
  | 'deepseek'
  | 'agentrouter'
  | 'gemini'
  | 'gemini_fallback'
  | 'openrouter'
  | 'cloudflare'
  | 'chatgpt';

export const DEFAULT_PROVIDER_ORDER: ProviderId[] = [
  'chatgpt',
  'groq',
  'github',
  'kilo',
  'deepseek',
  'agentrouter',
  'gemini',
  'gemini_fallback',
  'openrouter',
  'cloudflare',
];

export const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  chatgpt: 'ChatGPT',
  groq: 'Groq',
  github: 'GitHub Models',
  kilo: 'Kilo',
  deepseek: 'DeepSeek',
  agentrouter: 'AgentRouter',
  gemini: 'Gemini',
  gemini_fallback: 'Gemini (Free)',
  openrouter: 'OpenRouter',
  cloudflare: 'Cloudflare',
};

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
  imageSearchQuery?: string;
  imageUrl?: string;
}

export interface QuizContent {
  type: 'quiz';
  topicName: string;
  questions: QuizQuestion[];
}

export type QuestionBankSource = 'content_card' | 'lecture_quiz' | 'mock_test' | 'live_lecture' | 'manual';

export interface QuestionBankItem {
  id: number;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  topicId: number | null;
  topicName: string;
  subjectName: string;
  source: QuestionBankSource;
  sourceId: string | null;
  imageUrl: string | null;
  isBookmarked: boolean;
  isMastered: boolean;
  timesSeen: number;
  timesCorrect: number;
  lastSeenAt: number | null;
  nextReviewAt: number | null;
  difficulty: number;
  createdAt: number;
}

export interface SaveQuestionInput {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  topicId?: number | null;
  topicName?: string;
  subjectName?: string;
  source: QuestionBankSource;
  sourceId?: string | null;
  imageUrl?: string | null;
}

export interface QuestionFilters {
  subjectName?: string;
  topicId?: number;
  isBookmarked?: boolean;
  isMastered?: boolean;
  dueForReview?: boolean;
  search?: string;
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

export type AIContent = (
  | KeyPointsContent
  | QuizContent
  | StoryContent
  | MnemonicContent
  | TeachBackContent
  | ErrorHuntContent
  | DetectiveContent
  | ManualContent
  | SocraticContent
) & { modelUsed?: string };

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
