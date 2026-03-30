import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Mood, SessionMode } from '../types';

export interface PomodoroBreakQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface PomodoroBreakPayload {
  source: 'external_lecture';
  appName: string;
  subject?: string;
  topics?: string[];
  summary?: string;
  keyConcepts?: string[];
  questions?: PomodoroBreakQuestion[];
}

export type RootStackParamList = {
  PunishmentMode: undefined;
  BedLock: undefined;
  DoomscrollInterceptor: undefined;
  BreakEnforcer: { durationSeconds: number };
  DoomscrollGuide: undefined;
  Lockdown: { duration: number };
  CheckIn: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  BrainDumpReview: undefined;
  SleepMode: undefined;
  WakeUp: undefined;
  LocalModel: undefined;
  PomodoroQuiz: { breakPayload?: PomodoroBreakPayload } | undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Session: {
    mood: Mood;
    resume?: boolean;
    mode?: SessionMode;
    forcedMinutes?: number;
    focusTopicId?: number;
    focusTopicIds?: number[];
    preferredActionType?: 'study' | 'review' | 'deep_dive';
  };
  LectureMode: { subjectId?: number };
  MockTest: undefined;
  Review: undefined;
  BossBattle: undefined;
  Inertia: undefined;
  ManualLog: { appId?: string };
  DailyChallenge: undefined;
  FlaggedReview: undefined;
  GlobalTopicSearch: undefined;
};

export type SyllabusStackParamList = {
  Syllabus: undefined;
  TopicDetail: {
    subjectId: number;
    subjectName: string;
    initialTopicId?: number;
    initialSearchQuery?: string;
  };
};

export type ChatStackParamList = {
  GuruChat:
    | {
        topicName?: string;
        /** Syllabus leaf topic id when opened from Topic detail / content flows */
        topicId?: number;
        threadId?: number;
        groundingTitle?: string;
        groundingContext?: string;
        initialQuestion?: string;
        autoFocusComposer?: boolean;
      }
    | undefined;
};

export type MenuStackParamList = {
  MenuHome: undefined;
  StudyPlan: undefined;
  Stats: undefined;
  Flashcards: { topicId?: number } | undefined;
  MindMap: undefined;
  Settings: undefined;
  DeviceLink: undefined;
  NotesHub: undefined;
  NotesSearch: undefined;
  ManualNoteCreation: undefined;
  TranscriptHistory: { noteId?: number } | undefined;
  RecordingVault: undefined;
  ImageVault: undefined;
  NotesVault: undefined;
  TranscriptVault: undefined;
  QuestionBank: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  SyllabusTab: NavigatorScreenParams<SyllabusStackParamList> | undefined;
  ActionHubTab: undefined;
  ChatTab: NavigatorScreenParams<ChatStackParamList> | undefined;
  MenuTab: NavigatorScreenParams<MenuStackParamList> | undefined;
};
