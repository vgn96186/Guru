import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { ViewProps, ViewStyle } from 'react-native';

export type NodeData = {
  id: number;
  label: string;
  x: number;
  y: number;
  isCenter?: boolean;
  color?: string;
};

export type EdgeData = {
  sourceId: number;
  targetId: number;
  label?: string;
};

export type MindMapCanvasProps = {
  nodes: NodeData[];
  edges: EdgeData[];
  zoom: number;
  offsetX: number;
  offsetY: number;
  onNodePress?: (event: { nativeEvent: { nodeId: number } }) => void;
  onCanvasPan?: (event: { nativeEvent: { x: number; y: number } }) => void;
  onZoomChange?: (event: { nativeEvent: { zoom: number } }) => void;
} & ViewProps;

export type ChatMessageData = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
};

export type GuruChatListProps = {
  messages: ChatMessageData[];
  isStreaming?: boolean;
} & ViewProps;

export type FlashcardData = {
  id: string;
  front: string;
  back: string;
  isCloze?: boolean;
};

export type FlashcardProps = {
  card: FlashcardData;
  isFlipped?: boolean;
  onFlip?: (event: { nativeEvent: { isFlipped: boolean } }) => void;
} & ViewProps;

export type LoadingOrbProps = {
  size?: number;
  /** @deprecated Use intensityMode instead */
  orbEffect?: 'ripple' | 'liquid';
  /** Controls the turbulence intensity: 'calm' (resting), 'active' (default), or 'turbulent' (intense) */
  intensityMode?: 'calm' | 'active' | 'turbulent';
  /** Whether the orb animation is active (pauses when false) */
  isActive?: boolean;
} & ViewProps;

export type SubjectProgressData = {
  name: string;
  percent: number;
  color: string;
};

export type ProgressData = {
  coveragePercent: number;
  projectedScore: number;
  masteredCount: number;
  currentStreak: number;
  totalMinutes: number;
  weeklyMinutes: number[];
  subjectBreakdown: SubjectProgressData[];
  nodesCreated: number;
  cardsCreated: number;
};

export type ProgressDashboardProps = {
  data: ProgressData;
} & ViewProps;

export type StartButtonProps = {
  label?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
  onPress?: () => void;
} & ViewProps;

const NativeView: React.ComponentType<MindMapCanvasProps> =
  requireNativeViewManager('MindMapCanvas');

const NativeChatView: React.ComponentType<GuruChatListProps> =
  requireNativeViewManager('GuruChatList');

const NativeFlashcardView: React.ComponentType<FlashcardProps> =
  requireNativeViewManager('Flashcard');

const NativeLoadingOrbView: React.ComponentType<LoadingOrbProps> =
  requireNativeViewManager('LoadingOrb');

const NativeProgressDashboardView: React.ComponentType<ProgressDashboardProps> =
  requireNativeViewManager('ProgressDashboard');

const NativeStartButtonView: React.ComponentType<StartButtonProps> =
  requireNativeViewManager('StartButton');

export default function MindMapCanvas(props: MindMapCanvasProps) {
  return <NativeView {...props} />;
}

export function GuruChatList(props: GuruChatListProps) {
  return <NativeChatView {...props} />;
}

export function Flashcard(props: FlashcardProps) {
  return <NativeFlashcardView {...props} />;
}

export function LoadingOrb(props: LoadingOrbProps) {
  return <NativeLoadingOrbView {...props} />;
}

export function ProgressDashboard(props: ProgressDashboardProps) {
  return <NativeProgressDashboardView {...props} />;
}

export function StartButton(props: StartButtonProps) {
  return <NativeStartButtonView {...props} />;
}

export type OmniOrbProps = {
  state: {
    phase: 'booting' | 'calming' | 'settling' | 'button';
    label?: string;
    sublabel?: string;
    targetX?: number;
    targetY?: number;
    targetSize?: number;
    /** @deprecated Use intensityMode instead */
    orbEffect?: 'ripple' | 'liquid';
    intensityMode?: 'calm' | 'active' | 'turbulent';
  };
  onPress?: () => void;
} & ViewProps;

const NativeOmniOrbView: React.ComponentType<OmniOrbProps> = requireNativeViewManager('OmniOrb');

export function OmniOrb(props: OmniOrbProps) {
  return <NativeOmniOrbView {...props} />;
}

export type QuickStatsData = {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  streak: number;
  level: number;
  completedSessions: number;
};

export type QuickStatsBarProps = {
  data: QuickStatsData;
  onGoalPress?: () => void;
} & ViewProps;

const NativeQuickStatsBarView: React.ComponentType<QuickStatsBarProps> =
  requireNativeViewManager('QuickStatsBar');

export function QuickStatsBar(props: QuickStatsBarProps) {
  return <NativeQuickStatsBarView {...props} />;
}

export type QuizQuestionData = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type LectureAnalysisData = {
  subject: string | null;
  topics: string[];
  keyConcepts: string[];
  lectureSummary: string;
  estimatedConfidence: number;
};

export type LectureReturnData = {
  phase: 'intro' | 'transcribing' | 'results' | 'quiz' | 'quiz_done' | 'error';
  appName: string;
  durationMinutes: number;
  activeStage: string | null;
  stageMessage: string | null;
  stageDetail: string | null;
  progressPercent: number;
  progressLabel: string | null;
  analysis: LectureAnalysisData | null;
  quizQuestions: QuizQuestionData[];
  currentQ: number;
  selectedAnswer: number | null;
  score: number;
  errorMsg: string | null;
};

export const LectureReturnSheet: React.ComponentType<{
  data: LectureReturnData;
  onAction?: (event: { nativeEvent: { action: string; payload?: any } }) => void;
  style?: ViewStyle;
}> = requireNativeViewManager('LectureReturnSheet');

export const ActionHub: React.ComponentType<{
  onAction?: (event: { nativeEvent: { action: string; payload?: any } }) => void;
  style?: ViewStyle;
}> = requireNativeViewManager('ActionHub');

export type NextLectureData = {
  batchId: string;
  batchShortName: string;
  title: string;
  index: number;
  completedCount: number;
  totalCount: number;
  pct: number;
  subColor: string;
  batchColor: string;
  isBusy: boolean;
};

export const NextLecture: React.ComponentType<{
  data: NextLectureData;
  onAction?: () => void;
  onMarkDone?: () => void;
  style?: ViewStyle;
}> = requireNativeViewManager('NextLecture');
