export type RootStackParamList = {
  CheckIn: undefined;
  Tabs: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Session: { mood: string; mode?: string };
  LectureMode: { subjectId?: number };
  QuizBreak: { topicId: number; sessionId: number };
  MockTest: undefined;
  Review: undefined;
  NotesSearch: undefined;
  BossBattle: undefined;
  Inertia: undefined;
  ManualLog: { appId?: string };
  StudyPlan: undefined;
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
