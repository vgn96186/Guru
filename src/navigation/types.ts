import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Mood, SessionMode } from '../types';

export type RootStackParamList = {
  PunishmentMode: undefined;
  BedLock: undefined;
  DoomscrollInterceptor: undefined;
  BreakEnforcer: { durationSeconds: number };
  DeviceLink: undefined;
  DoomscrollGuide: undefined;
  Lockdown: { duration: number };
  CheckIn: undefined;
  Tabs: undefined;
  BrainDumpReview: undefined;
  SleepMode: undefined;
  WakeUp: undefined;
  LocalModel: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Session: {
    mood: Mood;
    mode?: SessionMode;
    forcedMinutes?: number;
    focusTopicId?: number;
    focusTopicIds?: number[];
    preferredActionType?: 'study' | 'review' | 'deep_dive';
  };
  LectureMode: { subjectId?: number };
  GuruChat: { topicName?: string; initialQuestion?: string } | undefined;
  MockTest: undefined;
  Review: undefined;
  NotesHub: undefined;
  NotesSearch: undefined;
  BossBattle: undefined;
  Inertia: undefined;
  ManualLog: { appId?: string };
  StudyPlan: undefined;
  DailyChallenge: undefined;
  FlaggedReview: undefined;
  TranscriptHistory: { noteId?: number } | undefined;
};

export type SyllabusStackParamList = {
  Syllabus: undefined;
  TopicDetail: { subjectId: number; subjectName: string; initialTopicId?: number; initialSearchQuery?: string };
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  SyllabusTab: NavigatorScreenParams<SyllabusStackParamList> | undefined;
  NotesTab: undefined;
  ChatTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  PlanTab: undefined;
  StatsTab: undefined;
  SettingsTab: undefined;
};
