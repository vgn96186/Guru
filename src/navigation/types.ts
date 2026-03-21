import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Mood, SessionMode } from '../types';

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
  StudyPlan: undefined;
  DailyChallenge: undefined;
  FlaggedReview: undefined;
  GlobalTopicSearch: undefined;
};

export type TreeStackParamList = {
  KnowledgeTree: undefined;
  Syllabus: undefined;
  TopicDetail: {
    subjectId: number;
    subjectName: string;
    initialTopicId?: number;
    initialSearchQuery?: string;
  };
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

export type VaultStackParamList = {
  VaultHome: undefined;
  NotesHub: undefined;
  NotesSearch: undefined;
  ManualNoteCreation: undefined;
  TranscriptHistory: { noteId?: number } | undefined;
  StudyPlan: undefined;
  Settings: undefined;
  DeviceLink: undefined;
  MenuHome: undefined;
};

export type MenuStackParamList = VaultStackParamList;

export type ChatStackParamList = {
  GuruChat: { topicName?: string; initialQuestion?: string } | undefined;
};

export type SettingsModalParamList = {
  Settings: undefined;
  DeviceLink: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  TreeTab: NavigatorScreenParams<TreeStackParamList> | undefined;
  VaultTab: NavigatorScreenParams<VaultStackParamList> | undefined;
  StatsTab: undefined;
};

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
  PomodoroQuiz: undefined;
  GuruChatModal: NavigatorScreenParams<ChatStackParamList> | undefined;
  SettingsModal: NavigatorScreenParams<SettingsModalParamList> | undefined;
};
