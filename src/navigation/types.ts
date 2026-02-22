export type RootStackParamList = {
  BreakEnforcer: { durationSeconds: number };
  DeviceLink: undefined;
  DoomscrollGuide: undefined;
  Lockdown: { duration: number };
  CheckIn: undefined;
  Tabs: undefined;
  BrainDumpReview: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Session: { mood: string; mode?: string };
  LectureMode: { subjectId?: number };
  MockTest: undefined;
  Review: undefined;
  NotesSearch: undefined;
  BossBattle: undefined;
  Inertia: undefined;
  ManualLog: { appId?: string };
  StudyPlan: undefined;
  DailyChallenge: undefined;
  FlaggedReview: undefined;
};

export type SyllabusStackParamList = {
  Syllabus: undefined;
  TopicDetail: { subjectId: number; subjectName: string };
};

export type TabParamList = {
  HomeTab: undefined;
  SyllabusTab: undefined;
  StatsTab: undefined;
  SettingsTab: undefined;
};
