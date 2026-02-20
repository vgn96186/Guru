export type RootStackParamList = {
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
};

export type SyllabusStackParamList = {
  Syllabus: undefined;
  TopicDetail: { subjectId: number; subjectName: string };
};

export type TabParamList = {
  HomeTab: undefined;
  PlanTab: undefined;
  SyllabusTab: undefined;
  StatsTab: undefined;
  SettingsTab: undefined;
};
